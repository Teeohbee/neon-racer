import type { Graphics } from "pixi.js";
import { pointAt, TRACK_WIDTH, type Track } from "@neon/sim";
import { glitchDensity, hash01, rowTear } from "./fx-math";
import { FEATURE, UI } from "./palette";

const HALF = TRACK_WIDTH / 2 + 70;
const CELL = 14;
const ROW = 16;
const ROWS = 10;
const COLS = Math.ceil((HALF * 2) / CELL);
const TICK_RATE = 18;
const SEGMENT = 4;
const COLORS = [FEATURE.danger, FEATURE.dangerCore, UI.edgeLeft, UI.edgeRight] as const;

const groups: number[][][] = COLORS.map(() => []);

function cellGroup(h: number, density: number, pick: number): number {
  if (h < density * 0.04) return pick < 0.5 ? 2 : 3;
  return h < density * 0.18 ? 1 : 0;
}

function drawWake(g: Graphics, track: Track, s: number, tick: number, surge: number) {
  for (let row = ROWS - 1; row >= 0; row--) {
    const [x, y, a] = pointAt(track, s - (row + 0.5) * ROW + surge);
    const tx = Math.cos(a);
    const ty = Math.sin(a);
    const tear = rowTear(row, tick, CELL);
    const density = glitchDensity(row, ROWS);
    for (const list of groups) list.length = 0;
    for (let col = 0; col < COLS; col++) {
      const h = hash01(col, row, tick);
      if (h >= density) continue;
      const across = -HALF + (col + 0.5) * CELL + tear;
      const along = (hash01(col, row, tick + 7919) - 0.5) * ROW * 0.5;
      const w = CELL * (0.35 + 0.3 * hash01(col, row, tick * 3 + 1));
      const d = ROW * (0.2 + 0.25 * hash01(col, row, tick * 5 + 2));
      const cx = x + tx * along - ty * across;
      const cy = y + ty * along + tx * across;
      const ax = tx * d;
      const ay = ty * d;
      const bx = -ty * w;
      const by = tx * w;
      groups[cellGroup(h, density, hash01(col, tick, 13))]!.push([cx - ax - bx, cy - ay - by, cx + ax - bx, cy + ay - by, cx + ax + bx, cy + ay + by, cx - ax + bx, cy - ay + by]);
    }
    const alpha = row < 2 ? 0.95 : 0.85 * (1 - row / ROWS);
    groups.forEach((list, k) => {
      if (!list.length) return;
      for (const quad of list) g.poly(quad, true);
      g.fill({ color: COLORS[k]!, alpha: k === 0 ? alpha : Math.min(1, alpha * 1.2) });
    });
  }
}

function drawFront(g: Graphics, track: Track, s: number, tick: number, pulse: number) {
  const [x, y, a] = pointAt(track, s);
  const tx = Math.cos(a);
  const ty = Math.sin(a);
  const nx = -ty;
  const ny = tx;
  const segments = (width: number, alpha: number) => {
    for (let col = 0; col < COLS; col += SEGMENT) {
      const torn = hash01(col, tick, 17) < 0.15 ? (hash01(col, tick, 18) - 0.5) * 14 : 0;
      const from = -HALF + col * CELL;
      const to = Math.min(HALF, from + SEGMENT * CELL);
      g.moveTo(x + tx * torn + nx * from, y + ty * torn + ny * from).lineTo(x + tx * torn + nx * to, y + ty * torn + ny * to);
    }
    g.stroke({ width, color: FEATURE.danger, alpha });
  };
  segments(26, 0.25 * pulse);
  segments(8, 1);
  g.moveTo(x - nx * HALF, y - ny * HALF).lineTo(x + nx * HALF, y + ny * HALF).stroke({ width: 2.5, color: FEATURE.dangerCore, alpha: pulse * (hash01(tick, 0, 19) < 0.1 ? 0.3 : 1) });
  for (const k of [-1, 1]) {
    g.rect(x + nx * HALF * k - 8, y + ny * HALF * k - 8, 16, 16).fill({ color: FEATURE.danger }).stroke({ width: 2.5, color: FEATURE.dangerCore });
  }
}

export function drawDangerLine(g: Graphics, track: Track | null, s: number | null | undefined, t: number) {
  g.clear();
  if (!track || s === null || s === undefined) return;
  const tick = Math.floor(t * TICK_RATE);
  const surge = hash01(tick, 0, 21) < 0.08 ? (hash01(tick, 0, 22) - 0.5) * ROW : 0;
  const pulse = 0.75 + 0.25 * Math.sin(t * 9);
  drawWake(g, track, s, tick, surge);
  drawFront(g, track, s, tick, pulse);
}
