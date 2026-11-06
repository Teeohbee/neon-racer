import type { Application, Ticker } from "pixi.js";
import { botInput, buildTrack, fellOff, gridSlots, nearestOnTrack, pointAt, PRESET_TRACKS, speedOf, stepCamera, stepWorldCar, type BotSkill, type Camera, type CarState, type Track } from "@neon/sim";
import { onBoostPad } from "../render/boost-fx";
import { PLAYER_COLORS } from "../render/palette";
import { createRenderer } from "../render/renderer";
import type { CarView } from "../render/types";
import { ATTRACT, attractShot } from "./attract-plan";

const DT = 1 / 60;
const MAX_FRAME = 0.1;
const SCALE = 1.35;
const RESPAWN_BACK = 220;
const DRIFT_LATERAL = 120;
const FIELD: { name: string; skill: BotSkill }[] = [
  { name: "VOLT", skill: "hard" },
  { name: "NOVA", skill: "medium" },
  { name: "HEX", skill: "hard" },
  { name: "BYTE", skill: "easy" },
];

export function startAttract(app: Application): { stop(): void } {
  const renderer = createRenderer(app);
  const firstTrack = Math.floor(Math.random() * PRESET_TRACKS.length);
  const field = FIELD.slice(0, ATTRACT.cars);
  let elapsed = 0;
  let acc = 0;
  let round = -1;
  let track: Track;
  let cars: CarState[] = [];
  let camera: Camera = { x: 0, y: 0, scale: SCALE };

  const load = (index: number) => {
    const preset = PRESET_TRACKS[index]!;
    track = buildTrack(preset.points, preset.features);
    cars = gridSlots(track, field.length).map((s) => ({ x: s.x, y: s.y, angle: s.angle, vx: 0, vy: 0 }));
    camera = { x: cars[0]!.x, y: cars[0]!.y, scale: SCALE };
  };

  const step = () => {
    cars = cars.map((car, i) => {
      const next = stepWorldCar(car, botInput(car, track, field[i]!.skill, Math.random), DT, { track, hazards: [], now: elapsed, carId: field[i]!.name }).car;
      if (!fellOff(track, next.x, next.y)) return next;
      const [x, y, angle] = pointAt(track, nearestOnTrack(track, next.x, next.y).s - RESPAWN_BACK);
      return { x, y, angle, vx: 0, vy: 0 };
    });
  };

  const view = (car: CarState, i: number): CarView => ({
    id: field[i]!.name,
    name: field[i]!.name,
    color: PLAYER_COLORS[i % PLAYER_COLORS.length]!,
    x: car.x,
    y: car.y,
    angle: car.angle,
    speed: speedOf(car),
    drifting: Math.abs(-car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle)) > DRIFT_LATERAL,
    boosting: onBoostPad(track, car.x, car.y),
    alive: true,
    frozen: false,
    isYou: false,
  });

  const tick = (ticker: Ticker) => {
    const frame = Math.min(MAX_FRAME, ticker.deltaMS / 1000);
    const shot = attractShot(elapsed, firstTrack, PRESET_TRACKS.length, field.length);
    if (shot.round !== round) {
      round = shot.round;
      load(shot.track);
    }
    acc += frame;
    while (acc >= DT) {
      step();
      elapsed += DT;
      acc -= DT;
    }
    camera = stepCamera(camera, cars[shot.focus]!, frame, SCALE);
    renderer.render({ camera, track, trackName: null, cars: cars.map(view), hazards: [], now: elapsed, aim: null, dangerLine: null });
  };

  app.ticker.add(tick);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      app.ticker.remove(tick);
      renderer.destroy();
    },
  };
}
