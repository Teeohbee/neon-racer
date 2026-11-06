export type NavDir = "up" | "down" | "left" | "right";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const KEYS: Record<string, NavDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const EDGE_SLACK = 4;
const SIDEWAYS_WEIGHT = 2;

export function navDir(key: string): NavDir | null {
  return KEYS[key] ?? null;
}

const span = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));

function ahead(from: Box, to: Box, dir: NavDir): number | null {
  const gap =
    dir === "down" ? to.y - (from.y + from.h) : dir === "up" ? from.y - (to.y + to.h) : dir === "right" ? to.x - (from.x + from.w) : from.x - (to.x + to.w);
  return gap >= -EDGE_SLACK ? Math.max(0, gap) : null;
}

function sideways(from: Box, to: Box, dir: NavDir): number {
  return dir === "up" || dir === "down" ? span(from.x, from.x + from.w, to.x, to.x + to.w) : span(from.y, from.y + from.h, to.y, to.y + to.h);
}

export function nextFocus(boxes: Box[], from: number, dir: NavDir): number {
  if (!boxes.length) return -1;
  const current = boxes[from];
  if (!current) return dir === "up" || dir === "left" ? boxes.length - 1 : 0;
  let best = -1;
  let bestScore = Infinity;
  boxes.forEach((box, i) => {
    if (i === from) return;
    const gap = ahead(current, box, dir);
    if (gap === null) return;
    const score = gap + SIDEWAYS_WEIGHT * sideways(current, box, dir);
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  if (best >= 0) return best;
  if (dir === "left" || dir === "right") return from;
  return wrapAround(boxes, from, dir);
}

function wrapAround(boxes: Box[], from: number, dir: "up" | "down"): number {
  const current = boxes[from]!;
  const edge = dir === "down" ? Math.min(...boxes.map((b) => b.y)) : Math.max(...boxes.map((b) => b.y + b.h));
  let best = from;
  let bestScore = Infinity;
  boxes.forEach((box, i) => {
    if (i === from) return;
    const score = (dir === "down" ? box.y - edge : edge - (box.y + box.h)) + SIDEWAYS_WEIGHT * sideways(current, box, dir);
    if (score < bestScore) [best, bestScore] = [i, score];
  });
  return best;
}
