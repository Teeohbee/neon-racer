import { describe, expect, it } from "vitest";
import { createFpsMeter } from "../src/fps-meter";

const run = (meter: ReturnType<typeof createFpsMeter>, start: number, gaps: number[]) => {
  let t = start;
  let last = null;
  for (const gap of gaps) last = meter.frame((t += gap)) ?? last;
  return last;
};

describe("fps meter", () => {
  it("reports frames per second over each half-second window", () => {
    const meter = createFpsMeter();
    meter.frame(0);
    expect(run(meter, 0, Array(30).fill(1000 / 60))).toEqual({ fps: 60, worstMs: 17 });
  });

  it("reports the slowest frame so a stutter shows even when the average is fine", () => {
    const meter = createFpsMeter();
    meter.frame(0);
    expect(run(meter, 0, [...Array(26).fill(1000 / 60), 80])?.worstMs).toBe(80);
  });

  it("stays quiet until a window has passed", () => {
    const meter = createFpsMeter();
    meter.frame(0);
    expect(meter.frame(100)).toBeNull();
  });

  it("starts fresh after a long pause instead of reporting it as one slow frame", () => {
    const meter = createFpsMeter();
    meter.frame(0);
    meter.frame(5000);
    expect(run(meter, 5000, Array(30).fill(1000 / 60))).toEqual({ fps: 60, worstMs: 17 });
  });
});
