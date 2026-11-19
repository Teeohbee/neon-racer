import type { CarState } from "@neon/sim";
import { lerpAngle } from "../net/interpolation";

/**
 * A fixed-rate sim drawn at whatever rate the screen runs. Drawing only the latest step judders
 * whenever the screen isn't a multiple of the sim's rate: at 90 Hz a 60 Hz sim moves on two frames
 * of every three. So `advance` also says how far the frame is into the next step, for drawing
 * between the last two steps with `blendCar`.
 */
export function createFixedStep(dt: number, maxFrame = 0.25) {
  let carry = 0;
  return {
    /** Run every whole step this frame covers; returns 0..1, how far the frame is into the next one. */
    advance(frameSeconds: number, step: () => void): number {
      carry += Math.min(maxFrame, frameSeconds);
      while (carry >= dt - 1e-9) {
        carry -= dt;
        step();
      }
      return Math.max(0, carry / dt);
    },
    reset(): void {
      carry = 0;
    },
  };
}

export function blendCar(prev: CarState, cur: CarState, t: number): CarState {
  return {
    x: prev.x + (cur.x - prev.x) * t,
    y: prev.y + (cur.y - prev.y) * t,
    angle: lerpAngle(prev.angle, cur.angle, t),
    vx: cur.vx,
    vy: cur.vy,
  };
}
