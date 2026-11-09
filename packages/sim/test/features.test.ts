import { describe, expect, it } from "vitest";
import { emptyInput, speedOf } from "../src/car";
import { boostAt, buildTrack, dropAt, fellOff, nearestOnTrack, ovalPoints, pointAt, TRACK_WIDTH, type Point } from "../src/track";
import { CAR_RADIUS } from "../src/car";
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

describe("bridge rails", () => {
  const points = Array.from({ length: 240 }, (_, i): Point => {
    const t = Math.PI / 2 + (i / 240) * Math.PI * 2;
    return [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)];
  });
  const plainEight = buildTrack(points);
  const over = plainEight.length / 4;
  const under = (plainEight.length * 3) / 4;
  const [bx, by] = pointAt(plainEight, over - 250);
  const eight = buildTrack(points, [{ kind: "bridge", at: [bx, by], span: 800 }]);
  const rail = TRACK_WIDTH / 2 - CAR_RADIUS;
  const sideways = (s: number, offset: number, speed: number) => {
    const [x, y, angle] = pointAt(eight, s);
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);
    return { car: { x: x + nx * offset, y: y + ny * offset, angle, vx: nx * speed, vy: ny * speed }, nx, ny };
  };

  it("keeps a car on the deck when it drives at the edge of a bridge", () => {
    const { car, nx, ny } = sideways(over - 200, rail - 2, 400);
    const { car: next } = stepWorldCar(car, emptyInput, 1 / 60, { track: eight, hazards: [], now: 0, near: over - 200 });
    expect(nearestOnTrack(eight, next.x, next.y, over - 200).dist).toBeLessThanOrEqual(rail + 0.01);
    expect(next.vx * nx + next.vy * ny).toBeLessThan(1);
  });

  it("doesn't rail a car on the road underneath", () => {
    const { car } = sideways(under - 200, rail - 2, 400);
    const { car: next } = stepWorldCar(car, emptyInput, 1 / 60, { track: eight, hazards: [], now: 0, near: under - 200 });
    expect(nearestOnTrack(eight, next.x, next.y, under - 200).dist).toBeGreaterThan(rail + 1);
  });
});
