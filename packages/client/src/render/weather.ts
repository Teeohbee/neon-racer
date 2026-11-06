import { Container, Texture, TilingSprite } from "pixi.js";
import type { Camera } from "@neon/sim";

export interface WeatherConfig {
  rain: boolean;
  haze: number;
  hazeAlpha: number;
}

export interface Viewport {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
}

const RAIN_ALPHA = 0.16;
const RAIN_SPEED = 900;
const RAIN_DRIFT = 140;

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function rainTexture(size = 256, count = 70): Texture {
  const [c, ctx] = canvas(size);
  let s = 11;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 8 + rand() * 18;
    ctx.strokeStyle = `rgba(200,220,255,${0.25 + rand() * 0.5})`;
    ctx.lineWidth = 1 + rand();
    for (const [ox, oy] of [[0, 0], [0, size], [0, -size], [size, 0], [-size, 0]] as const) {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + len * 0.15, y + oy + len);
      ctx.stroke();
    }
  }
  return Texture.from(c);
}

function hazeTexture(size = 256): Texture {
  const [c, ctx] = canvas(size);
  let s = 5;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 40 + rand() * 90;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size], [size, size], [-size, -size], [size, -size], [-size, size]] as const) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, "rgba(255,255,255,0.5)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  return Texture.from(c);
}

export function createWeather() {
  const view = new Container();
  const rainTex = rainTexture();
  const hazeTex = hazeTexture();
  const haze = new TilingSprite({ texture: hazeTex, width: 2, height: 2 });
  const far = new TilingSprite({ texture: rainTex, width: 2, height: 2 });
  const near = new TilingSprite({ texture: rainTex, width: 2, height: 2 });
  far.tileScale.set(0.6);
  haze.tileScale.set(3);
  for (const s of [far, near]) s.blendMode = "add";
  view.addChild(haze, far, near);
  view.visible = false;

  return {
    view,
    update(config: WeatherConfig | null, port: Viewport, camera: Camera, t: number) {
      view.visible = config !== null;
      if (!config) return;
      for (const s of [haze, far, near]) {
        s.position.set(port.x, port.y);
        s.width = port.w;
        s.height = port.h;
      }
      haze.tint = config.haze;
      haze.alpha = config.hazeAlpha;
      haze.tilePosition.set(-camera.x * port.zoom * 0.9 + t * 12, -camera.y * port.zoom * 0.9 + t * 5);
      far.visible = near.visible = config.rain;
      far.alpha = RAIN_ALPHA * 0.6;
      near.alpha = RAIN_ALPHA;
      far.tilePosition.set(-camera.x * port.zoom * 1.05 + t * RAIN_DRIFT * 0.6, -camera.y * port.zoom * 1.05 + t * RAIN_SPEED * 0.6);
      near.tilePosition.set(-camera.x * port.zoom * 1.15 + t * RAIN_DRIFT, -camera.y * port.zoom * 1.15 + t * RAIN_SPEED);
    },
    destroy() {
      view.destroy({ children: true });
      rainTex.destroy(true);
      hazeTex.destroy(true);
    },
  };
}
