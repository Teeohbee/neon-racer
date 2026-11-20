import { describe, expect, it } from "vitest";
import { botInput, BOT_SKILLS, BOT_STYLES, newBotMind, type BotSkill, type DrivingStyle } from "../src/bot";
import { advanceProgress, buildTrack, fellOff, gridSlots, isOnRoad, nearestOnTrack, type Track } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { stepWorldCar } from "../src/world";

const DT = 1 / 60;

const eight = buildTrack(
  Array.from({ length: 240 }, (_, i): [number, number] => {
    const t = Math.PI / 2 + (i / 240) * Math.PI * 2;
    return [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)];
  }),
);

function race(skill: BotSkill, trackIndex: number | Track, seconds: number, seed = 7) {
  const track = typeof trackIndex === "number" ? buildTrack(PRESET_TRACKS[trackIndex]!.points, PRESET_TRACKS[trackIndex]!.features) : trackIndex;
  const slot = gridSlots(track, 1)[0]!;
  let car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
  const start = nearestOnTrack(track, car.x, car.y).s;
  let progress = { s: start, progress: 0 };
  let offRoad = 0;
  let fell = false;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const steps = seconds * 60;
  for (let i = 0; i < steps && !fell; i++) {
    car = stepWorldCar(car, botInput(car, track, BOT_STYLES[skill], rng, { near: progress.s }), DT, { track, hazards: [], now: i * DT, near: progress.s }).car;
    progress = advanceProgress(progress, nearestOnTrack(track, car.x, car.y, progress.s).s, track.length, 200);
    if (!isOnRoad(track, car.x, car.y)) offRoad++;
    fell = fellOff(track, car.x, car.y);
  }
  return { distance: progress.progress, offRoad: offRoad / steps, fell };
}

describe("botInput", () => {
  it.each(PRESET_TRACKS.map((t, i) => [t.name, i] as const))("a medium bot gets round %s without falling off", (_, i) => {
    const { distance, offRoad, fell } = race("medium", i, 40);
    expect(fell).toBe(false);
    expect(distance).toBeGreaterThan(10000);
    expect(offRoad).toBeLessThan(0.15);
  });

  it("a medium bot goes straight over a crossing instead of turning onto the other branch", () => {
    const { distance, offRoad } = race("medium", eight, 40);
    expect(distance).toBeGreaterThan(eight.length);
    expect(offRoad).toBeLessThan(0.05);
  });

  it("harder bots are faster", () => {
    const distances = BOT_SKILLS.map((skill) => race(skill, 0, 40).distance);
    expect(distances[0]).toBeLessThan(distances[1]!);
    expect(distances[1]).toBeLessThan(distances[2]!);
  });

  it("holds the throttle for longer in a slipstream", () => {
    const { points, features } = PRESET_TRACKS[0]!;
    const track = buildTrack(points, features);
    const slot = gridSlots(track, 1)[0]!;
    const at = (speed: number) => ({ x: slot.x, y: slot.y, angle: slot.angle, vx: speed * Math.cos(slot.angle), vy: speed * Math.sin(slot.angle) });
    const steady = () => 0.5;
    let speed = 0;
    while (botInput(at(speed), track, BOT_STYLES.hard, steady).throttle) speed += 5;
    expect(botInput(at(speed), track, BOT_STYLES.hard, steady, { draft: 1 }).throttle).toBe(true);
  });
});

describe("Driving style risks", () => {
  const calm: DrivingStyle = { ...BOT_STYLES.hard, dropNerve: 0, commit: 0, hunt: 0, greed: 0, lapse: 0 };
  const tracks = PRESET_TRACKS.map((t) => buildTrack(t.points, t.features));

  /** Drive one car alone for `seconds` with its own mind, the way the Room does. */
  function drive(style: DrivingStyle, track: Track, seconds: number, seed: number) {
    const slot = gridSlots(track, 1)[0]!;
    let car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
    let progress = { s: nearestOnTrack(track, car.x, car.y).s, progress: 0 };
    const mind = newBotMind();
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let fell = false;
    let offRoad = 0;
    let ticks = 0;
    for (; ticks < seconds * 60 && !fell; ticks++) {
      car = stepWorldCar(car, botInput(car, track, style, rng, { near: progress.s, mind }), DT, { track, hazards: [], now: ticks * DT, near: progress.s }).car;
      progress = advanceProgress(progress, nearestOnTrack(track, car.x, car.y, progress.s).s, track.length, 200);
      if (!isOnRoad(track, car.x, car.y)) offRoad++;
      fell = fellOff(track, car.x, car.y);
    }
    return { distance: progress.progress, fell, offRoad: offRoad / ticks };
  }

  /** Every preset track, a few seeds each. */
  const runs = (style: DrivingStyle, seconds = 40) => tracks.flatMap((track) => [1, 2, 3].map((seed) => drive(style, track, seconds, seed * 7919)));
  const falls = (style: DrivingStyle) => runs(style).filter((r) => r.fell).length;

  it("a driver with more nerve near drops falls off more often", () => {
    expect(falls({ ...calm, dropNerve: 1 })).toBeGreaterThan(falls(calm) + 3);
  });
});
