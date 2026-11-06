import { describe, expect, it } from "vitest";
import { CORE, coreColor, coreStyle, mixColor } from "../src/render/neon";

describe("mixColor", () => {
  it("blends each channel", () => {
    expect(mixColor(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mixColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mixColor(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
  });
});

describe("coreColor", () => {
  it("is near-white with a hint of the neon hue", () => {
    const core = coreColor(0xff2bd6);
    const [r, g, b] = [core >> 16, (core >> 8) & 0xff, core & 0xff];
    expect(Math.min(r, g, b)).toBeGreaterThan(0xc8);
    expect(r).toBeGreaterThan(g);
    expect(coreColor(0xffffff)).toBe(0xffffff);
  });
});

describe("coreStyle", () => {
  it("is a thin line inside the coloured stroke", () => {
    const core = coreStyle({ width: 4, color: 0x00e5ff, alpha: 0.5, join: "round" });
    expect(core.width).toBeCloseTo(4 * CORE.width);
    expect(core.alpha).toBeCloseTo(0.5 * CORE.alpha);
    expect(core.join).toBe("round");
  });

  it("keeps the core visible on thin lines and thin on fat ones", () => {
    expect(coreStyle({ width: 1, color: 0 }).width).toBe(CORE.min);
    expect(coreStyle({ width: 40, color: 0 }).width).toBe(CORE.max);
  });
});
