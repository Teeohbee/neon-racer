import type { Graphics } from "pixi.js";
import { TRACK_WIDTH, type Track } from "@neon/sim";
import { acrossTrack } from "./geometry";
import { neonStroke } from "./neon";

const HALF = TRACK_WIDTH / 2;
const STEP = 20;
const RAMP = 140;
const SLICE = 40;
const RAIL = 8;
const SHADOW = { dx: 22, dy: 30, alpha: 0.5 };
const DECK = 0x24253a;
const RAIL_COLOR = 0x10121e;

export function runLength(track: Track, [from, to]: [number, number]): number {
  return (((to - from) % track.length) + track.length) % track.length;
}

export function rampAlpha(along: number, length: number): number {
  return Math.min(1, along / RAMP, (length - along) / RAMP);
}

function strip(track: Track, from: number, to: number, offset: number): number[] {
  const left: number[] = [];
  const right: number[] = [];
  for (let s = from; s <= to + 0.1; s += STEP) {
    left.push(...acrossTrack(track, Math.min(s, to), -offset));
    right.unshift(...acrossTrack(track, Math.min(s, to), offset));
  }
  return [...left, ...right];
}

function line(track: Track, from: number, to: number, offset: number): number[] {
  const out: number[] = [];
  for (let s = from; s <= to + 0.1; s += STEP) out.push(...acrossTrack(track, Math.min(s, to), offset));
  return out;
}

export function drawBridgeShadows(g: Graphics, track: Track) {
  g.clear();
  for (const run of track.bridges) {
    const length = runLength(track, run);
    const pts = strip(track, run[0] + RAMP, run[0] + length - RAMP, HALF + RAIL);
    g.poly(pts.map((v, i) => v + (i % 2 ? SHADOW.dy : SHADOW.dx)), true).fill({ color: 0x000000, alpha: SHADOW.alpha });
  }
}

export function drawBridgeDecks(g: Graphics, track: Track, edges: readonly [number, number]) {
  g.clear();
  for (const run of track.bridges) {
    const length = runLength(track, run);
    for (let along = 0; along < length; along += SLICE) {
      const from = run[0] + along;
      const to = run[0] + Math.min(length, along + SLICE + 2);
      const alpha = rampAlpha(along + SLICE / 2, length);
      g.poly(strip(track, from, to, HALF + RAIL), true).fill({ color: DECK, alpha });
      for (const side of [-1, 1]) {
        g.poly(line(track, from, to, side * (HALF + RAIL / 2)), false).stroke({ width: RAIL, color: RAIL_COLOR, alpha });
        neonStroke(g, (p) => p.poly(line(track, from, to, side * HALF), false), { width: 4, color: edges[side < 0 ? 0 : 1], alpha });
      }
    }
  }
}
