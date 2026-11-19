import type { Application, Ticker } from "pixi.js";
import {
  BOT_SKILLS,
  boostAt,
  bridgeAt,
  buildTrack,
  CUP_LEGS,
  HAZARD_SPECS,
  LAP_COUNTS,
  isFrozen,
  MAX_PLAYERS,
  pointAt,
  SCORE_TARGETS,
  SUDDEN_DEATH_AT,
  TRACK_WIDTH,
  VIEW,
  WORLD,
  type Award,
  type Camera,
  type CarSnap,
  type ClientMsg,
  type GameEvent,
  type Hazard,
  type ServerMsg,
  type Track,
} from "@neon/sim";
import { audio, audioSettingsWidget, dangerLevel, screenPan, type Mood } from "../audio";
import type { ControllerHub } from "../controller/hub";
import type { ControllerMenus } from "../controller/menu-bridge";
import { padPrompt } from "../controller/glyphs";
import { displaySettingsWidget } from "../display-widget";
import { h } from "../dom";
import { createMinimap } from "../minimap";
import { StepSnaps } from "./step-snaps";
import { TrackFollower } from "../net/track-follower";
import { IMPACT } from "../render/impact";
import { GLITCH } from "../render/glitch-math";
import { css, playerColor } from "../render/palette";
import { createRenderer } from "../render/renderer";
import type { AimView, CarView } from "../render/types";
import { createKeyNav } from "../shell/keynav";
import { notify } from "../shell/notice";
import { bindHoverSound } from "../shell/ui-sounds";
import { countdownLabel, createCountdown } from "../ui/countdown";
import { EMOTE_GLYPHS, floatEmote } from "../ui/emotes";
import { formatDelta, formatScore, raceName } from "../ui/format";
import { hazardIcon } from "../ui/hazard-icons";
import { trackThumbs } from "../ui/lobby-settings";
import { cupTable, isLegEnd, tallyLine } from "../ui/match-end";
import { createPodium, finalStandings } from "../ui/podium";
import { selector } from "../ui/selector";
import { createStreamHud } from "../ui/stream-hud";
import { cupMessages, modeWin, RANDOM_TRACK, trackChoice, trackChoices, tracksFor } from "./lobby-choices";
import { LocalMatch, type LocalNotice, type RoomInfo } from "./local-match";
import "../online.css";
import "./local.css";

const DRIFT_LATERAL = 120;
const worldCamera: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: WORLD.width / VIEW.width };
const MOODS: Record<RoomInfo["phase"], Mood> = { lobby: "lobby", sketch: "lobby", countdown: "race", race: "race", roundEnd: "race", matchEnd: "lobby" };
const HAZARD_NAMES = { block: "Block", slow: "Slow", freeze: "Freeze" } as const;

export interface LocalPlayOptions {
  controllers: ControllerHub;
  menus: ControllerMenus;
  /** Quits the whole game; only the Steam build can. */
  quitGame?: () => void;
}

