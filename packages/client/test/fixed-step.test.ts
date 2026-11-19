import { describe, expect, it } from "vitest";
import { blendCar, createFixedStep } from "../src/shell/fixed-step";

const DT = 1 / 60;

/** How far a body moving 10 units a step appears to move each frame, drawn between its last two steps. */
function drawnSteps(hz: number, seconds = 2): number[] {
  const clock = createFixedStep(DT);
  let prev = { x: 0, y: 0, angle: 0, vx: 0, vy: 0 };
  let cur = prev;
  let last = 0;
  const steps: number[] = [];
  for (let f = 0; f < hz * seconds; f++) {
    const t = clock.advance(1 / hz, () => {
      prev = cur;
      cur = { ...cur, x: cur.x + 10 };
    });
    const x = blendCar(prev, cur, t).x;
    if (f > 0) steps.push(x - last);
    last = x;
  }
  return steps;
}

describe("drawing a 60 Hz sim", () => {
  it.each([60, 90, 120, 144])("moves the same distance every frame at %i Hz", (hz) => {
    const each = (10 * 60) / hz;
    // Skip the frames before the sim has stepped twice: until then there is nothing to draw between.
    for (const step of drawnSteps(hz).slice(4)) expect(step).toBeCloseTo(each, 6);
  });

  it("steps once per whole tick, carrying the rest to the next frame", () => {
    const clock = createFixedStep(DT);
    let steps = 0;
    expect(clock.advance(DT * 1.5, () => steps++)).toBeCloseTo(0.5);
    expect(steps).toBe(1);
    expect(clock.advance(DT * 0.75, () => steps++)).toBeCloseTo(0.25);
    expect(steps).toBe(2);
  });

  it("drops time it could never catch up on after a long stall", () => {
    const clock = createFixedStep(DT, 0.1);
    let steps = 0;
    clock.advance(5, () => steps++);
    expect(steps).toBe(6);
  });
});

describe("blending two car states", () => {
  it("turns the short way round", () => {
    expect(blendCar({ x: 0, y: 0, angle: 3, vx: 0, vy: 0 }, { x: 0, y: 0, angle: -3, vx: 0, vy: 0 }, 0.5).angle).toBeCloseTo(Math.PI, 1);
  });
});
