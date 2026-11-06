import { describe, expect, it } from "vitest";
import { LIGHT } from "../src/render/palette";
import type { CarView } from "../src/render/types";
import { collectGlints, createGlints } from "../src/render/wet-road";

const car = (over: Partial<CarView> = {}): CarView => ({
  id: "a", name: "a", color: 0x00f0ff, x: 100, y: 200, angle: 0, speed: 300, drifting: false, alive: true, frozen: false, isYou: false, boosting: false, ...over,
});
const lamp = (alpha = 0.6) => ({ x: 50, y: 60, size: 400, color: 0xffd8c8, alpha });
const noBrake = () => 0;

describe("collectGlints", () => {
  it("reflects a car's underglow, headlights and tail lamps", () => {
    const out = createGlints(16);
    const n = collectGlints(out, [car()], [], noBrake);
    const colors = out.slice(0, n).map((g) => g.color);
    expect(colors.filter((c) => c === 0x00f0ff)).toHaveLength(1);
    expect(colors.filter((c) => c === LIGHT.headlight)).toHaveLength(2);
    expect(colors.filter((c) => c === LIGHT.tail)).toHaveLength(2);
  });

  it("puts headlights ahead of the car and tail lamps behind it", () => {
    const out = createGlints(16);
    const n = collectGlints(out, [car({ angle: 0 })], [], noBrake);
    const glints = out.slice(0, n);
    expect(glints.filter((g) => g.color === LIGHT.headlight).every((g) => g.x > 100)).toBe(true);
    expect(glints.filter((g) => g.color === LIGHT.tail).every((g) => g.x < 100)).toBe(true);
  });

  it("stretches and brightens tail lamp reflections under braking", () => {
    const tailOf = (brake: number) => {
      const out = createGlints(16);
      const n = collectGlints(out, [car()], [], () => brake);
      return out.slice(0, n).find((g) => g.color === LIGHT.tail)!;
    };
    expect(tailOf(1).length).toBeGreaterThan(tailOf(0).length);
    expect(tailOf(1).alpha).toBeGreaterThan(tailOf(0).alpha);
  });

  it("skips eliminated cars and shows frozen ones as a single ice glint", () => {
    const out = createGlints(16);
    expect(collectGlints(out, [car({ alive: false })], [], noBrake)).toBe(0);
    const n = collectGlints(out, [car({ frozen: true })], [], noBrake);
    expect(out.slice(0, n).map((g) => g.color)).toEqual([LIGHT.frozen]);
  });

  it("reflects scenery lights, softer than the light itself, and ignores dim ones", () => {
    const out = createGlints(16);
    expect(collectGlints(out, [], [lamp(0.01)], noBrake)).toBe(0);
    expect(collectGlints(out, [], [lamp()], noBrake)).toBe(1);
    expect(out[0]!.alpha).toBeLessThan(0.6);
    expect(out[0]!.length).toBeGreaterThan(out[0]!.width);
  });

  it("stops at the pool size and reuses the same glint objects", () => {
    const out = createGlints(4);
    const first = out[0];
    expect(collectGlints(out, [car(), car({ id: "b" })], [lamp(), lamp()], noBrake)).toBe(4);
    expect(out).toHaveLength(4);
    expect(out[0]).toBe(first);
  });
});
