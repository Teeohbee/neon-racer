import { describe, expect, it } from "vitest";
import { botInput, BOT_SKILLS, type BotSkill } from "../src/bot";
import { advanceProgress, buildTrack, fellOff, gridSlots, isOnRoad, nearestOnTrack } from "../src/track";
import { PRESET_TRACKS } from "../src/tracks";
import { stepWorldCar } from "../src/world";

const DT = 1 / 60;

function race(skill: BotSkill, trackIndex: number, seconds: number, seed = 7) {
  const { points, features } = PRESET_TRACKS[trackIndex]!;
  const track = buildTrack(points, features);
  const slot = gridSlots(track, 1)[0]!;
  let car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
  const start = nearestOnTrack(track, car.x, car.y).s;
  let progress = { s: start, progress: 0 };
  let offRoad = 0;
  let fell = false;
  const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const steps = seconds * 60;
  for (let i = 0; i < steps && !fell; i++) {
    car = stepWorldCar(car, botInput(car, track, skill, rng), DT, { track, hazards: [], now: i * DT }).car;
    progress = advanceProgress(progress, nearestOnTrack(track, car.x, car.y).s, track.length, 200);
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
    while (botInput(at(speed), track, "hard", steady).throttle) speed += 5;
    expect(botInput(at(speed), track, "hard", steady, 1).throttle).toBe(true);
  });
});
