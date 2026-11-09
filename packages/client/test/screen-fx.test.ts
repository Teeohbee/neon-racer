import { describe, expect, it } from "vitest";
import { barrel, kickPulse, MAX_SPLIT, PULSE, PULSE_TIME, splitOffset, stepPulse, stepVignette, VIGNETTE_IDLE, VIGNETTE_MAX, vignetteAlpha, vignetteRate, type VignetteState } from "../src/render/envelopes";

const run = (state: VignetteState, target: number, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) state = stepVignette(state, target, dt);
  return state;
};

const peak = (target: number) => {
  let state = run(VIGNETTE_IDLE, target, 2);
  let max = 0;
  for (let i = 0; i < 120; i++) {
    state = stepVignette(state, target, 1 / 60);
    max = Math.max(max, vignetteAlpha(state));
  }
  return max;
};

describe("chromatic pulse", () => {
  it("takes the stronger of the current pulse and a new kick", () => {
    expect(kickPulse(0, PULSE.boost)).toBe(PULSE.boost);
    expect(kickPulse(0.8, PULSE.boost)).toBe(0.8);
    expect(kickPulse(0, 5)).toBe(1);
    expect(kickPulse(0, Number.NaN)).toBe(0);
  });

  it("dies away to nothing within the pulse time", () => {
    let amount = kickPulse(0, PULSE.eliminated);
    expect(stepPulse(amount, PULSE_TIME / 2)).toBeCloseTo(0.5);
    for (let t = 0; t < PULSE_TIME + 0.02; t += 1 / 60) amount = stepPulse(amount, 1 / 60);
    expect(amount).toBe(0);
  });

  it("splits hardest at full strength and not at all when idle", () => {
    expect(splitOffset(1)).toBe(MAX_SPLIT);
    expect(splitOffset(0)).toBe(0);
    expect(splitOffset(PULSE.boost)).toBeLessThan(MAX_SPLIT / 2);
  });
});

describe("danger vignette", () => {
  it("is invisible while safe", () => {
    expect(peak(0)).toBe(0);
  });

  it("gets stronger as the line closes in, up to a cap", () => {
    expect(peak(0.2)).toBeGreaterThan(0);
    expect(peak(0.6)).toBeGreaterThan(peak(0.2));
    expect(peak(1)).toBeGreaterThan(peak(0.6));
    expect(peak(1)).toBeLessThanOrEqual(VIGNETTE_MAX);
  });

  it("pulses faster as the line closes in", () => {
    expect(vignetteRate(1)).toBeGreaterThan(vignetteRate(0.5));
    expect(vignetteRate(0.5)).toBeGreaterThan(vignetteRate(0));
  });

  it("fades out rather than snapping off, then switches off fully", () => {
    const hot = run(VIGNETTE_IDLE, 1, 1);
    const fading = stepVignette(hot, 0, 1 / 60);
    expect(fading.level).toBeGreaterThan(0);
    expect(fading.level).toBeLessThan(hot.level);
    expect(run(hot, 0, 3)).toEqual(VIGNETTE_IDLE);
  });

  it("ignores junk levels", () => {
    expect(stepVignette(VIGNETTE_IDLE, Number.NaN, 1 / 60)).toEqual(VIGNETTE_IDLE);
    expect(run(VIGNETTE_IDLE, 7, 2).level).toBeLessThanOrEqual(1);
  });
});


describe("barrel", () => {
  it("leaves the centre where it is", () => {
    expect(barrel(500, 300, { x: 0, y: 0, w: 1000, h: 600 }, 0.07)).toEqual([500, 300]);
  });

  it("pushes points out towards the corners, as the CRT shows them", () => {
    const [x, y] = barrel(900, 540, { x: 0, y: 0, w: 1000, h: 600 }, 0.07);
    expect(x).toBeCloseTo(900 + 400 * 0.07 * 1.28, 5);
    expect(y).toBeCloseTo(540 + 240 * 0.07 * 1.28, 5);
  });

  it("curves around the game view, not the whole window", () => {
    expect(barrel(1000, 450, { x: 280, y: 0, w: 1440, h: 900 }, 0.07)).toEqual([1000, 450]);
  });
});
