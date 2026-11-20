import { describe, expect, it } from "vitest";
import { botInput, newBotMind, RUNNERS, type DrivingStyle } from "../src/bot";
import { advanceProgress, buildTrack, fellOff, gridSlots, isOnRoad, nearestOnTrack, type Track } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { stepWorldCar } from "../src/world";

const DT = 1 / 60;
/** A good driver that takes no risks: the baseline the risky styles are measured against. */
const calm: DrivingStyle = { pace: 0.97, cornering: 1, wobble: 0.02, dropNerve: 0, commit: 0, lapse: 0 };

const eight = buildTrack(
  Array.from({ length: 240 }, (_, i): [number, number] => {
    const t = Math.PI / 2 + (i / 240) * Math.PI * 2;
    return [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)];
  }),
);

function race(style: DrivingStyle, trackIndex: number | Track, seconds: number, seed = 7) {
  const track = typeof trackIndex === "number" ? buildTrack(PRESET_TRACKS[trackIndex]!.points, PRESET_TRACKS[trackIndex]!.features) : trackIndex;
  const slot = gridSlots(track, 1)[0]!;
  let car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
  const start = nearestOnTrack(track, car.x, car.y).s;
  let progress = { s: start, progress: 0 };
  let offRoad = 0;
  let fell = false;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const mind = newBotMind();
  const steps = seconds * 60;
  for (let i = 0; i < steps && !fell; i++) {
    car = stepWorldCar(car, botInput(car, track, style, rng, { near: progress.s, mind }), DT, { track, hazards: [], now: i * DT, near: progress.s }).car;
    progress = advanceProgress(progress, nearestOnTrack(track, car.x, car.y, progress.s).s, track.length, 200);
    if (!isOnRoad(track, car.x, car.y)) offRoad++;
    fell = fellOff(track, car.x, car.y);
  }
  return { distance: progress.progress, offRoad: offRoad / steps, fell };
}

describe("botInput", () => {
  it.each(PRESET_TRACKS.map((t, i) => [t.name, i] as const))("a careful driver gets round %s without falling off", (_, i) => {
    const { distance, offRoad, fell } = race(calm, i, 40);
    expect(fell).toBe(false);
    expect(distance).toBeGreaterThan(10000);
    expect(offRoad).toBeLessThan(0.15);
  });

  // Risks fail now and then, but a Runner who falls most times round is no good to watch or bet on.
  it.each(RUNNERS.map((r) => [r.name, r] as const))("%s gets round every track most of the time", { timeout: 30_000 }, (_, runner) => {
    const runs = PRESET_TRACKS.flatMap((_, i) => [1, 2, 3].map((n) => race(runner.style, i, 40, n * 7919)));
    expect(runs.filter((r) => r.fell).length).toBeLessThan(runs.length / 3);
    for (const r of runs.filter((r) => !r.fell)) expect(r.distance).toBeGreaterThan(10000);
  });

  it("a careful driver goes straight over a crossing instead of turning onto the other branch", () => {
    const { distance, offRoad } = race(calm, eight, 40);
    expect(distance).toBeGreaterThan(eight.length);
    expect(offRoad).toBeLessThan(0.05);
  });

  it("holds the throttle for longer in a slipstream", () => {
    const { points, features } = PRESET_TRACKS[0]!;
    const track = buildTrack(points, features);
    const slot = gridSlots(track, 1)[0]!;
    const at = (speed: number) => ({ x: slot.x, y: slot.y, angle: slot.angle, vx: speed * Math.cos(slot.angle), vy: speed * Math.sin(slot.angle) });
    const steady = () => 0.5;
    let speed = 0;
    while (botInput(at(speed), track, calm, steady).throttle) speed += 5;
    expect(botInput(at(speed), track, calm, steady, { draft: 1 }).throttle).toBe(true);
  });
});

// Each of these drives every track a few times per style, so they need longer than the default.
describe("Driving style risks", { timeout: 30_000 }, () => {
  const tracks = PRESET_TRACKS.map((t) => buildTrack(t.points, t.features));

  /** Drive one car alone for `seconds` with its own mind, the way the Room does. */
  function drive(style: DrivingStyle, track: Track, seconds: number, seed: number, pressed = false) {
    const slot = gridSlots(track, 1)[0]!;
    let car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
    let progress = { s: nearestOnTrack(track, car.x, car.y).s, progress: 0 };
    const mind = newBotMind();
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    let fell = false;
    let offRoad = 0;
    let ticks = 0;
    for (; ticks < seconds * 60 && !fell; ticks++) {
      car = stepWorldCar(car, botInput(car, track, style, rng, { near: progress.s, mind, pressed }), DT, { track, hazards: [], now: ticks * DT, near: progress.s }).car;
      progress = advanceProgress(progress, nearestOnTrack(track, car.x, car.y, progress.s).s, track.length, 200);
      if (!isOnRoad(track, car.x, car.y)) offRoad++;
      fell = fellOff(track, car.x, car.y);
    }
    return { distance: progress.progress, fell, offRoad: offRoad / ticks };
  }

  /** Every preset track, a few seeds each. */
  const runs = (style: DrivingStyle, seconds = 40, pressed = false) => tracks.flatMap((track) => [1, 2, 3].map((seed) => drive(style, track, seconds, seed * 7919, pressed)));
  let calmRuns: ReturnType<typeof runs> | undefined;
  const steadyRuns = () => (calmRuns ??= runs(calm));
  const falls = (style: DrivingStyle) => (style === calm ? steadyRuns() : runs(style)).filter((r) => r.fell).length;

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  it("a driver with more nerve near drops falls off more often", () => {
    expect(falls({ ...calm, dropNerve: 1 })).toBeGreaterThan(falls(calm) + 3);
  });

  it("a driver who attacks the bends is quicker on average but spends more time off the road", () => {
    const steady = steadyRuns();
    const attacking = runs({ ...calm, commit: 1 });
    expect(mean(attacking.map((r) => r.distance))).toBeGreaterThan(mean(steady.map((r) => r.distance)));
    expect(mean(attacking.map((r) => r.offRoad))).toBeGreaterThan(mean(steady.map((r) => r.offRoad)) + 0.02);
  });

  it("a driver prone to lapses falls off more often", () => {
    expect(falls({ ...calm, lapse: 0.3 })).toBeGreaterThan(falls(calm) + 3);
  });

  it("even a careful driver takes risks with the line close behind it", () => {
    expect(runs(calm, 40, true).filter((r) => r.fell).length).toBeGreaterThan(falls(calm) + 3);
  });
});
