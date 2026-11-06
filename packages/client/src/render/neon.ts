import type { Graphics, StrokeAttributes } from "pixi.js";

export const CORE = { width: 0.34, min: 1, max: 2.5, mix: 0.82, alpha: 0.92 };

export interface NeonStroke extends Pick<StrokeAttributes, "cap" | "join"> {
  width: number;
  color: number;
  alpha?: number;
}

export function mixColor(a: number, b: number, t: number): number {
  const ch = (shift: number) => Math.round(((a >> shift) & 0xff) + (((b >> shift) & 0xff) - ((a >> shift) & 0xff)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

export const coreColor = (color: number) => mixColor(color, 0xffffff, CORE.mix);

export function coreStyle(style: NeonStroke): NeonStroke {
  return {
    ...style,
    width: Math.min(CORE.max, Math.max(CORE.min, style.width * CORE.width)),
    color: coreColor(style.color),
    alpha: (style.alpha ?? 1) * CORE.alpha,
  };
}

export function neonStroke(g: Graphics, shape: (g: Graphics) => unknown, style: NeonStroke): Graphics {
  shape(g);
  g.stroke(style);
  shape(g);
  return g.stroke(coreStyle(style));
}

export function drawCarCore(g: Graphics, length: number, width: number): Graphics {
  const hl = length / 2;
  const hw = width / 2;
  g.roundRect(-hl, -hw, length, width, 6).stroke({ width: 1.1, color: 0xffffff, alpha: CORE.alpha });
  return g.moveTo(hl - 13, -hw + 3).lineTo(hl - 9, 0).lineTo(hl - 13, hw - 3).stroke({ width: 1, color: 0xffffff, alpha: CORE.alpha, join: "round" });
}
