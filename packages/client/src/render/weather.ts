import { Container, Graphics, Texture, TilingSprite } from "pixi.js";
import type { Camera } from "@neon/sim";
import { seeded } from "./scenery/rng";

export interface WeatherConfig {
  rain?: boolean;
  haze: number;
  hazeAlpha: number;
  hazeScale?: number;
  hazeDrift?: number;
  particles?: { kind: "embers" | "fireflies"; color: number };
  fireworks?: number[];
}

export interface Flash {
  x: number;
  y: number;
  color: number;
  alpha: number;
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
const FIREWORK_LIFE = 1.6;
const FIREWORK_RADIUS = 220;
const FIREWORK_BUCKET = 1.8;
const FIREWORK_CHANCE = 0.45;

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

function dotTexture(size = 256, count = 9): Texture {
  const [c, ctx] = canvas(size);
  let s = 23;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < count; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 1 + rand() * 1.4;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
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
  const dotTex = dotTexture();
  const motesA = new TilingSprite({ texture: dotTex, width: 2, height: 2 });
  const motesB = new TilingSprite({ texture: dotTex, width: 2, height: 2 });
  motesB.tileScale.set(1.25);
  const fireworks = new Graphics();
  const haze = new TilingSprite({ texture: hazeTex, width: 2, height: 2 });
  const far = new TilingSprite({ texture: rainTex, width: 2, height: 2 });
  const near = new TilingSprite({ texture: rainTex, width: 2, height: 2 });
  far.tileScale.set(0.6);
  haze.tileScale.set(3);
  for (const s of [far, near, motesA, motesB, fireworks]) s.blendMode = "add";
  view.addChild(haze, far, near, motesA, motesB, fireworks);
  view.visible = false;

  return {
    view,
    update(config: WeatherConfig | null, port: Viewport, camera: Camera, t: number, clock: { seed: string; now: number }): Flash[] {
      view.visible = config !== null;
      if (!config) return [];
      for (const s of [haze, far, near, motesA, motesB]) {
        s.position.set(port.x, port.y);
        s.width = port.w;
        s.height = port.h;
      }
      haze.tint = config.haze;
      haze.visible = config.hazeAlpha > 0;
      haze.alpha = config.hazeAlpha;
      haze.tileScale.set(config.hazeScale ?? 3);
      const drift = config.hazeDrift ?? 12;
      haze.tilePosition.set(-camera.x * port.zoom * 0.9 + t * drift, -camera.y * port.zoom * 0.9 + t * drift * 0.4);
      far.visible = near.visible = config.rain === true;
      const motes = config.particles;
      motesA.visible = motesB.visible = motes !== undefined;
      if (motes) {
        motesA.tint = motesB.tint = motes.color;
        const wob = Math.sin(t * 0.7) * 30;
        if (motes.kind === "embers") {
          motesA.tilePosition.set(-camera.x * port.zoom * 1.1 + wob, -camera.y * port.zoom * 1.1 - t * 70);
          motesB.tilePosition.set(-camera.x * port.zoom * 1.2 - wob, -camera.y * port.zoom * 1.2 - t * 110);
          motesA.alpha = 0.22 + 0.14 * Math.sin(t * 9);
          motesB.alpha = 0.18 + 0.14 * Math.sin(t * 7 + 2);
        } else {
          motesA.tilePosition.set(-camera.x * port.zoom + wob, -camera.y * port.zoom + Math.cos(t * 0.5) * 25);
          motesB.tilePosition.set(-camera.x * port.zoom * 1.05 - wob * 0.7, -camera.y * port.zoom * 1.05 + Math.sin(t * 0.6) * 30);
          motesA.alpha = 0.32 * Math.max(0, Math.sin(t * 1.3));
          motesB.alpha = 0.32 * Math.max(0, Math.sin(t * 1.1 + 2));
        }
      }
      far.alpha = RAIN_ALPHA * 0.6;
      near.alpha = RAIN_ALPHA;
      far.tilePosition.set(-camera.x * port.zoom * 1.05 + t * RAIN_DRIFT * 0.6, -camera.y * port.zoom * 1.05 + t * RAIN_SPEED * 0.6);
      near.tilePosition.set(-camera.x * port.zoom * 1.15 + t * RAIN_DRIFT, -camera.y * port.zoom * 1.15 + t * RAIN_SPEED);
      fireworks.clear();
      const flashes: Flash[] = [];
      const colors = config.fireworks;
      if (colors?.length) {
        const bucket = Math.floor(clock.now / FIREWORK_BUCKET);
        for (let b = bucket - 1; b <= bucket; b++) {
          const rng = seeded(`${clock.seed}:fireworks:${b}`);
          for (let n = 0; n < 2; n++) {
            if (rng() > FIREWORK_CHANCE) continue;
            const age = clock.now - (b + rng()) * FIREWORK_BUCKET;
            const fx = 0.1 + rng() * 0.8;
            const fy = 0.1 + rng() * 0.6;
            const color = colors[Math.floor(rng() * colors.length)]!;
            const rays = 22 + Math.floor(rng() * 12);
            if (age < 0 || age >= FIREWORK_LIFE) continue;
            const x = port.x + port.w * fx;
            const y = port.y + port.h * fy;
            const k = age / FIREWORK_LIFE;
            const r = FIREWORK_RADIUS * port.zoom * (1 - Math.exp(-age * 3.5));
            const drop = age * age * 40 * port.zoom;
            for (let i = 0; i < rays; i++) {
              const a = (i / rays) * Math.PI * 2;
              fireworks.circle(x + Math.cos(a) * r, y + Math.sin(a) * r + drop, 2.2);
            }
            fireworks.fill({ color, alpha: 1 - k });
            if (age < 0.35) flashes.push({ x, y, color, alpha: 1 - age / 0.35 });
          }
        }
      }
      return flashes;
    },
    destroy() {
      view.destroy({ children: true });
      dotTex.destroy(true);
      rainTex.destroy(true);
      hazeTex.destroy(true);
    },
  };
}
