import { Texture } from "pixi.js";

function canvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return [c, c.getContext("2d")!];
}

export function softLightTexture(size = 128): Texture {
  const [c, ctx] = canvas(size, size);
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.5, "rgba(255,255,255,0.25)");
  g.addColorStop(0.8, "rgba(255,255,255,0.06)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(c);
}

export const CONE_HALF_ANGLE = 0.42;

export function coneLightTexture(length = 256): Texture {
  const height = Math.ceil(Math.tan(CONE_HALF_ANGLE + 0.12) * length) * 2;
  const [c, ctx] = canvas(length, height);
  const cy = height / 2;
  const g = ctx.createRadialGradient(0, cy, 0, 0, cy, length);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.3, "rgba(255,255,255,0.45)");
  g.addColorStop(0.7, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  const layers = 6;
  ctx.globalAlpha = 1 / layers;
  for (let i = 0; i < layers; i++) {
    const a = CONE_HALF_ANGLE * (0.55 + (0.75 * i) / layers);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(length, cy - Math.tan(a) * length);
    ctx.lineTo(length, cy + Math.tan(a) * length);
    ctx.closePath();
    ctx.fill();
  }
  return Texture.from(c);
}

export function grainTexture(size = 256, seed = 7): Texture {
  const [c, ctx] = canvas(size, size);
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  for (let i = 0; i < 90; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 10 + rand() * 40;
    const light = rand() > 0.5;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]] as const) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, light ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = rand();
    if (n > 0.985) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.max(d[i + 3]!, 60 + rand() * 70);
    } else if (n > 0.6) {
      const v = rand() > 0.5 ? 255 : 0;
      const a = rand() * (v ? 22 : 50);
      const ea = d[i + 3]! / 255;
      const na = a / 255;
      const oa = na + ea * (1 - na);
      if (oa > 0) {
        for (let k = 0; k < 3; k++) d[i + k] = (v * na + d[i + k]! * ea * (1 - na)) / oa;
      }
      d[i + 3] = oa * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(c);
}