export function startLocalPlay(app: Application, ui: HTMLElement, opts: LocalPlayOptions, onExit: () => void): () => void {
  const renderer = createRenderer(app);
  const snaps = new StepSnaps();
  const follower = new TrackFollower();
  const minimap = createMinimap(ui);
  const audioWidget = audioSettingsWidget();
  const displayWidget = displaySettingsWidget();
  // Mid-race the sound and display settings live in the pause menu, out of the way of steering.
  const pauseAudioWidget = audioSettingsWidget();
  const pauseDisplayWidget = displaySettingsWidget();
  const thumbs = trackThumbs();

  let info: RoomInfo | null = null;
  let track: Track | null = null;
  let trackName = "";
  let roundWinner: string | null = null;
  let roundResults: { id: string; delta: number }[] = [];
  let matchWinner: string | null = null;
  let cupWinner: string | null = null;
  let awards: Award[] = [];
  let heard: { cars: CarView[]; camera: Camera; line: number | null } | null = null;
  let lastCountdown = -1;
  let ended = false;
  let roomReceivedAt = performance.now();
  let lastFrameAt = performance.now();
  let pauseShownFor: string | null = null;
  const hazardsSeen = new Map<number, boolean>();

  const root = h("div", { class: "online local" });
  const top = h("div", { class: "online-top" });
  const topInfo = h("div", { class: "online-top-info" });
  top.append(topInfo, audioWidget.el, displayWidget.el);
  const center = h("div", { class: "online-center" });
  const bottom = h("div", { class: "online-bottom local-bottom" });
  const pauseLayer = h("div", { class: "local-pause" });
  const live = { goal: h("span"), sudden: h("div", { class: "sudden" }) };
  root.append(top, center, bottom);
  const countdown = createCountdown(root);
  const podium = createPodium(root, { click: audio.sfx.click, reveal: audio.sfx.reveal });
  const stream = createStreamHud(root, top, (id) => shortName(id));
  // The pause menu sits outside the race's root so the root's focus restoring leaves it alone.
  ui.append(root, pauseLayer);

  const match = new LocalMatch({ onMessage: (msg) => receive(msg) });
  const player = (id: string | null | undefined) => info?.players.find((p) => p.id === id);
  const nameOf = (id: string | null | undefined) => player(id)?.name ?? "Someone";
  const shortName = (id: string | null | undefined) => {
    const p = player(id);
    return p ? raceName(p) : "Someone";
  };
  const entry = (id: string, value: string) => ({ name: shortName(id), color: css(playerColor(player(id)?.color ?? 0)), value });
  const isSeat = (id: string) => match.seats.some((s) => s.playerId === id);
  // The Room's clock at what's drawn, for countdowns, cooldowns and hazard animations.
  const serverNow = () => snaps.time(match.blend());

  const exit = () => {
    if (ended) return;
    ended = true;
    onExit();
  };

  // Menus only take the arrow keys in the lobby and on the podium; in a race they steer.
  const inMenus = () => !match.pausedBy() && (info?.phase === "lobby" || info?.phase === "matchEnd");
  const unbindNav = createKeyNav(root, { enabled: inMenus, start: ".local-settings .selector, .podium-actions button", onMove: audio.sfx.hover });
  const unbindPauseNav = createKeyNav(pauseLayer, { enabled: () => !!match.pausedBy(), onMove: audio.sfx.hover });
  const unbindHover = bindHoverSound(root, audio.sfx.hover, inMenus);
  const releaseMenus = opts.menus.restrict((id) => match.menuControllers()(id));
  const unsubscribe = opts.controllers.subscribe((frame) => {
    for (const notice of match.controllers(frame)) onNotice(notice);
    drawPause();
  });

  function receive(msg: ServerMsg) {
    switch (msg.t) {
      case "room": {
        const prev = info?.phase;
        info = msg;
        roomReceivedAt = performance.now();
        if (prev !== msg.phase) enterPhase();
        drawUI();
        break;
      }
      case "track":
        track = buildTrack(msg.raw, msg.features);
        trackName = msg.name;
        notify(`Track: ${msg.name}`);
        snaps.clear();
        break;
      case "snap":
        snaps.push(msg);
        hazardSounds(msg);
        break;
      case "event":
        onEvent(msg.event);
        break;
    }
  }

  function onNotice(notice: LocalNotice) {
    switch (notice.kind) {
      case "joined":
        audio.sfx.confirm();
        break;
      case "left":
        audio.sfx.click();
        break;
      case "needsRacers":
        notify("Add a bot or another Seat to race", "error");
        break;
      case "disconnected":
        notify(`Seat ${notice.seat.number} controller disconnected`, "error", 5000);
        break;
      case "reclaimed":
        notify(`Seat ${notice.seat.number} (${notice.seat.name}) is back`);
        break;
      case "hazard":
        if (notice.ready) audio.sfx.hazardPlaced();
        break;
    }
    drawUI();
  }

  function enterPhase() {
    if (!info) return;
    // Leave nothing focused when a race starts, so Enter or Space can't press a button mid-race.
    if (info.phase === "countdown" && document.activeElement instanceof HTMLElement && root.contains(document.activeElement)) document.activeElement.blur();
    if (info.phase === "lobby") {
      matchWinner = null;
      cupWinner = null;
      awards = [];
      track = null;
      snaps.clear();
    }
    if (info.phase === "countdown") {
      renderer.glitch(GLITCH.phase);
      roundResults = [];
    }
    stream.phase(info.phase, "HOME");
    if (info.phase === "race") audio.sfx.go();
    if (info.phase !== "countdown") countdown.show(info.phase === "race" ? "GO" : null);
    if (info.phase === "roundEnd") podium.round(roundWinner && nameOf(roundWinner), roundResults.slice(0, 3).map((r) => entry(r.id, formatDelta(r.delta))));
    else if (info.phase === "matchEnd") showMatchEnd(info);
    else podium.hide();
    if (info.phase !== "race") audio.danger(0);
  }

  function showMatchEnd(i: RoomInfo) {
    renderer.glitch(GLITCH.matchEnd);
    const rules = i.win.kind === "laps" ? `${i.win.laps} laps of ${trackName}` : `First to ${i.win.target} on ${trackName}`;
    const tally = tallyLine(i.players);
    const cards = awards.map(({ id, ...a }) => ({ ...a, winner: entry(id, "") }));
    if (i.cup) {
      const title = isLegEnd(i) ? `${shortName(matchWinner)} takes leg ${i.leg}` : `${shortName(cupWinner)} wins the cup!`;
      podium.match(title, [`Leg ${i.leg} of ${i.cup} · ${rules}`, tally].filter(Boolean).join(" — "), cupTable(i.players).map((p) => entry(p.id, `${p.cupPoints} pts`)), isLegEnd(i) ? [] : cards);
    } else {
      podium.match(`${shortName(matchWinner)} wins!`, [rules, tally].filter(Boolean).join(" — "), finalStandings(i.players, matchWinner).map((p) => entry(p.id, formatScore(p.score))), cards);
    }
    podium.actions(
      h("button", { class: "big", onclick: () => match.asEverySeat({ t: "rematch", in: true }) }, isLegEnd(i) ? "Next leg" : "Rematch"),
      h("button", { onclick: () => match.asHost({ t: "again" }) }, "Change settings"),
      h("button", { onclick: () => exit() }, "Main menu"),
      h("p", { class: "hint pad-prompts" }, padPrompt("a", "Choose")),
    );
  }

  function onEvent(event: GameEvent) {
    stream.event(event);
    switch (event.kind) {
      case "emote": {
        const color = css(playerColor(player(event.id)?.color ?? 0));
        stream.emote(nameOf(event.id), color, EMOTE_GLYPHS[event.emote]);
        floatEmote(root, event.emote, nameOf(event.id), color);
        break;
      }
      case "eliminated": {
        const car = snaps.latest()?.cars.find((c) => c.id === event.id);
        const color = playerColor(player(event.id)?.color ?? 0);
        if (car && event.reason === "fell") renderer.fall({ ...car, color });
        else if (car) renderer.explode(car.x, car.y, color);
        if (car) renderer.impact(car.x, car.y, IMPACT.eliminated);
        audio.sfx.eliminated(event.reason, { you: false, pan: car && heard ? screenPan(car, heard.camera) : 0 });
        if (isSeat(event.id)) stream.alert(`${nameOf(event.id)} is out - aim with the stick, A drops a hazard, L1/R1 switch, d-pad emotes`);
        break;
      }
      case "roundScored":
        roundResults = event.results;
        stream.dismissAlert();
        break;
      case "roundWon":
        roundWinner = event.id;
        if (event.id && isSeat(event.id)) audio.sfx.roundWin();
        break;
      case "matchWon":
        matchWinner = event.id;
        audio.sfx.matchWin();
        break;
      case "awards":
        awards = event.awards;
        break;
      case "cupWon":
        cupWinner = event.id;
        break;
    }
    drawUI();
  }

  const tick = (_ticker: Ticker) => {
    const now = performance.now();
    match.step((now - lastFrameAt) / 1000);
    lastFrameAt = now;
    render();
    updateLive();
    updateAudio();
    stream.update(track, heard, serverNow());
  };
  app.ticker.add(tick);

  function render() {
    const phase = info?.phase ?? "lobby";
    const now = serverNow();
    const sampled = phase === "lobby" ? null : snaps.sample(match.blend());
    if (!sampled) {
      heard = null;
      renderer.render({ camera: worldCamera, track: phase === "matchEnd" ? track : null, trackName: phase === "matchEnd" && track ? trackName : null, cars: [], hazards: [], now });
      minimap.update(null, [], null);
      return;
    }
    const hazards = sampled.snap.hazards;
    const cars = sampled.cars.map((c) => carView(c, hazards, now));
    heard = { cars, camera: sampled.camera, line: sampled.line };
    renderer.render({ camera: sampled.camera, track, trackName: track ? trackName : null, cars, hazards, now, aims: phase === "race" ? aims(now) : [], dangerLine: sampled.line, contact: true });
    minimap.update(track, cars, sampled.camera, sampled.line);
  }

  function aims(now: number): AimView[] {
    const cooldowns = snaps.latest()?.cooldowns ?? {};
    return match.allCursors().map(({ seat, cursor }) => ({
      x: cursor.x,
      y: cursor.y,
      kind: cursor.kind,
      radius: HAZARD_SPECS[cursor.kind].radius,
      ready: now >= (cooldowns[seat.playerId]?.[cursor.kind] ?? 0),
      tint: playerColor(seat.color),
    }));
  }

  function carView(snap: CarSnap, hazards: Hazard[], now: number): CarView {
    const lateral = -snap.vx * Math.sin(snap.angle) + snap.vy * Math.cos(snap.angle);
    const p = player(snap.id);
    const at = track ? follower.follow(track, snap.id, snap.x, snap.y) : null;
    return {
      id: snap.id,
      name: p ? raceName(p) : "",
      color: playerColor(p?.color ?? 0),
      x: snap.x,
      y: snap.y,
      angle: snap.angle,
      speed: Math.hypot(snap.vx, snap.vy),
      drifting: Math.abs(lateral) > DRIFT_LATERAL,
      boosting: snap.alive && !!at && at.dist <= TRACK_WIDTH / 2 && boostAt(track!, at.s),
      s: at?.s,
      upper: !!at && bridgeAt(track!, at.s),
      alive: snap.alive,
      frozen: isFrozen(snap.id, hazards, now),
      isYou: false,
    };
  }

  function updateAudio() {
    const phase = info?.phase ?? "lobby";
    // Paused, the music holds its place and the race goes quiet; the pause menu's own clicks still sound.
    const paused = !!match.pausedBy();
    audio.music.setPaused(paused);
    if (paused) {
      audio.engines.update([], heard?.camera ?? worldCamera);
      audio.danger(0);
      return;
    }
    audio.music.setMood(phase === "race" && serverNow() > SUDDEN_DEATH_AT ? "suddenDeath" : MOODS[phase]);
    audio.engines.update(heard && (phase === "race" || phase === "countdown") ? heard.cars : [], heard?.camera ?? worldCamera);
    audio.music.setIntensity(phase === "race" ? 0.6 : phase === "countdown" ? 0.25 : 0.2);
    const line = phase === "race" && track && heard?.line != null ? pointAt(track, heard.line) : null;
    const seatCars = heard?.cars.filter((c) => c.alive && isSeat(c.id)) ?? [];
    const danger = line ? Math.max(0, ...seatCars.map((c) => dangerLevel(Math.hypot(c.x - line[0], c.y - line[1])))) : 0;
    audio.danger(danger);
    renderer.danger(danger);
  }

  function hazardSounds(snap: Extract<ServerMsg, { t: "snap" }>) {
    const current = new Set<number>();
    for (const hz of snap.hazards) {
      current.add(hz.id);
      const armed = snap.now >= hz.armsAt;
      const seen = hazardsSeen.get(hz.id);
      if (seen === undefined && !armed) {
        audio.sfx.hazardArming(hz.armsAt - snap.now);
        renderer.hack(hz);
      }
      if (armed && seen === false) audio.sfx.hazardActivate(hz.kind, heard ? screenPan(hz, heard.camera) : 0);
      hazardsSeen.set(hz.id, armed);
    }
    for (const id of hazardsSeen.keys()) if (!current.has(id)) hazardsSeen.delete(id);
  }

  function updateLive() {
    if (!info) return;
    const remaining = Math.max(0, info.remaining - (performance.now() - roomReceivedAt) / 1000);
    if (info.phase === "countdown" && !match.pausedBy()) {
      const n = Math.ceil(remaining);
      countdown.show(countdownLabel(remaining));
      if (n !== lastCountdown && n > 0) audio.sfx.countdownTick();
      lastCountdown = n;
    }
    live.goal.textContent = info.win.kind === "laps" ? `Lap ${snaps.latest()?.lap ?? 1}/${info.win.laps}` : `First to ${info.win.target}`;
    live.sudden.textContent = info.phase === "race" && serverNow() > SUDDEN_DEATH_AT ? "SUDDEN DEATH - the line is closing in" : "";
    drawKnockedOut();
  }

  function drawUI() {
    if (!info) return;
    root.classList.toggle("local-racing", info.phase !== "lobby" && info.phase !== "matchEnd");
    const players = [...info.players].sort((a, b) => b.score - a.score);
    const snapCars = new Map(snaps.latest()?.cars.map((c) => [c.id, c]) ?? []);
    const racing = info.phase === "race" || info.phase === "roundEnd";
    topInfo.replaceChildren(
      h("div", { class: "code" }, "Local play"),
      h("div", { class: "round" }, info.phase !== "lobby" ? `Round ${info.round} · ` : "", info.phase !== "lobby" ? live.goal : null),
      h(
        "div",
        { class: "scores" },
        ...players.map((p) =>
          h(
            "span",
            { class: `score${racing && snapCars.get(p.id)?.alive === false ? " out" : ""}`, style: `--c:${css(playerColor(p.color))}` },
            h("span", { class: "name" }, raceName(p)),
            h("span", { class: "pts" }, formatScore(p.score)),
          ),
        ),
      ),
    );
    center.replaceChildren(...(info.phase === "lobby" ? [lobbyPanel(info)] : info.phase === "countdown" || info.phase === "race" ? [live.sudden] : []));
  }

  function lobbyPanel(i: RoomInfo): HTMLElement {
    const host = match.hostSeat();
    const disabled = host === undefined;
    const bots = match.bots();
    const changed = () => audio.sfx.click();
    const asHost = (...msgs: ClientMsg[]) => {
      for (const msg of msgs) match.asHost(msg);
      changed();
    };
    const win = i.win;
    const count =
      win.kind === "laps"
        ? selector({ label: "Laps", options: LAP_COUNTS, value: win.laps, disabled, onChange: (laps) => asHost({ t: "winCondition", kind: "laps", laps }) })
        : selector({ label: "Points", options: SCORE_TARGETS, value: win.target, disabled, onChange: (target) => asHost({ t: "winCondition", kind: "score", target }) });
    const settings = h(
      "div",
      { class: "local-settings" },
      selector({ label: "Mode", options: ["laps", "score"] as const, value: win.kind, format: (k) => (k === "laps" ? "Laps" : "Points"), disabled, onChange: (kind) => asHost({ t: "winCondition", ...modeWin(kind) }) }),
      count,
      selector({ label: "Cup", options: CUP_LEGS, value: i.cup, format: (legs) => (legs ? `${legs} tracks` : "Off"), disabled, onChange: (legs) => asHost(...cupMessages(legs, i.tracks)) }),
      selector({ label: "Track", options: trackChoices(i.cup), value: trackChoice(i.tracks), format: trackLabel, disabled, onChange: (choice) => asHost(tracksFor(choice)) }),
      selector({ label: "Bots", options: Array.from({ length: bots.max + 1 }, (_, n) => n), value: bots.count, format: (n) => (n ? String(n) : "None"), wrap: false, disabled, onChange: (n) => (match.setBots(n, bots.skill), changed()) }),
      selector({ label: "Bot skill", options: BOT_SKILLS, value: bots.skill, format: (skill) => skill[0]!.toUpperCase() + skill.slice(1), disabled, onChange: (skill) => (match.setBots(bots.count, skill), changed()) }),
      h("button", { class: "selector local-menu", onclick: () => exit() }, h("span", { class: "selector-label" }, "Main menu")),
    );
    return h(
      "div",
      { class: "panel lobby local-lobby" },
      h("div", { class: "lobby-head" }, h("h1", {}, "Local play"), h("span", { class: "hint" }, host ? `${host.name} is the Host - their controller picks the settings` : "Press A on a controller to take a Seat")),
      settings,
      h("div", { class: "local-seats" }, ...Array.from({ length: MAX_PLAYERS }, (_, n) => seatCard(i, i.players[n] ?? null))),
      h("div", { class: "pad-prompts" }, padPrompt("start", "Host starts"), padPrompt("b", "Leave")),
    );
  }

  function trackLabel(choice: string): string | Node {
    if (choice === RANDOM_TRACK) return "Random";
    const thumb = thumbs.get(choice);
    return h("span", { class: "local-track" }, thumb ?? null, h("span", {}, choice));
  }

  function seatCard(i: RoomInfo, p: RoomInfo["players"][number] | null): HTMLElement {
    if (!p) return h("div", { class: "local-seat open" }, padPrompt("a", "Join"));
    const seat = match.seats.find((s) => s.playerId === p.id);
    const isHost = p.id === i.hostId;
    const skill = p.bot ? (p.name.match(/\((\w+)\)$/)?.[1] ?? "") : "";
    return h(
      "div",
      { class: `local-seat${isHost ? " host" : ""}`, style: `--c:${css(playerColor(p.color))}` },
      h("span", { class: "local-seat-tag" }, seat ? `Seat ${seat.number}${isHost ? " ★" : ""}` : `Bot · ${skill}`),
      h("span", { class: "local-seat-name" }, raceName(p)),
      p.wins ? h("span", { class: "local-seat-wins" }, `🏆 ${p.wins}`) : null,
      seat ? h("span", { class: "local-seat-prompt" }, isHost ? padPrompt("start", "Start") : padPrompt("b", "Leave")) : null,
    );
  }

  function drawKnockedOut() {
    const phase = info?.phase;
    const cursors = phase === "race" ? match.allCursors() : [];
    const key = cursors.map(({ seat, cursor }) => `${seat.playerId}:${cursor.kind}`).join(",");
    if (bottom.dataset.key === key) return updateCooldowns();
    bottom.dataset.key = key;
    bottom.replaceChildren(
      ...cursors.map(({ seat, cursor }) => {
        const card = h(
          "div",
          { class: "local-aim", style: `--c:${css(playerColor(seat.color))}` },
          h("span", { class: "local-aim-name" }, seat.name),
          hazardIcon(cursor.kind),
          h("span", { class: "local-aim-kind" }, HAZARD_NAMES[cursor.kind]),
          h("span", { class: "local-aim-wait" }),
        );
        card.dataset.seat = seat.playerId;
        card.dataset.kind = cursor.kind;
        return card;
      }),
      ...(cursors.length ? [h("div", { class: "pad-prompts local-aim-help" }, padPrompt("leftStick", "Aim"), padPrompt("a", "Drop"), padPrompt("leftBumper", ""), padPrompt("rightBumper", "Switch"), padPrompt("dpad", "Emote"))] : []),
    );
    updateCooldowns();
  }

  function updateCooldowns() {
    const latest = snaps.latest();
    if (!latest) return;
    const now = serverNow();
    for (const el of bottom.querySelectorAll<HTMLElement>(".local-aim")) {
      const seatId = el.dataset.seat!;
      const kind = el.dataset.kind as keyof typeof HAZARD_NAMES;
      const left = Math.max(0, (latest.cooldowns[seatId]?.[kind] ?? 0) - now);
      el.classList.toggle("ready", left === 0);
      el.querySelector(".local-aim-wait")!.textContent = left > 0 ? `${Math.ceil(left)}s` : "";
    }
  }

  function drawPause() {
    const pauser = match.pausedBy();
    const key = pauser ? pauser.playerId : null;
    if (key === pauseShownFor) return;
    pauseShownFor = key;
    if (!pauser) {
      pauseLayer.replaceChildren();
      pauseLayer.classList.remove("open");
      return;
    }
    const quit = opts.quitGame;
    const resume = h("button", { class: "nr-btn primary big", onclick: () => match.resume() }, "Resume");
    pauseLayer.replaceChildren(
      h(
        "div",
        { class: "nr-panel local-pause-card", style: `--c:${css(playerColor(pauser.color))}` },
        h("h2", {}, "Paused"),
        h("p", { class: "hint" }, `${pauser.name} (Seat ${pauser.number}) has the menu`),
        resume,
        h("button", { class: "nr-btn", onclick: () => match.backToLobby() }, "Back to lobby"),
        quit ? h("button", { class: "nr-btn", onclick: () => quit() }, "Quit game") : h("button", { class: "nr-btn", onclick: () => exit() }, "Main menu"),
        h("div", { class: "local-pause-settings" }, pauseAudioWidget.el, pauseDisplayWidget.el),
        h("div", { class: "pad-prompts" }, padPrompt("a", "Choose"), padPrompt("b", "Resume")),
      ),
    );
    pauseLayer.classList.add("open");
    resume.focus({ preventScroll: true });
  }

  info = match.room();
  drawUI();

  return () => {
    ended = true;
    unsubscribe();
    releaseMenus();
    unbindNav();
    unbindPauseNav();
    unbindHover();
    app.ticker.remove(tick);
    audio.music.setPaused(false);
    audio.engines.stop();
    audio.danger(0);
    audioWidget.dispose();
    displayWidget.dispose();
    pauseAudioWidget.dispose();
    pauseDisplayWidget.dispose();
    minimap.dispose();
    stream.dispose();
    renderer.destroy();
    root.remove();
    pauseLayer.remove();
  };
}
