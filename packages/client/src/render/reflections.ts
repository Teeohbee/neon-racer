import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { TRACK_WIDTH, type Track } from "@neon/sim";
import { flat, offsetLoop, trackPoints } from "./geometry";
import type { CarView } from "./types";
import { collectGlints, createGlints, type GlintSource } from "./wet-road";

const MAX_GLINTS = 96;
const STREAK_W = 32;
const STREAK_H = 128;
const STREAK_TOP = 20;
const SHEEN = 0x9fb4ff;
const EDGE_INSET = 18;

function streakTexture(): Texture {
  const c = document.createElement("canvas");
  c.width = STREAK_W;
  c.height = STREAK_H;
  const ctx = c.getContext("2d")!;
  ctx.save();
  ctx.translate(STREAK_W / 2, STREAK_TOP);
  ctx.scale(1, (STREAK_H - STREAK_TOP) / (STREAK_W / 2));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, STREAK_W / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.45)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-STREAK_W / 2, -STREAK_TOP, STREAK_W, STREAK_H);
  ctx.restore();
  ctx.globalCompositeOperation = "destination-in";
  const fade = ctx.createLinearGradient(0, 0, 0, STREAK_H);
  fade.addColorStop(0, "rgba(255,255,255,0)");
  fade.addColorStop(STREAK_TOP / STREAK_H, "rgba(255,255,255,1)");
  fade.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, STREAK_W, STREAK_H);
  return Texture.from(c);
}

function drawRoad(mask: Graphics, sheen: Graphics, track: Track, edges: readonly [number, number]) {
  mask.clear();
  sheen.clear();
  const points = trackPoints(track);
  const n = points.length;
  const left = offsetLoop(points, -TRACK_WIDTH / 2);
  const right = offsetLoop(points, TRACK_WIDTH / 2);
  for (let i = 0; i < n; i++) {
    const j = ((i + 1) % n) * 2;
    const k = i * 2;
    mask.poly([left[k]!, left[k + 1]!, left[j]!, left[j + 1]!, right[j]!, right[j + 1]!, right[k]!, right[k + 1]!], true);
  }
  mask.fill({ color: 0xffffff });
  sheen.poly(flat(points), true).stroke({ width: TRACK_WIDTH, color: SHEEN, alpha: 0.04, join: "round" });
  sheen.poly(offsetLoop(points, -TRACK_WIDTH / 2 + EDGE_INSET), true).stroke({ width: EDGE_INSET * 2, color: edges[0], alpha: 0.07, join: "round" });
  sheen.poly(offsetLoop(points, TRACK_WIDTH / 2 - EDGE_INSET), true).stroke({ width: EDGE_INSET * 2, color: edges[1], alpha: 0.07, join: "round" });
}

export interface ReflectionFrame {
  wet: boolean;
  track: Track | null;
  edges: readonly [number, number];
  cars: readonly CarView[];
  lights: readonly GlintSource[];
  brakeOf: (id: string) => number;
  t: number;
}

export function createReflections() {
  const view = new Container();
  const mask = new Graphics();
  const wet = new Container();
  const sheen = new Graphics();
  const streaks = new Container();
  sheen.blendMode = "add";
  wet.addChild(sheen, streaks);
  wet.mask = mask;
  view.addChild(mask, wet);
  view.visible = false;

  const texture = streakTexture();
  const glints = createGlints(MAX_GLINTS);
  const sprites = glints.map(() => {
    const s = new Sprite(texture);
    s.anchor.set(0.5, STREAK_TOP / STREAK_H);
    s.blendMode = "add";
    s.visible = false;
    streaks.addChild(s);
    return s;
  });
  let currentTrack: Track | null = null;
  let currentEdges: readonly [number, number] | null = null;

  return {
    view,

    update(frame: ReflectionFrame) {
      view.visible = frame.wet && frame.track !== null;
      if (!view.visible || !frame.track) return;
      if (frame.track !== currentTrack || frame.edges !== currentEdges) {
        currentTrack = frame.track;
        currentEdges = frame.edges;
        drawRoad(mask, sheen, frame.track, frame.edges);
      }
      const n = collectGlints(glints, frame.cars, frame.lights, frame.brakeOf);
      for (let i = 0; i < sprites.length; i++) {
        const s = sprites[i]!;
        s.visible = i < n;
        if (i >= n) continue;
        const g = glints[i]!;
        s.position.set(g.x, g.y);
        s.scale.set(g.width / STREAK_W, g.length / STREAK_H);
        s.tint = g.color;
        s.alpha = g.alpha * (0.8 + 0.2 * Math.sin(frame.t * 7 + g.x * 0.05 + g.y * 0.03));
      }
    },

    destroy() {
      view.destroy({ children: true });
      texture.destroy(true);
    },
  };
}
