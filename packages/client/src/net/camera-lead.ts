import type { Camera } from "@neon/sim";

/** How quickly the lead follows a change in how far ahead to draw, per second. Fast enough to keep up, slow enough to hide the ticks. */
const EASE = 8;

/**
 * Draws the camera as far ahead of the snapshots as your car is, so you stay in shot when you lead. The snapshots'
 * camera moves smoothly but late; the camera run on ahead (`SnapshotBuffer.cameraAhead`) is on time but steps a tick
 * at a time and jumps when a snapshot lands. So the smooth one is drawn, plus an eased offset to the one ahead.
 */
export class CameraLead {
  private offset = { x: 0, y: 0 };

  /** `ahead` is null when there is nothing to run ahead of (you're out, or not racing): the offset eases away. */
  frame(sampled: Camera, ahead: Camera | null, dt: number): Camera {
    const target = ahead ? { x: ahead.x - sampled.x, y: ahead.y - sampled.y } : { x: 0, y: 0 };
    const k = 1 - Math.exp(-EASE * dt);
    this.offset = { x: this.offset.x + (target.x - this.offset.x) * k, y: this.offset.y + (target.y - this.offset.y) * k };
    return { x: sampled.x + this.offset.x, y: sampled.y + this.offset.y, scale: sampled.scale };
  }

  reset(): void {
    this.offset = { x: 0, y: 0 };
  }
}
