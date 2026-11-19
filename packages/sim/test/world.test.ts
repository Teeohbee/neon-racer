import { describe, expect, it } from "vitest";
import { emptyInput, speedOf } from "../src/car";
import { HAZARD_SPECS } from "../src/hazards";
import { buildTrack, ovalPoints, pointAt } from "../src/track";
import { stepWorldCar } from "../src/world";

const track = buildTrack(ovalPoints(0, 0, 1500, 1000));
const [sx, sy, sa] = pointAt(track, 0);
const onRoad = { x: sx, y: sy, angle: sa, vx: 0, vy: 0 };
const throttle = { ...emptyInput, throttle: true };

function drive(car = onRoad, ctx: Partial<Parameters<typeof stepWorldCar>[3]> = {}, seconds = 3) {
  let state = car;
  let hit = null;
  for (let i = 0; i < seconds * 60; i++) {
    const r = stepWorldCar(state, throttle, 1 / 60, { track, hazards: [], now: i / 60, ...ctx });
    state = r.car;
    hit = r.hazardHit ?? hit;
  }
  return { car: state, hit };
}

describe("stepWorldCar", () => {
  it("is slower off the road", () => {
    const offRoad = { ...onRoad, x: 0, y: 0 };
    expect(speedOf(drive(offRoad, {}, 1).car)).toBeLessThan(speedOf(drive(onRoad, {}, 1).car));
  });

  it("does not move while frozen and reports the freeze", () => {
    const freeze = { id: 1, kind: "freeze" as const, x: sx, y: sy, radius: 150, owner: "ghost", armsAt: 0, expiresAt: 99, targetId: "me" };
    const { car, hit } = drive(onRoad, { hazards: [freeze], carId: "me" }, 1);
    expect(car.x).toBe(sx);
    expect(hit?.owner).toBe("ghost");
  });

  it("holds a frozen car's speed and lets it carry on at that speed when it thaws", () => {
    const moving = drive(onRoad, {}, 1).car;
    const freeze = { id: 1, kind: "freeze" as const, x: moving.x, y: moving.y, radius: 150, owner: "ghost", armsAt: 0, expiresAt: 99, targetId: "me" };
    const held = stepWorldCar(moving, throttle, 1 / 60, { track, hazards: [freeze], now: 1, carId: "me" }).car;
    expect(held.x).toBe(moving.x);
    expect(speedOf(held)).toBeCloseTo(speedOf(moving));
    const thawed = stepWorldCar(held, throttle, 1 / 60, { track, hazards: [{ ...freeze, expiresAt: 1 }], now: 1, carId: "me" }).car;
    expect(Math.hypot(thawed.x - held.x, thawed.y - held.y)).toBeGreaterThan(speedOf(moving) / 60 / 2);
  });

  it("reports slow zones it drives through", () => {
    const slow = { id: 2, kind: "slow" as const, x: sx, y: sy, radius: HAZARD_SPECS.slow.radius, owner: "ghost", armsAt: 0, expiresAt: 99 };
    expect(drive(onRoad, { hazards: [slow] }, 0.2).hit?.id).toBe(2);
  });
});
