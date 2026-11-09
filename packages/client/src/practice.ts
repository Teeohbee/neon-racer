import type { Application, Ticker } from "pixi.js";
import {
  advanceProgress,
  boostAt,
  bridgeAt,
  fellOffAt,
  pointAt,
  buildTrack,
  describeProblem,
  gridSlots,
  nearestOnTrack,
  PRESET_TRACKS,
  smoothLoop,
  speedOf,
  stepCamera,
  stepWorldCar,
  TRACK_WIDTH,
  validateDrawing,
  VIEW,
  WORLD,
  type Camera,
  type CarInput,
  type CarState,
  type Point,
  type ProgressState,
  type Track,
  type TrackProblem,
} from "@neon/sim";
import { audio } from "./audio";
import { createDebugPanel, loadCarParams } from "./debug-panel";
import { createKeyboard, isTyping } from "./input";
import { PLAYER_COLORS } from "./render/palette";
import { IMPACT } from "./render/impact";
import { PULSE } from "./render/envelopes";
import { createRenderer } from "./render/renderer";
import type { CarView, SketchView } from "./render/types";
import { createMinimap } from "./minimap";
import { createSketchTool } from "./sketch";

const DT = 1 / 60;
const MAX_FRAME = 0.25;
const MAX_PROGRESS_STEP = 200;
const FALL_RESPAWN_DELAY = 0.6;
const FALL_SETBACK = 250;
const CAR_ID = "you";
const COLOR = PLAYER_COLORS[0];
const TOP_SPEED = 650;
const SKETCH_CAMERA: Camera = { x: WORLD.width / 2, y: WORLD.height / 2, scale: WORLD.width / VIEW.width };

const SKETCHING = false;
const DRIVE_HELP = "WASD / arrows drive · Shift handbrake · R reset · N next track · ` tuning";
const SKETCH_HELP = "Drag to draw a loop, or click once and move, click again to finish · Enter accept · Esc cancel · T restart";

const formatTime = (seconds: number | null) => {
  if (seconds === null) return "--.---";
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
};

function isDrifting(car: CarState, input: CarInput): boolean {
  const speed = speedOf(car);
  const lateral = Math.abs(-car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle));
  return speed > 120 && (lateral > 90 || (input.handbrake && speed > 160));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
}

function createHud(ui: HTMLElement) {
  const root = el("div", "practice", ui);
  const stats = el("div", "hud", root);
  const cell = (label: string) => {
    const box = el("div", "hud-cell", stats);
    el("span", "hud-label", box).textContent = label;
    return el("span", "hud-value", box);
  };
  const speed = cell("speed");
  const lap = cell("lap");
  const time = cell("time");
  const best = cell("best");
  const sketch = el("div", "sketch-status", root);
  const toast = el("div", "toast", root);
  const help = el("div", "help", root);
  let toastTimer = 0;

  const set = (node: HTMLElement, text: string) => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    stats(values: { speed: number; lap: number; time: number | null; best: number | null }) {
      set(speed, String(Math.round(values.speed)));
      set(lap, String(values.lap));
      set(time, formatTime(values.time));
      set(best, formatTime(values.best));
    },
    sketch(lines: string[] | null, ok = false) {
      sketch.hidden = lines === null;
      sketch.classList.toggle("ok", ok);
      set(sketch, (lines ?? []).join("\n"));
    },
    help(text: string) {
      set(help, text);
    },
    flash(text: string) {
      toast.textContent = text;
      toast.classList.add("show");
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2000);
    },
    dispose() {
      clearTimeout(toastTimer);
      root.remove();
    },
  };
}

