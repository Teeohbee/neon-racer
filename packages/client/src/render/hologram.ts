import type { Graphics } from "pixi.js";
import { ARM_DELAY, type Hazard } from "@neon/sim";
import { chordHalfWidth, hash01, hologramAlpha, hologramProgress } from "./fx-math";

const SCAN_GAP = 6;
const SWEEP_RATE = 2.4;
const SWEEP_BAND = 3;
const TEAR_RATE = 30;

export interface HologramTarget {
  line: Graphics;
  zone: Graphics;
}

function octagon(x: number, y: number, radius: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  return pts;
}

export function drawHologram({ line, zone }: HologramTarget, h: Hazard, x: number, y: number, radius: number, color: number, now: number) {
  const shape = h.kind === "block" ? "octagon" : "circle";
  const progress = hologramProgress(now, h.armsAt, ARM_DELAY);
  const alpha = hologramAlpha(progress, now, h.id);
  const tick = Math.floor(now * TEAR_RATE);
  const outline = (r: number, dx = 0) => (shape === "octagon" ? line.poly(octagon(x + dx, y, r), true) : line.circle(x + dx, y, r));

  zone.circle(x, y, radius).fill({ color, alpha: 0.04 + 0.1 * progress });

  for (let dy = -radius + SCAN_GAP / 2; dy < radius; dy += SCAN_GAP) {
    const half = chordHalfWidth(shape, radius, dy);
    if (half <= 0) continue;
    const row = Math.round(dy / SCAN_GAP);
    const tear = hash01(row, tick, h.id) < 0.12 ? (hash01(row, tick, h.id + 1) - 0.5) * radius * 0.4 : 0;
    line.moveTo(x - half + tear, y + dy).lineTo(x + half + tear, y + dy);
  }
  line.stroke({ width: 1.5, color, alpha: alpha * 0.6 });

  const sweep = -radius + 2 * radius * ((now * SWEEP_RATE + hash01(h.id, 0, 41)) % 1);
  for (let k = -SWEEP_BAND; k <= SWEEP_BAND; k++) {
    const dy = sweep + k * 2;
    const half = chordHalfWidth(shape, radius, dy);
    if (half > 0) line.moveTo(x - half, y + dy).lineTo(x + half, y + dy);
  }
  line.stroke({ width: 2, color: 0xffffff, alpha: alpha * 0.8 });

  const jolt = hash01(tick, h.id, 43) < 0.15 ? (hash01(tick, h.id, 44) - 0.5) * 10 : 0;
  outline(radius, jolt);
  line.stroke({ width: 3, color, alpha, join: "round" });

  const landing = 1 - progress;
  if (landing > 0.02) {
    outline(radius * (1 + 0.8 * landing));
    line.stroke({ width: 2, color, alpha: 0.5 * landing, join: "round" });
  }
}
