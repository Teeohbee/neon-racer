import type { HazardKind } from "@neon/sim";

export const PLAYER_COLORS = [0x00f0ff, 0xff2bd6, 0xb6ff00, 0xffb000, 0x8a5bff, 0xff3b3b] as const;

export const playerColor = (index: number): number => PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;

export const UI = {
  background: 0x05060d,
  grid: 0x1a2340,
  gridMajor: 0x24305a,
  worldFrame: 0x3a4a80,
  road: 0x0c1022,
  edgeLeft: 0x00e5ff,
  edgeRight: 0xff2bd6,
  startLine: 0xffffff,
  sketchStroke: 0xffffff,
  valid: 0x39ff88,
  invalid: 0xff3b5c,
  ice: 0xaeeeff,
  skid: 0x6b7bb8,
  letterbox: 0x000000,
  viewFrame: 0x2a3866,
};

export const HAZARD_COLORS: Record<HazardKind, number> = {
  block: 0xff5a1f,
  slow: 0xc77dff,
  freeze: 0x7fe9ff,
};

export const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;
