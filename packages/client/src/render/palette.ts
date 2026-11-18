import type { HazardKind } from "@neon/sim";

export const PLAYER_COLORS = [0x00f0ff, 0xff2bd6, 0xb6ff00, 0xffb000, 0x8a5bff, 0xff3b3b] as const;

/** What people call each car colour, in the same order as PLAYER_COLORS. Local play names Seats by these. */
export const PLAYER_COLOR_NAMES = ["Cyan", "Pink", "Lime", "Amber", "Violet", "Red"] as const;

export const playerColor = (index: number): number => PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]!;

export const UI = {
  background: 0x05060d,
  ground: 0x30313c,
  grid: 0x464c66,
  gridMajor: 0x5c6690,
  worldFrame: 0x6a80c8,
  road: 0x55576a,
  roadMark: 0xa8b2e0,
  grain: 0.55,
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

export const LIGHT = {
  ambient: 0x23253a,
  ambientBright: 0x7a7c98,
  headlight: 0xfff0d2,
  tail: 0xff2236,
  frozen: 0x6fd0ff,
  startLine: 0xdde6ff,
  drop: 0xff3a1a,
  boost: 0xffd23a,
  danger: 0xff1030,
};

export const FEATURE = {
  void: 0x000000,
  cliff: 0x7a1830,
  dropEdge: 0xff3020,
  dropStripe: 0xffaa00,
  boost: 0xffd23a,
  boostCore: 0xffffff,
  boostBase: 0xfff0a0,
  danger: 0xff1a3a,
  dangerCore: 0xffe0e6,
};

export const HAZARD_COLORS: Record<HazardKind, number> = {
  block: 0xff5a1f,
  slow: 0xc77dff,
  freeze: 0x7fe9ff,
};

export const css = (color: number): string => `#${color.toString(16).padStart(6, "0")}`;
