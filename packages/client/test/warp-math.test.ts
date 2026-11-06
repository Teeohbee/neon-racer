import { describe, expect, it } from "vitest";
import { createField, decay, drag, falloff, heat, push, REST, shift, SPRING, stepField, type Field } from "../src/render/warp-math";

const at = (f: Field, i: number, j: number) => j * f.cols + i;

const run = (f: Field, seconds: number) => {
  let peak = 0;
  for (let t = 0; t < seconds; t += SPRING.step) peak = stepField(f, SPRING.step);
  return peak;
};

describe("falloff", () => {
  it("is full at the centre, zero at and past the radius, and falls smoothly between", () => {
    expect(falloff(0, 100)).toBe(1);
    expect(falloff(100, 100)).toBe(0);
    expect(falloff(150, 100)).toBe(0);
    let last = 1;
    for (let d = 5; d < 100; d += 5) {
      const w = falloff(d, 100);
      expect(w).toBeLessThan(last);
      last = w;
    }
    expect(falloff(99, 100)).toBeLessThan(0.001);
  });

  it("is zero for a zero radius", () => {
    expect(falloff(0, 0)).toBe(0);
  });
});

describe("decay", () => {
  it("halves over ln 2 / rate and compounds across steps", () => {
    expect(decay(2, Math.LN2 / 2)).toBeCloseTo(0.5);
    expect(decay(3, 0.1) * decay(3, 0.1)).toBeCloseTo(decay(3, 0.2));
    expect(decay(0, 1)).toBe(1);
  });
});

describe("push", () => {
  it("kicks points outward from the centre, strongest nearest it", () => {
    const f = createField(11, 11, 50);
    push(f, 250, 250, 600, 200);
    expect(f.vx[at(f, 6, 5)]).toBeGreaterThan(0);
    expect(f.vx[at(f, 4, 5)]).toBeLessThan(0);
    expect(f.vy[at(f, 5, 6)]).toBeGreaterThan(0);
    expect(f.vx[at(f, 5, 5)]).toBe(0);
    expect(f.vx[at(f, 6, 5)]!).toBeGreaterThan(f.vx[at(f, 7, 5)]!);
    expect(f.vx[at(f, 9, 5)]).toBe(0);
  });

  it("pulls inward for a negative strength", () => {
    const f = createField(11, 11, 50);
    push(f, 250, 250, -300, 200);
    expect(f.vx[at(f, 6, 5)]).toBeLessThan(0);
  });

  it("ignores points outside the field", () => {
    const f = createField(4, 4, 50);
    expect(() => push(f, -500, -500, 900, 300)).not.toThrow();
    expect(() => push(f, 1000, 1000, 900, 300)).not.toThrow();
    expect(f.vx.every((v) => v === 0)).toBe(true);
  });
});

describe("drag", () => {
  it("drags nearby points along with the push", () => {
    const f = createField(11, 11, 50);
    drag(f, 250, 250, 40, 0, 120);
    expect(f.vx[at(f, 5, 5)]).toBeCloseTo(40);
    expect(f.vx[at(f, 6, 5)]!).toBeGreaterThan(0);
    expect(f.vx[at(f, 6, 5)]!).toBeLessThan(40);
    expect(f.vy[at(f, 6, 5)]).toBe(0);
    expect(f.vx[at(f, 9, 5)]).toBe(0);
  });
});

describe("stepField", () => {
  it("leaves a field at rest untouched", () => {
    const f = createField(8, 8, 50);
    expect(stepField(f, SPRING.step)).toBe(0);
    expect(f.dx.every((v) => v === 0)).toBe(true);
  });

  it("spreads a kick to the neighbours", () => {
    const f = createField(21, 21, 50);
    f.vx[at(f, 10, 10)] = 500;
    stepField(f, SPRING.step);
    stepField(f, SPRING.step);
    expect(f.dx[at(f, 11, 10)]!).toBeGreaterThan(0);
    expect(f.dx[at(f, 10, 11)]!).toBeGreaterThan(0);
  });

  it("springs back to rest after an explosion without blowing up", () => {
    const f = createField(41, 41, 50);
    push(f, 1000, 1000, 900, 380);
    let peak = 0;
    for (let t = 0; t < 0.5; t += SPRING.step) peak = Math.max(peak, stepField(f, SPRING.step));
    expect(peak).toBeGreaterThan(10);
    expect(peak).toBeLessThanOrEqual(SPRING.limit * 50 + 1e-3);
    expect(run(f, 4)).toBeLessThan(REST);
  });

  it("stays stable at the slowest frame the renderer allows", () => {
    const f = createField(21, 21, 50);
    for (let k = 0; k < f.dx.length; k++) f.dx[k] = k % 2 ? 20 : -20;
    for (let n = 0; n < 600; n++) stepField(f, SPRING.step);
    expect(f.dx.every((v) => Math.abs(v) < 1)).toBe(true);
  });

  it("caps displacement so lines never fold past a neighbour", () => {
    const f = createField(5, 5, 50);
    f.vx[at(f, 2, 2)] = 1e6;
    stepField(f, SPRING.step);
    expect(f.dx[at(f, 2, 2)]).toBeCloseTo(SPRING.limit * 50);
  });
});

describe("shift", () => {
  it("moves state with the window and clears what scrolls in", () => {
    const f = createField(4, 3, 50);
    f.dx[at(f, 2, 1)] = 7;
    f.vy[at(f, 3, 2)] = 9;
    shift(f, 1, 1);
    expect(f.dx[at(f, 1, 0)]).toBe(7);
    expect(f.vy[at(f, 2, 1)]).toBe(9);
    expect(f.dx[at(f, 2, 1)]).toBe(0);
    shift(f, -3, 0);
    expect(f.dx.every((v) => v === 0)).toBe(true);
  });
});

describe("heat", () => {
  it("is cold at rest length and grows with stretch or squash", () => {
    expect(heat(0, 0, 50, 0, 50)).toBe(0);
    expect(heat(0, 0, 60, 0, 50)).toBeGreaterThan(0);
    expect(heat(0, 0, 40, 0, 50)).toBeCloseTo(heat(0, 0, 60, 0, 50));
    expect(heat(0, 0, 200, 0, 50)).toBe(1);
  });
});
