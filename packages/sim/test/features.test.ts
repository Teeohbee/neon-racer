import { describe, expect, it } from "vitest";
import { emptyInput, speedOf } from "../src/car";
import { boostAt, buildTrack, dropAt, fellOff, ovalPoints, pointAt, TRACK_WIDTH } from "../src/track";
import { stepWorldCar } from "../src/world";

const loop = ovalPoints(3200, 2000, 2200, 1300);
const plain = buildTrack(loop);
const [ax, ay] = pointAt(plain, plain.length / 4);
const [bx, by] = pointAt(plain, (plain.length * 3) / 4);
const track = buildTrack(loop, [
  { kind: "drop", at: [ax, ay], span: 1000 },
  { kind: "boost", at: [bx, by] },
]);

describe("track features", () => {
  it("marks drop sections along the loop", () => {
    expect(dropAt(track, track.length / 4)).toBe(true);
    expect(dropAt(track, track.length / 4 + 400)).toBe(true);
    expect(dropAt(track, track.length / 4 + 700)).toBe(false);
    expect(dropAt(track, track.length / 2)).toBe(false);
  });

  it("handles drops that wrap past the start line", () => {
    const [sx, sy] = pointAt(plain, 0);
    const wrapped = buildTrack(loop, [{ kind: "drop", at: [sx, sy], span: 600 }]);
    expect(dropAt(wrapped, wrapped.length - 100)).toBe(true);
    expect(dropAt(wrapped, 100)).toBe(true);
    expect(dropAt(wrapped, 500)).toBe(false);
  });

  it("only kills cars that leave the road over a drop", () => {
    const [x, y, angle] = pointAt(track, track.length / 4);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    const edge = TRACK_WIDTH / 2 + 20;
    expect(fellOff(track, x, y)).toBe(false);
    expect(fellOff(track, x + nx * edge, y + ny * edge)).toBe(true);
    const [px, py, pa] = pointAt(track, track.length / 2);
    expect(fellOff(track, px - Math.sin(pa) * edge, py + Math.cos(pa) * edge)).toBe(false);
  });

  it("speeds up cars on a boost pad", () => {
    const boostS = (track.length * 3) / 4;
    expect(boostAt(track, boostS)).toBe(true);
    expect(boostAt(track, boostS + 500)).toBe(false);
    const [x, y, angle] = pointAt(track, boostS - 60);
    const start = { x, y, angle, vx: Math.cos(angle) * 600, vy: Math.sin(angle) * 600 };
    const throttle = { ...emptyInput, throttle: true };
    let boosted = start;
    let plainCar = start;
    for (let i = 0; i < 12; i++) {
      boosted = stepWorldCar(boosted, throttle, 1 / 60, { track, hazards: [], now: 0 }).car;
      plainCar = stepWorldCar(plainCar, throttle, 1 / 60, { track: plain, hazards: [], now: 0 }).car;
    }
    expect(speedOf(boosted)).toBeGreaterThan(speedOf(plainCar) + 50);
  });
});
