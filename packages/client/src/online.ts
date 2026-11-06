import type { Application, Ticker } from "pixi.js";
import {
  BOT_SKILLS,
  boostAt,
  buildTrack,
  describeProblem,
  HAZARD_KINDS,
  HAZARD_SPECS,
  isFrozen,
  nearestOnTrack,
  pointAt,
  LAP_COUNTS,
  MAX_PLAYERS,
  PRESET_TRACKS,
  SCORE_TARGETS,
  smoothLoop,
  stepWorldCar,
  SUDDEN_DEATH_AT,
  TARGET_SCORE,
  TICK_RATE,
  TRACK_WIDTH,
  validateDrawing,
  WORLD,
  VIEW,
  type Camera,
  type CarSnap,
  type CarState,
  type EliminationReason,
  type GameEvent,
  type HazardKind,
  type Point,
  type ServerMsg,
  type Track,
  type TrackProblem,
  type WinCondition,
} from "@neon/sim";
import { h } from "./dom";
import { createKeyboard, isTyping } from "./input";
import { connect } from "./net/connection";
import { createDrafting } from "./net/drafting";
import { SnapshotBuffer } from "./net/interpolation";
import { Predictor } from "./net/prediction";
import { onBoostPad } from "./render/boost-fx";
import { css, HAZARD_COLORS, playerColor } from "./render/palette";
import { createRenderer } from "./render/renderer";
import type { CarView, SketchView } from "./render/types";
import { createMinimap, drawTrackShape } from "./minimap";
import { createSketchTool } from "./sketch";
import { audio, audioSettingsWidget, dangerLevel, screenPan, type Mood } from "./audio";
import "./online.css";

type RoomMsg = Extract<ServerMsg, { t: "room" }>;

const DT = 1 / TICK_RATE;
const STATE_EVERY = 3;
const SKETCH_FLUSH_EVERY = 6;
const DRIFT_LATERAL = 120;
const TOAST_MS = 3000;
const HAZARD_LABELS: Record<HazardKind, string> = { block: "Block", slow: "Slow", freeze: "Freeze" };
const OUT_REASONS: Record<EliminationReason, string> = { line: "got caught by the line", fell: "fell off", left: "left" };
const YOUR_OUT_REASONS: Record<EliminationReason, string> = { line: "The line caught you", fell: "You fell off", left: "You left" };
const worldCamera: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: WORLD.width / VIEW.width };
const THUMB = { width: 84, height: 50, pad: 200 };
const DEFAULT_LAPS = 3;
const BUMP_DV = 150;
const BUMP_FULL = 500;
const BUMP_GAP_MS = 150;
const MOODS: Record<RoomMsg["phase"], Mood> = { lobby: "lobby", sketch: "lobby", countdown: "race", race: "race", roundEnd: "race", matchEnd: "lobby" };

export interface OnlineOptions {
  room: string;
  name: string;
}