export function startPractice(app: Application, ui: HTMLElement): () => void {
  const renderer = createRenderer(app);
  const keyboard = createKeyboard();
  const params = loadCarParams();
  const panel = createDebugPanel(ui, params);
  const sketch = createSketchTool(app.canvas, renderer.screenToWorld);
  const hud = createHud(ui);
  const minimap = createMinimap(ui);

  let presetIndex = 0;
  let track: Track = buildTrack(PRESET_TRACKS[presetIndex]!.points, PRESET_TRACKS[presetIndex]!.features);
  let trackName: string | null = PRESET_TRACKS[presetIndex]!.name;
  let car: CarState = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };
  let prev = car;
  let input: CarInput = keyboard.read();
  let camera: Camera = { x: 0, y: 0, scale: 1 };
  let now = 0;
  let acc = 0;
  let progress: ProgressState = { s: 0, progress: 0 };
  let crossed = -1;
  let lapStart: number | null = null;
  let laps = 0;
  let best: number | null = null;
  let mode: "drive" | "sketch" = "drive";
  let sketchDirty = false;
  let preview: Point[] | null = null;
  let problems: TrackProblem[] = [];
  let fall: { at: number; s: number } | null = null;
  let boosting = false;

  const reset = () => {
    const slot = gridSlots(track, 1)[0]!;
    car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
    prev = car;
    const { s } = nearestOnTrack(track, car.x, car.y, slot.s);
    progress = { s, progress: s > track.length / 2 ? s - track.length : s };
    crossed = Math.floor(progress.progress / track.length);
    lapStart = null;
    laps = 0;
    acc = 0;
    fall = null;
    camera = { x: car.x, y: car.y, scale: 1 };
  };

  const useTrack = (next: Track) => {
    track = next;
    best = null;
    reset();
  };

  const enterSketch = () => {
    mode = "sketch";
    sketch.clear();
    sketch.enable();
    hud.help(SKETCH_HELP);
  };

  const exitSketch = () => {
    mode = "drive";
    sketch.disable();
    sketch.clear();
    preview = null;
    problems = [];
    hud.sketch(null);
    hud.help(DRIVE_HELP);
    camera = { x: car.x, y: car.y, scale: 1 };
  };

  const sketchValid = () => sketch.points.length >= 3 && problems.length === 0;

  const refreshSketch = () => {
    if (!sketchDirty) return;
    sketchDirty = false;
    const points = sketch.points;
    preview = points.length >= 3 ? smoothLoop(points) : null;
    problems = points.length ? validateDrawing(points) : [];
    const status = sketch.mode === "free" ? "free draw: click to finish" : points.length ? "" : "draw a closed loop";
    const issues = points.length >= 3 && !problems.length && sketch.mode === "idle" ? ["looks good: Enter to race"] : problems.map(describeProblem);
    hud.sketch([status, ...issues].filter(Boolean), sketchValid());
  };

  const offChange = sketch.onChange(() => {
    sketchDirty = true;
  });

  const onKey = (e: KeyboardEvent) => {
    if (isTyping(e.target) || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.code) {
      case "KeyR":
        if (mode === "drive") reset();
        break;
      case "KeyT":
        if (!SKETCHING) break;
        enterSketch();
        sketchDirty = true;
        draw(0);
        break;
      case "KeyN": {
        presetIndex = (presetIndex + 1) % PRESET_TRACKS.length;
        const preset = PRESET_TRACKS[presetIndex]!;
        if (mode === "sketch") exitSketch();
        useTrack(buildTrack(preset.points, preset.features));
        trackName = preset.name;
        hud.flash(`${presetIndex + 1}/${PRESET_TRACKS.length} ${preset.name}`);
        break;
      }
      case "Enter":
        if (mode !== "sketch") return;
        refreshSketch();
        if (sketch.mode === "drag" || !sketchValid()) {
          hud.flash(problems.length ? describeProblem(problems[0]!) : "draw a closed loop first");
          break;
        }
        {
          const next = buildTrack(sketch.points);
          trackName = null;
          exitSketch();
          useTrack(next);
        }
        break;
      case "Escape":
        if (mode !== "sketch") return;
        exitSketch();
        break;
      case "Backquote":
        panel.toggle();
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  window.addEventListener("keydown", onKey);

  const respawn = (s: number) => {
    const [x, y, angle] = pointAt(track, s);
    car = { x, y, angle, vx: 0, vy: 0 };
    prev = car;
    const at = nearestOnTrack(track, x, y, s).s;
    let delta = at - progress.s;
    if (delta < -track.length / 2) delta += track.length;
    if (delta > track.length / 2) delta -= track.length;
    progress = { s: at, progress: progress.progress + delta };
  };

  const step = () => {
    if (fall) {
      now += DT;
      if (now - fall.at >= FALL_RESPAWN_DELAY) {
        respawn(fall.s - FALL_SETBACK);
        fall = null;
      }
      return;
    }
    prev = car;
    const result = stepWorldCar(car, input, DT, { track, hazards: [], now, params, carId: CAR_ID, near: progress.s });
    car = result.car;
    now += DT;
    const { s, dist } = nearestOnTrack(track, car.x, car.y, progress.s);
    if (fellOffAt(track, { s, dist, tx: 0, ty: 0 })) {
      fall = { at: now, s };
      renderer.fall({ ...car, id: CAR_ID, color: COLOR });
      car = { ...car, vx: 0, vy: 0 };
      prev = car;
      renderer.impact(car.x, car.y, IMPACT.eliminatedYou);
      hud.flash("Fell!");
      renderer.pulse(PULSE.eliminated);
      audio.sfx.eliminated("fell");
      boosting = false;
      return;
    }
    const onBoost = dist <= TRACK_WIDTH / 2 && boostAt(track, s);
    if (onBoost && !boosting) {
      audio.sfx.boost();
      renderer.pulse(PULSE.boost);
    }
    boosting = onBoost;
    progress = advanceProgress(progress, s, track.length, MAX_PROGRESS_STEP);
    const lap = Math.floor(progress.progress / track.length);
    if (lap <= crossed) return;
    crossed = lap;
    if (lapStart !== null) {
      const time = now - lapStart;
      best = best === null ? time : Math.min(best, time);
      laps += 1;
      renderer.burst(car.x, car.y, COLOR);
      audio.sfx.roundWin();
    }
    lapStart = now;
  };

  const draw = (frame: number) => {
    const a = mode === "drive" ? acc / DT : 1;
    const view: CarState = {
      x: prev.x + (car.x - prev.x) * a,
      y: prev.y + (car.y - prev.y) * a,
      angle: prev.angle + (car.angle - prev.angle) * a,
      vx: car.vx,
      vy: car.vy,
    };

    let sketchView: SketchView | undefined;
    if (mode === "sketch") {
      refreshSketch();
      camera = SKETCH_CAMERA;
      sketchView = { points: sketch.points, preview, valid: sketchValid() };
    } else {
      camera = stepCamera(camera, view, frame, 1);
    }

    const carView: CarView = {
      id: CAR_ID,
      name: "you",
      color: COLOR,
      x: view.x,
      y: view.y,
      angle: view.angle,
      speed: speedOf(car),
      drifting: mode === "drive" && isDrifting(car, input),
      s: progress.s,
      upper: bridgeAt(track, progress.s),
      boosting: mode === "drive" && boosting,
      alive: fall === null,
      frozen: false,
      isYou: true,
    };

    renderer.render({ camera, track, cars: [carView], hazards: [], now, sketch: sketchView, aim: null, dangerLine: null, trackName });
    minimap.update(mode === "drive" ? track : null, [carView], camera);
    audio.engines.update(mode === "drive" ? [carView] : [], camera);
    audio.music.setIntensity(0.2 + 0.8 * Math.min(1, speedOf(car) / TOP_SPEED));
    hud.stats({ speed: speedOf(car), lap: laps, time: lapStart === null ? null : now - lapStart, best });
  };

  const tick = (ticker: Ticker) => {
    const frame = Math.min(MAX_FRAME, ticker.deltaMS / 1000);
    input = keyboard.read();
    if (mode === "drive") {
      acc += frame;
      while (acc >= DT) {
        step();
        acc -= DT;
      }
    }
    draw(frame);
  };

  reset();
  audio.music.setMood("race");
  hud.help(DRIVE_HELP);
  hud.sketch(null);
  app.ticker.add(tick);

  return () => {
    app.ticker.remove(tick);
    window.removeEventListener("keydown", onKey);
    offChange();
    sketch.dispose();
    keyboard.dispose();
    panel.dispose();
    hud.dispose();
    renderer.destroy();
    minimap.dispose();
    audio.engines.stop();
  };
}
