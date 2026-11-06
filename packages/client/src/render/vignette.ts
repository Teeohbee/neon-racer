import { Sprite, Texture } from "pixi.js";
import { stepVignette, VIGNETTE_IDLE, vignetteAlpha, type VignetteState } from "./envelopes";

const DANGER_RED = 0xff1a3c;

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function edgeTexture(size = 256): Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, r * 0.45, r, r, r * Math.SQRT2);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.35, "rgba(255,255,255,0.18)");
  g.addColorStop(0.7, "rgba(255,255,255,0.75)");
  g.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export function createVignette() {
  const texture = edgeTexture();
  const view = new Sprite(texture);
  view.tint = DANGER_RED;
  view.visible = false;
  let state: VignetteState = VIGNETTE_IDLE;
  let target = 0;

  return {
    view,
    set(level: number) {
      target = level;
    },
    update(rect: ViewRect, dt: number) {
      state = stepVignette(state, target, dt);
      const alpha = vignetteAlpha(state);
      view.visible = alpha > 0;
      if (!view.visible) return;
      view.alpha = alpha;
      view.position.set(rect.x, rect.y);
      view.width = rect.w;
      view.height = rect.h;
    },
    destroy() {
      view.destroy();
      texture.destroy(true);
    },
  };
}
