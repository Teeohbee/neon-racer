import { describe, expect, it } from "vitest";
import { createDebris, DEBRIS, flashAlpha, launchSpeed, RING, ringAlpha, ringRadius, ringWidth, stepDebris } from "../src/render/explosion-math";

describe("stepDebris", () => {
  const one = (vx: number, vy: number, life = 2) => {
    const d = createDebris(1);
    d.vx[0] = vx;
    d.vy[0] = vy;
    d.life[0] = life;
    d.max[0] = life;
    return d;
  };

  it("slows debris by drag", () => {
    const d = one(500, 0);
    for (let n = 0; n < 30; n++) stepDebris(d, 0, 1, 1 / 60);
    expect(d.vx[0]).toBeCloseTo(500 * Math.exp(-DEBRIS.drag * 0.5), 0);
    expect(d.x[0]!).toBeGreaterThan(0);
  });

  it("pulls debris gently down the screen", () => {
    const d = one(0, 0);
    for (let n = 0; n < 60; n++) stepDebris(d, 0, 1, 1 / 60);
    expect(d.vy[0]!).toBeGreaterThan(0);
    expect(d.vy[0]!).toBeLessThan(DEBRIS.gravity);
    expect(d.vx[0]).toBe(0);
  });

  it("counts live debris and leaves dead debris alone", () => {
    const d = one(100, 0, 0.05);
    expect(stepDebris(d, 0, 1, 0.02)).toBe(1);
    expect(stepDebris(d, 0, 1, 0.05)).toBe(0);
    const x = d.x[0];
    expect(stepDebris(d, 0, 1, 0.05)).toBe(0);
    expect(d.x[0]).toBe(x);
  });
});

describe("launchSpeed", () => {
  it("spans the range with most debris slow and a few fast streaks", () => {
    expect(launchSpeed(0)).toBe(DEBRIS.speedMin);
    expect(launchSpeed(1)).toBe(DEBRIS.speedMax);
    expect(launchSpeed(0.5)).toBeLessThan((DEBRIS.speedMin + DEBRIS.speedMax) / 2);
  });
});

describe("shockwave ring", () => {
  it("expands fast then eases out to full radius", () => {
    expect(ringRadius(0, 1)).toBe(0);
    expect(ringRadius(RING.life * 0.25, 1)).toBeGreaterThan(RING.radius * 0.5);
    expect(ringRadius(RING.life, 1)).toBeCloseTo(RING.radius);
    expect(ringRadius(RING.life * 2, 0.5)).toBeCloseTo(RING.radius * 0.5);
  });

  it("fades and thins as it grows", () => {
    expect(ringAlpha(0)).toBe(1);
    expect(ringAlpha(RING.life / 2)).toBeLessThan(0.5);
    expect(ringAlpha(RING.life)).toBe(0);
    expect(ringWidth(0, 1)).toBeGreaterThan(ringWidth(RING.life / 2, 1));
    expect(flashAlpha(0)).toBe(1);
    expect(flashAlpha(RING.flash)).toBe(0);
  });
});
