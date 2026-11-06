import type { Application, Ticker } from "pixi.js";
import {
  buildTrack,
  describeProblem,
  HAZARD_KINDS,
  HAZARD_SPECS,
  isFrozen,
  smoothLoop,
  stepWorldCar,
  SUDDEN_DEATH_AT,
  TICK_RATE,
  validateDrawing,
  WORLD,
  VIEW,
  type Camera,
  type CarSnap,
  type CarState,
  type GameEvent,
  type HazardKind,
  type Point,
  type ServerMsg,
  type Track,
  type TrackProblem,
} from "@neon/sim";
import { h } from "./dom";
import { createKeyboard, isTyping } from "./input";
import { connect } from "./net/connection";
import { SnapshotBuffer } from "./net/interpolation";
import { Predictor } from "./net/prediction";
import { css, HAZARD_COLORS, playerColor } from "./render/palette";
import { createRenderer } from "./render/renderer";
import type { CarView, SketchView } from "./render/types";
import { createSketchTool } from "./sketch";
import { sfx } from "./audio";
import "./online.css";

type RoomMsg = Extract<ServerMsg, { t: "room" }>;

const DT = 1 / TICK_RATE;
const STATE_EVERY = 3;
const SKETCH_FLUSH_EVERY = 6;
const DRIFT_LATERAL = 120;
const TOAST_MS = 3000;
const HAZARD_LABELS: Record<HazardKind, string> = { block: "Block", slow: "Slow", freeze: "Freeze" };
const worldCamera: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: WORLD.width / VIEW.width };

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

  let you = "";
  let info: RoomMsg | null = null;
  let track: Track | null = null;
  let watched: Point[] = [];
  let watchedPreview: Point[] | null = null;
  let localProblems: TrackProblem[] = [];
  let serverProblems: TrackProblem[] = [];
  let drawPreview: Point[] | null = null;
  let local: CarState | null = null;
  let myAlive = false;
  let resetFromSnap = false;
  let roundWinner: string | null = null;
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
  const toasts: { text: string; until: number }[] = [];

  const root = h("div", { class: "online" });
  const top = h("div", { class: "online-top" });
  const center = h("div", { class: "online-center" });
  const bottom = h("div", { class: "online-bottom" });
  const toastBox = h("div", { class: "online-toasts" });
  const live = { timer: h("span"), countdown: h("div", { class: "countdown" }), sudden: h("div", { class: "sudden" }), cooldowns: new Map<HazardKind, HTMLElement>() };
  root.append(top, center, bottom, toastBox);
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
        track = buildTrack(msg.raw);
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
    if (info.phase === "race") sfx.go();
  }

  function onSnap(snap: Extract<ServerMsg, { t: "snap" }>) {
    buffer.push(snap, performance.now());
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
          sfx.out();
          toast("You're out - drop hazards with 1/2/3 + click");
        } else {
          sfx.blip();
          toast(`${nameOf(event.id)} is out`);
        }
        break;
      }
      case "hazardKill":
        toast(`${nameOf(event.by)}'s hazard took out ${nameOf(event.victim)} (+½)`);
        break;
      case "roundWon":
        roundWinner = event.id;
        if (event.id === you) sfx.win();
        break;
      case "matchWon":
        matchWinner = event.id;
        sfx.win();
        break;
    }
    drawUI();
  }

  function stepContext() {
    const latest = buffer.latest();
    return { track, hazards: latest?.hazards ?? [], now: serverNow(), carId: you };
  }

  function step() {
    steps++;
    if (info?.phase === "race" && myAlive && track && local) {
      const input = keyboard.read();
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
  };
  app.ticker.add(tick);

  function render() {
    const phase = info?.phase ?? "lobby";
    const now = serverNow();
    if (phase === "sketch") {
      const sketch: SketchView = isDrawer()
        ? { points: tool.points, preview: drawPreview, valid: localProblems.length === 0 }
        : { points: watched, preview: watchedPreview, valid: true };
      renderer.render({ camera: worldCamera, track: null, cars: [], hazards: [], now, sketch });
      return;
    }
    const sampled = phase === "lobby" ? null : buffer.sample(performance.now());
    if (!sampled) {
      renderer.render({ camera: worldCamera, track: phase === "matchEnd" ? track : null, cars: [], hazards: [], now });
      return;
    }
    const hazards = sampled.snap.hazards;
    const cars = sampled.cars.map((c) => carView(c, hazards, now));
    const cooldown = buffer.latest()?.cooldowns[you]?.[hazardKind] ?? 0;
    const aim =
      phase === "race" && !myAlive && mouse
        ? { x: mouse[0], y: mouse[1], kind: hazardKind, radius: HAZARD_SPECS[hazardKind].radius, ready: now >= cooldown }
        : null;
    renderer.render({ camera: sampled.camera, track, cars, hazards, now, aim });
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
      alive: snap.alive,
      frozen: isFrozen(snap.id, hazards, now),
      isYou: snap.id === you,
    };
  }

  function updateLive() {
    if (!info) return;
    const remaining = Math.max(0, info.remaining - (performance.now() - roomReceivedAt) / 1000);
    live.timer.textContent = `${Math.ceil(remaining)}s`;
    if (info.phase === "countdown") {
      const n = Math.ceil(remaining);
      live.countdown.textContent = n > 0 ? String(n) : "GO";
      if (n !== lastCountdown && n > 0) sfx.tick();
      lastCountdown = n;
    }
    const now = serverNow();
    live.sudden.textContent = info.phase === "race" && now > SUDDEN_DEATH_AT ? "SUDDEN DEATH - the camera is closing in" : "";
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
    const racing = info.phase === "countdown" || info.phase === "race" || info.phase === "roundEnd";

    top.replaceChildren(
      h("div", { class: "code" }, `Room ${info.code}`),
      h("div", { class: "round" }, info.phase !== "lobby" ? `Round ${info.round} · first to ${info.target}` : ""),
      h(
        "div",
        { class: "scores" },
        ...players.map((p) =>
          h(
            "span",
            { class: `score${racing && snapCars.get(p.id)?.alive === false ? " out" : ""}`, style: `--c:${css(playerColor(p.color))}` },
            `${p.name} ${formatScore(p.score)}`,
          ),
        ),
      ),
      h("button", { class: "leave", onclick: () => leave() }, "Leave"),
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
        return [
          h(
            "div",
            { class: "panel lobby" },
            h("h1", {}, `Room ${i.code}`),
            h("button", { class: "link", onclick: () => navigator.clipboard?.writeText(location.href).then(() => toast("Invite link copied")) }, "Copy invite link"),
            h(
              "ul",
              { class: "players" },
              ...i.players.map((p) =>
                h(
                  "li",
                  { style: `--c:${css(playerColor(p.color))}` },
                  h("span", { class: "dot" }),
                  `${p.name}${p.id === i.hostId ? " ★" : ""}${p.id === you ? " (you)" : ""}`,
                  h("span", { class: p.ready ? "ready yes" : "ready" }, p.ready ? "ready" : "not ready"),
                ),
              ),
            ),
            h(
              "div",
              { class: "modes" },
              "Mode: ",
              ...(["ghost", "contact"] as const).map((mode) =>
                h(
                  "button",
                  { class: i.mode === mode ? "on" : "", disabled: !isHost, onclick: () => conn.send({ t: "mode", mode }) },
                  mode === "ghost" ? "Ghost (no contact)" : "Contact (bumping)",
                ),
              ),
            ),
            h("button", { class: `big${me?.ready ? " on" : ""}`, onclick: () => conn.send({ t: "ready", ready: !me?.ready }) }, me?.ready ? "Ready ✓" : "Ready up"),
            h("p", { class: "hint" }, i.players.length < 2 ? "Waiting for at least one more racer…" : "Starts when everyone is ready."),
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
        return [h("div", { class: "panel slim" }, roundWinner ? `${nameOf(roundWinner)} wins the round!` : "Nobody survived that one")];
      case "matchEnd":
        return [
          h(
            "div",
            { class: "panel lobby" },
            h("h1", {}, `${nameOf(matchWinner)} wins!`),
            h("ol", { class: "players" }, ...[...i.players].sort((a, b) => b.score - a.score).map((p) => h("li", { style: `--c:${css(playerColor(p.color))}` }, h("span", { class: "dot" }), `${p.name} - ${formatScore(p.score)}`))),
            i.hostId === you ? h("button", { class: "big", onclick: () => conn.send({ t: "again" }) }, "Back to lobby") : h("p", { class: "hint" }, "Waiting for the host…"),
          ),
        ];
    }
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
    keyboard.dispose();
    tool.dispose();
    renderer.destroy();
    root.remove();
  };
}

function carOf(c: CarState): CarState {
  return { x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy };
}

function formatScore(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return `${Math.floor(score) || ""}½`;
}