export function startOnline(app: Application, ui: HTMLElement, opts: OnlineOptions, onExit: (reason?: string) => void): () => void {
  const renderer = createRenderer(app);
  const conn = connect(opts.room, opts.name);
  const keyboard = createKeyboard();
  const tool = createSketchTool(app.canvas, (x, y) => renderer.screenToWorld(x, y));
  const buffer = new SnapshotBuffer();
  const predictor = new Predictor({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 });
  const drafting = createDrafting(() => audio.sfx.slipstream());
  const audioWidget = audioSettingsWidget();
  const minimap = createMinimap(ui);

  let you = "";
  let info: RoomMsg | null = null;
  let track: Track | null = null;
  let trackName = "";
  let watched: Point[] = [];
  let watchedPreview: Point[] | null = null;
  let localProblems: TrackProblem[] = [];
  let serverProblems: TrackProblem[] = [];
  let drawPreview: Point[] | null = null;
  let local: CarState | null = null;
  let myAlive = false;
  let resetFromSnap = false;
  let roundWinner: string | null = null;
  let roundResults: { id: string; delta: number }[] = [];
  let matchWinner: string | null = null;
  let hazardKind: HazardKind = "block";
  let mouse: Point | null = null;
  let steps = 0;
  let acc = 0;
  let sketchDirty = false;
  let sentCount = 0;
  let sentFirst: Point | undefined;
  let lastCountdown = -1;
  let ended = false;
  let roomReceivedAt = performance.now();
  let heard: { cars: CarView[]; camera: Camera; line: number | null } | null = null;
  let onBoost = false;
  let lastVelocity: { vx: number; vy: number } | null = null;
  let lastBumpAt = 0;
  const hazardsSeen = new Map<number, boolean>();
  const toasts: { text: string; until: number }[] = [];

  const root = h("div", { class: "online" });
  const top = h("div", { class: "online-top" });
  const topInfo = h("div", { class: "online-top-info" });
  top.append(topInfo, audioWidget.el, h("button", { class: "leave", onclick: () => leave() }, "Leave"));
  const center = h("div", { class: "online-center" });
  const bottom = h("div", { class: "online-bottom" });
  const toastBox = h("div", { class: "online-toasts" });
  const live = { timer: h("span"), goal: h("span"), countdown: h("div", { class: "countdown" }), sudden: h("div", { class: "sudden" }), cooldowns: new Map<HazardKind, HTMLElement>() };
  const thumbs = new Map(PRESET_TRACKS.map((t) => [t.name, trackThumb(buildTrack(t.points, t.features))]));
  root.append(top, center, bottom, toastBox);
  const uiClick = (e: MouseEvent) => {
    if (e.target instanceof Element && e.target.closest("button:not(:disabled)")) audio.sfx.click();
  };
  center.addEventListener("click", uiClick);
  bottom.addEventListener("click", uiClick);
  ui.append(root);

  const player = (id: string | null | undefined) => info?.players.find((p) => p.id === id);
  const nameOf = (id: string | null | undefined) => player(id)?.name ?? "Someone";
  const isDrawer = () => info?.phase === "sketch" && info.drawerId === you;
  const serverNow = () => buffer.serverNow(performance.now());

  const leave = (reason?: string) => {
    if (ended) return;
    ended = true;
    onExit(reason);
  };

  const toast = (text: string) => {
    toasts.push({ text, until: performance.now() + TOAST_MS });
    drawToasts();
  };

  conn.onClose(() => leave("Disconnected from the server"));
  conn.onMessage((msg) => {
    switch (msg.t) {
      case "welcome":
        you = msg.you;
        history.replaceState(null, "", `?room=${msg.code}`);
        break;
      case "error":
        leave(msg.message);
        break;
      case "room": {
        const prev = info?.phase;
        info = msg;
        roomReceivedAt = performance.now();
        if (prev !== msg.phase) enterPhase();
        drawUI();
        break;
      }
      case "sketch":
        if (msg.reset) watched = [];
        watched = [...watched, ...msg.points];
        watchedPreview = watched.length >= 10 ? smoothLoop(watched) : null;
        break;
      case "problems":
        serverProblems = msg.problems;
        drawUI();
        break;
      case "track":
        track = buildTrack(msg.raw, msg.features);
        trackName = msg.name;
        toast(`Track: ${msg.name}`);
        buffer.clear();
        resetFromSnap = true;
        break;
      case "snap":
        onSnap(msg);
        break;
      case "event":
        onEvent(msg.event);
        break;
    }
  });

  function enterPhase() {
    if (!info) return;
    if (info.phase === "sketch") {
      watched = [];
      watchedPreview = null;
      serverProblems = [];
      localProblems = [];
      drawPreview = null;
      track = null;
      roundWinner = null;
      sentCount = 0;
      sentFirst = undefined;
      tool.clear();
      if (info.drawerId === you) tool.enable();
      else tool.disable();
    } else {
      tool.disable();
    }
    if (info.phase === "lobby") {
      matchWinner = null;
      track = null;
    }
    if (info.phase === "countdown") {
      roundResults = [];
      resetFromSnap = true;
    }
    if (info.phase === "race") audio.sfx.go();
    if (info.phase !== "race") audio.danger(0);
  }

  function onSnap(snap: Extract<ServerMsg, { t: "snap" }>) {
    buffer.push(snap, performance.now());
    hazardSounds(snap);
    const mine = snap.cars.find((c) => c.id === you);
    if (!mine) {
      myAlive = false;
      return;
    }
    if (resetFromSnap) {
      local = carOf(mine);
      predictor.reset(carOf(mine));
      resetFromSnap = false;
    }
    myAlive = mine.alive;
    if (info?.mode === "contact" && mine.alive && snap.phase === "race") predictor.reconcile(carOf(mine), mine.ack, DT, stepContext());
  }

  function onEvent(event: GameEvent) {
    switch (event.kind) {
      case "eliminated": {
        const car = buffer.latest()?.cars.find((c) => c.id === event.id);
        if (car) renderer.burst(car.x, car.y, playerColor(player(event.id)?.color ?? 0));
        if (event.id === you) {
          myAlive = false;
          audio.sfx.eliminated(event.reason);
          audio.danger(0);
          toast(`${YOUR_OUT_REASONS[event.reason]} - drop hazards with 1/2/3 + click`);
        } else {
          audio.sfx.eliminated(event.reason, { you: false, pan: car && heard ? screenPan(car, heard.camera) : 0 });
          toast(`${nameOf(event.id)} ${OUT_REASONS[event.reason]}`);
        }
        break;
      }
      case "roundScored":
        roundResults = event.results;
        break;
      case "hazardKill":
        toast(`${nameOf(event.by)}'s hazard took out ${nameOf(event.victim)} (+½)`);
        break;
      case "roundWon":
        roundWinner = event.id;
        if (event.id === you) audio.sfx.roundWin();
        break;
      case "matchWon":
        matchWinner = event.id;
        audio.sfx.matchWin();
        break;
    }
    drawUI();
  }

  function stepContext() {
    const latest = buffer.latest();
    return { track, hazards: latest?.hazards ?? [], now: serverNow(), carId: you, draft: drafting.own(you) };
  }

  function step() {
    steps++;
    if (info?.phase === "race" && myAlive && track && local) {
      const input = keyboard.read();
      drafting.step(you, info.mode === "ghost" ? local : predictor.state, buffer.sample(performance.now())?.cars ?? [], DT);
      if (info.mode === "ghost") {
        local = stepWorldCar(local, input, DT, stepContext()).car;
        if (steps % STATE_EVERY === 0) conn.send({ t: "state", seq: steps, car: local });
      } else {
        const entry = predictor.step(input, DT, stepContext());
        conn.send({ t: "input", seq: entry.seq, input: entry.input });
      }
    }
    if (sketchDirty && steps % SKETCH_FLUSH_EVERY === 0) flushSketch();
  }

  function flushSketch() {
    sketchDirty = false;
    const points = tool.points;
    const reset = points[0] !== sentFirst || points.length < sentCount;
    conn.send({ t: "sketch", points: reset ? points : points.slice(sentCount), reset });
    sentCount = points.length;
    sentFirst = points[0];
  }

  tool.onChange((points) => {
    if (!isDrawer()) return;
    sketchDirty = true;
    serverProblems = [];
    drawPreview = points.length >= 10 ? smoothLoop(points) : null;
    localProblems = points.length >= 10 ? validateDrawing(points) : [];
    drawUI();
  });

  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    if (isDrawer()) {
      if (e.key === "Enter") {
        flushSketch();
        conn.send({ t: "submit" });
      }
      if (e.key === "c" || e.key === "C") tool.clear();
    }
    const index = ["1", "2", "3"].indexOf(e.key);
    if (index >= 0) {
      hazardKind = HAZARD_KINDS[index]!;
      drawUI();
    }
  };
  const onPointerMove = (e: PointerEvent) => {
    const rect = app.canvas.getBoundingClientRect();
    mouse = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onPointerDown = (e: PointerEvent) => {
    if (info?.phase !== "race" || myAlive || !mouse || e.button !== 0) return;
    if (serverNow() >= (buffer.latest()?.cooldowns[you]?.[hazardKind] ?? 0)) audio.sfx.hazardPlaced();
    conn.send({ t: "hazard", kind: hazardKind, x: mouse[0], y: mouse[1] });
  };
  window.addEventListener("keydown", onKey);
  app.canvas.addEventListener("pointermove", onPointerMove);
  app.canvas.addEventListener("pointerdown", onPointerDown);

  const tick = (ticker: Ticker) => {
    acc = Math.min(acc + ticker.deltaMS / 1000, DT * 10);
    while (acc >= DT) {
      step();
      acc -= DT;
    }
    render();
    updateLive();
    updateAudio();
  };
  app.ticker.add(tick);

  function render() {
    const phase = info?.phase ?? "lobby";
    const now = serverNow();
    if (phase === "sketch") {
      heard = null;
      const sketch: SketchView = isDrawer()
        ? { points: tool.points, preview: drawPreview, valid: localProblems.length === 0 }
        : { points: watched, preview: watchedPreview, valid: true };
      renderer.render({ camera: worldCamera, track: null, trackName: null, cars: [], hazards: [], now, sketch });
      minimap.update(null, [], null);
      return;
    }
    const sampled = phase === "lobby" ? null : buffer.sample(performance.now());
    if (!sampled) {
      heard = null;
      renderer.render({ camera: worldCamera, track: phase === "matchEnd" ? track : null, trackName: phase === "matchEnd" && track ? trackName : null, cars: [], hazards: [], now });
      minimap.update(null, [], null);
      return;
    }
    const hazards = sampled.snap.hazards;
    const cars = sampled.cars.map((c) => carView(c, hazards, now));
    drafting.paint(cars, performance.now() / 1000);
    const cooldown = buffer.latest()?.cooldowns[you]?.[hazardKind] ?? 0;
    const aim =
      phase === "race" && !myAlive && mouse
        ? { x: mouse[0], y: mouse[1], kind: hazardKind, radius: HAZARD_SPECS[hazardKind].radius, ready: now >= cooldown }
        : null;
    heard = { cars, camera: sampled.camera, line: sampled.line };
    renderer.render({ camera: sampled.camera, track, trackName: track ? trackName : null, cars, hazards, now, aim, dangerLine: sampled.line });
    minimap.update(track, cars, sampled.camera, sampled.line);
  }

  function carView(snap: CarSnap, hazards: Extract<ServerMsg, { t: "snap" }>["hazards"], now: number): CarView {
    const mine = snap.id === you && myAlive && local;
    const car = mine ? (info?.mode === "contact" ? predictor.rendered : local!) : snap;
    const lateral = -car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle);
    const p = player(snap.id);
    return {
      id: snap.id,
      name: p?.name ?? "",
      color: playerColor(p?.color ?? 0),
      x: car.x,
      y: car.y,
      angle: car.angle,
      speed: Math.hypot(car.vx, car.vy),
      drifting: Math.abs(lateral) > DRIFT_LATERAL,
      boosting: snap.alive && !!track && onBoostPad(track, car.x, car.y),
      alive: snap.alive,
      frozen: isFrozen(snap.id, hazards, now),
      isYou: snap.id === you,
    };
  }

  function raceStanding(me: CarView): number {
    const alive = heard!.cars.filter((c) => c.alive);
    const line = heard!.line;
    if (!track || line === null || alive.length < 2) return 1;
    const L = track.length;
    const ahead = (c: CarView) => (((nearestOnTrack(track!, c.x, c.y).s - line) % L) + L) % L;
    const mine = ahead(me);
    return alive.filter((c) => c !== me && ahead(c) < mine).length / (alive.length - 1);
  }

  function updateAudio() {
    const phase = info?.phase ?? "lobby";
    const racing = phase === "race" && heard !== null;
    const now = serverNow();
    audio.music.setMood(phase === "race" && now > SUDDEN_DEATH_AT ? "suddenDeath" : MOODS[phase]);
    audio.engines.update(heard && (phase === "race" || phase === "countdown") ? heard.cars : [], heard?.camera ?? worldCamera);
    const me = heard?.cars.find((c) => c.isYou && c.alive);
    if (!racing || !me) {
      audio.music.setIntensity(phase === "race" ? 0.3 : phase === "countdown" ? 0.25 : 0.2);
      audio.danger(0);
      onBoost = false;
      lastVelocity = null;
      return;
    }
    audio.music.setIntensity(0.4 + 0.6 * raceStanding(me));
    if (track && heard!.line !== null) {
      const [lx, ly] = pointAt(track, heard!.line);
      audio.danger(dangerLevel(Math.hypot(me.x - lx, me.y - ly)));
    } else audio.danger(0);
    if (track) {
      const near = nearestOnTrack(track, me.x, me.y);
      const boosting = near.dist <= TRACK_WIDTH / 2 && boostAt(track, near.s);
      if (boosting && !onBoost) audio.sfx.boost();
      onBoost = boosting;
    }
    detectBump(now);
  }

  function detectBump(now: number) {
    const state = info?.mode === "contact" ? predictor.state : local;
    if (!state || isFrozen(you, buffer.latest()?.hazards ?? [], now)) {
      lastVelocity = null;
      return;
    }
    const prev = lastVelocity;
    lastVelocity = { vx: state.vx, vy: state.vy };
    if (!prev) return;
    const dv = Math.hypot(state.vx - prev.vx, state.vy - prev.vy);
    const t = performance.now();
    if (dv < BUMP_DV || t - lastBumpAt < BUMP_GAP_MS) return;
    lastBumpAt = t;
    audio.sfx.bump(Math.min(1, dv / BUMP_FULL));
  }

  function hazardSounds(snap: Extract<ServerMsg, { t: "snap" }>) {
    const live = new Set<number>();
    for (const hz of snap.hazards) {
      live.add(hz.id);
      const armed = snap.now >= hz.armsAt;
      const seen = hazardsSeen.get(hz.id);
      if (seen === undefined && !armed) audio.sfx.hazardArming(hz.armsAt - snap.now);
      if (armed && seen === false) audio.sfx.hazardActivate(hz.kind, heard ? screenPan(hz, heard.camera) : 0);
      hazardsSeen.set(hz.id, armed);
    }
    for (const id of hazardsSeen.keys()) if (!live.has(id)) hazardsSeen.delete(id);
  }

  function updateLive() {
    if (!info) return;
    const remaining = Math.max(0, info.remaining - (performance.now() - roomReceivedAt) / 1000);
    live.timer.textContent = `${Math.ceil(remaining)}s`;
    if (info.phase === "countdown") {
      const n = Math.ceil(remaining);
      live.countdown.textContent = n > 0 ? String(n) : "GO";
      if (n !== lastCountdown && n > 0) audio.sfx.countdownTick();
      lastCountdown = n;
    }
    live.goal.textContent = info.win.kind === "laps" ? `Lap ${buffer.latest()?.lap ?? 1}/${info.win.laps}` : `First to ${info.win.target}`;
    const now = serverNow();
    live.sudden.textContent = info.phase === "race" && now > SUDDEN_DEATH_AT ? "SUDDEN DEATH - the line is closing in" : "";
    const cooldowns = buffer.latest()?.cooldowns[you];
    for (const [kind, el] of live.cooldowns) {
      const left = Math.max(0, (cooldowns?.[kind] ?? 0) - now);
      el.style.setProperty("--charge", String(1 - left / HAZARD_SPECS[kind].cooldown));
      el.classList.toggle("ready", left === 0);
    }
    const t = performance.now();
    if (toasts.length && toasts[0]!.until < t) {
      toasts.splice(0, toasts.findIndex((x) => x.until >= t) === -1 ? toasts.length : toasts.findIndex((x) => x.until >= t));
      drawToasts();
    }
  }

  function drawToasts() {
    toastBox.replaceChildren(...toasts.map((t) => h("div", { class: "toast" }, t.text)));
  }

  function drawUI() {
    if (!info) {
      center.replaceChildren(h("div", { class: "panel" }, "Connecting…"));
      return;
    }
    const players = [...info.players].sort((a, b) => b.score - a.score);
    const snapCars = new Map(buffer.latest()?.cars.map((c) => [c.id, c]) ?? []);
    const racing = info.phase === "race" || info.phase === "roundEnd";

    topInfo.replaceChildren(
      h("div", { class: "code" }, `Room ${info.code}`),
      h("div", { class: "round" }, info.phase !== "lobby" ? `Round ${info.round} · ` : "", info.phase !== "lobby" ? live.goal : null),
      h(
        "div",
        { class: "scores" },
        ...players.map((p) =>
          h(
            "span",
            { class: `score${racing && snapCars.get(p.id)?.alive === false ? " out" : ""}`, style: `--c:${css(playerColor(p.color))}`, title: `${p.name} ${formatScore(p.score)}` },
            h("span", { class: "name" }, p.name),
            h("span", { class: "pts" }, formatScore(p.score)),
          ),
        ),
      ),
    );

    center.replaceChildren(...centerPanel());
    bottom.replaceChildren(...hazardBar());
  }

  function centerPanel(): HTMLElement[] {
    const i = info!;
    switch (i.phase) {
      case "lobby": {
        const me = player(you);
        const isHost = i.hostId === you;
        const slots = Array.from({ length: MAX_PLAYERS }, (_, n) => i.players[n] ?? null);
        return [
          h(
            "div",
            { class: "panel lobby" },
            h(
              "div",
              { class: "lobby-head" },
              h("h1", {}, `Room ${i.code}`),
              h("button", { class: "link", onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast("Invite link copied")) }, "Copy invite link"),
            ),
            h(
              "div",
              { class: "lobby-cols" },
              h(
                "div",
                { class: "lobby-settings" },
                h(
                  "div",
                  { class: "modes" },
                  "Mode: ",
                  h(
                    "span",
                    { class: "seg" },
                    ...(["contact", "ghost"] as const).map((mode) =>
                      h(
                        "button",
                        { class: i.mode === mode ? "on" : "", disabled: !isHost, onclick: () => conn.send({ t: "mode", mode }) },
                        mode === "ghost" ? "Ghost (no contact)" : "Contact (bumping)",
                      ),
                    ),
                  ),
                ),
                winPicker(i.win, isHost),
                trackPicker(i.tracks, isHost),
              ),
              h(
                "div",
                { class: "lobby-players" },
                h(
                  "ul",
                  { class: "players slots" },
                  ...slots.map((p) =>
                    p
                      ? h(
                          "li",
                          { style: `--c:${css(playerColor(p.color))}` },
                          h("span", { class: "dot" }),
                          h("span", { class: "name" }, `${p.name}${p.id === i.hostId ? " ★" : ""}${p.id === you ? " (you)" : ""}`),
                          h("span", { class: p.ready ? "ready yes" : "ready" }, p.bot ? "bot" : p.ready ? "ready" : "not ready"),
                          p.bot && isHost ? h("button", { class: "remove", title: "Remove bot", onclick: () => conn.send({ t: "removeBot", id: p.id }) }, "×") : null,
                        )
                      : h(
                          "li",
                          { class: "open" },
                          h("span", { class: "dot" }),
                          h("span", { class: "name" }, "Open slot"),
                          isHost ? h("span", { class: "add-bot" }, ...BOT_SKILLS.map((skill) => h("button", { title: `Add a ${skill} bot`, onclick: () => conn.send({ t: "addBot", skill }) }, `+ ${skill}`))) : null,
                        ),
                  ),
                ),
                h("button", { class: `big${me?.ready ? " on" : ""}`, onclick: () => conn.send({ t: "ready", ready: !me?.ready }) }, me?.ready ? "Ready ✓" : "Ready up"),
                h("p", { class: "hint" }, i.players.length < 2 ? (isHost ? "Invite someone or add a bot to race." : "Waiting for at least one more racer…") : "Starts when everyone is ready."),
              ),
            ),
          ),
        ];
      }
      case "sketch": {
        const problems = serverProblems.length ? serverProblems : localProblems;
        return [
          h(
            "div",
            { class: "panel slim" },
            isDrawer()
              ? h("div", {}, h("b", {}, "Draw the track! "), "Drag a loop, or click, move and click. ", h("b", {}, "Enter"), " to race · ", h("b", {}, "C"), " to clear · ", live.timer)
              : h("div", {}, `${nameOf(i.drawerId)} is drawing the track… `, live.timer),
            isDrawer() && problems.length ? h("ul", { class: "problems" }, ...problems.map((p) => h("li", {}, describeProblem(p)))) : null,
          ),
        ];
      }
      case "countdown":
        return [live.countdown];
      case "race":
        return [live.sudden];
      case "roundEnd":
        return [
          h(
            "div",
            { class: "panel slim" },
            roundWinner ? `${nameOf(roundWinner)} wins the round!` : "Nobody survived that one",
            roundResults.length
              ? h(
                  "ol",
                  { class: "players results" },
                  ...roundResults.map((r) =>
                    h(
                      "li",
                      { style: `--c:${css(playerColor(player(r.id)?.color ?? 0))}` },
                      h("span", { class: "dot" }),
                      nameOf(r.id),
                      h("span", { class: `delta${r.delta > 0 ? " up" : r.delta < 0 ? " down" : ""}` }, formatDelta(r.delta)),
                    ),
                  ),
                )
              : null,
          ),
        ];
      case "matchEnd":
        return [
          h(
            "div",
            { class: "panel lobby" },
            h("h1", {}, `${nameOf(matchWinner)} wins!`),
            h("p", { class: "hint" }, i.win.kind === "laps" ? `${i.win.laps} laps of ${trackName}` : `First to ${i.win.target} on ${trackName}`),
            h("ol", { class: "players" }, ...[...i.players].sort((a, b) => b.score - a.score).map((p) => h("li", { style: `--c:${css(playerColor(p.color))}` }, h("span", { class: "dot" }), `${p.name} - ${formatScore(p.score)}`))),
            i.hostId === you ? h("button", { class: "big", onclick: () => conn.send({ t: "again" }) }, "Back to lobby") : h("p", { class: "hint" }, "Waiting for the host…"),
          ),
        ];
    }
  }

  function winPicker(win: WinCondition, isHost: boolean): HTMLElement {
    const values: WinCondition[] = win.kind === "laps" ? LAP_COUNTS.map((laps) => ({ kind: "laps", laps })) : SCORE_TARGETS.map((target) => ({ kind: "score", target }));
    const pick = (next: WinCondition) => conn.send({ t: "winCondition", ...next });
    return h(
      "div",
      { class: "modes" },
      "Win: ",
      h(
        "span",
        { class: "seg" },
        h("button", { class: win.kind === "laps" ? "on" : "", disabled: !isHost, onclick: () => pick({ kind: "laps", laps: DEFAULT_LAPS }) }, "Laps"),
        h("button", { class: win.kind === "score" ? "on" : "", disabled: !isHost, onclick: () => pick({ kind: "score", target: TARGET_SCORE }) }, "Points"),
      ),
      h(
        "span",
        { class: "seg" },
        ...values.map((v) => {
          const n = v.kind === "laps" ? v.laps : v.target;
          const on = win.kind === "laps" ? win.laps === n : win.target === n;
          return h("button", { class: on ? "on" : "", disabled: !isHost, onclick: () => pick(v) }, String(n));
        }),
      ),
      h("span", { class: "hint" }, win.kind === "laps" ? "laps, one track" : "points to win"),
    );
  }

  function trackPicker(selected: string[], isHost: boolean): HTMLElement {
    const choose = (names: string[]) => {
      if (!names.length || !info) return;
      info = { ...info, tracks: names };
      conn.send({ t: "tracks", names });
      drawUI();
    };
    const toggle = (name: string) => choose(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
    return h(
      "div",
      { class: "track-picker" },
      h(
        "div",
        { class: "modes" },
        `Tracks (${selected.length}/${PRESET_TRACKS.length})`,
        isHost ? h("button", { disabled: selected.length === PRESET_TRACKS.length, onclick: () => choose(PRESET_TRACKS.map((t) => t.name)) }, "All") : null,
      ),
      h(
        "div",
        { class: "track-grid" },
        ...PRESET_TRACKS.map((t) =>
          h(
            "button",
            { class: `track-card${selected.includes(t.name) ? " on" : ""}`, disabled: !isHost, title: t.name, onclick: () => toggle(t.name) },
            thumbs.get(t.name)!,
            h("span", {}, t.name),
          ),
        ),
      ),
    );
  }

  function hazardBar(): HTMLElement[] {
    live.cooldowns.clear();
    if (info?.phase !== "race" || myAlive) return [];
    return [
      h(
        "div",
        { class: "hazards" },
        ...HAZARD_KINDS.map((kind, idx) => {
          const el = h(
            "button",
            { class: `hazard${kind === hazardKind ? " on" : ""}`, style: `--c:${css(HAZARD_COLORS[kind])}`, onclick: () => ((hazardKind = kind), drawUI()) },
            `${idx + 1} ${HAZARD_LABELS[kind]}`,
          );
          live.cooldowns.set(kind, el);
          return el;
        }),
        h("span", { class: "hint" }, "Click the track to drop it"),
      ),
    ];
  }

  drawUI();

  return () => {
    ended = true;
    app.ticker.remove(tick);
    window.removeEventListener("keydown", onKey);
    app.canvas.removeEventListener("pointermove", onPointerMove);
    app.canvas.removeEventListener("pointerdown", onPointerDown);
    conn.close();
    audio.engines.stop();
    audio.danger(0);
    audioWidget.dispose();
    minimap.dispose();
    keyboard.dispose();
    tool.dispose();
    renderer.destroy();
    root.remove();
  };
}

function trackThumb(track: Track): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h("canvas", { width: THUMB.width * dpr, height: THUMB.height * dpr });
  canvas.style.width = `${THUMB.width}px`;
  canvas.style.height = `${THUMB.height}px`;
  const ctx = canvas.getContext("2d")!;
  const [minX, maxX, minY, maxY] = [Math.min(...track.xs), Math.max(...track.xs), Math.min(...track.ys), Math.max(...track.ys)];
  const scale = Math.min(THUMB.width / (maxX - minX + THUMB.pad * 2), THUMB.height / (maxY - minY + THUMB.pad * 2));
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (THUMB.width / 2 - ((minX + maxX) / 2) * scale), dpr * (THUMB.height / 2 - ((minY + maxY) / 2) * scale));
  drawTrackShape(ctx, track, scale);
  return canvas;
}

function carOf(c: CarState): CarState {
  return { x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy };
}

function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

function formatScore(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return `${Math.floor(score) || ""}½`;
}
