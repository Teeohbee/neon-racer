import { Container, Filter, GlProgram, GpuProgram, Graphics, Text } from "pixi.js";
import { vertex, wgslVertex } from "pixi-filters";
import type { Camera, Track } from "@neon/sim";
import { hash01 } from "./fx-math";
import {
  corruptName,
  glitchTick,
  hackLevel,
  hackWord,
  HACK_TIME,
  kickTransition,
  leaderIdle,
  leaderOf,
  SIGNAL_CLEAR,
  SIGNAL_TIME,
  signalLoss,
  stepLeader,
  stepTransition,
  transitionLevel,
  typed,
  type SignalFrame,
  type Transition,
} from "./glitch-math";
import { FEATURE } from "./palette";
import type { ViewRect } from "./vignette";

const REGIONS = 4;
const MAX_SPLIT = 16;
const TRANSITION_SPLIT = 9;
const TRANSITION_BLOCKY = 0.25;
const CARD_FONT = 64;

const glitchFragment = `precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec4 uRegion0;
uniform vec4 uRegion1;
uniform vec4 uRegion2;
uniform vec4 uRegion3;
uniform float uFull;
uniform float uBlocky;
uniform float uSplit;
uniform float uTick;

float hash(vec2 p)
{
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

vec2 region(vec4 r, vec2 p, vec2 best)
{
  vec2 d = abs(p - r.xy) / max(r.z, 1.0);
  float k = r.w * (1.0 - smoothstep(0.6, 1.0, max(d.x, d.y * 1.4)));
  return k > best.x ? vec2(k, r.z) : best;
}

vec4 pick(vec2 p)
{
  return texture(uTexture, clamp(p * uInputSize.zw, uInputClamp.xy, uInputClamp.zw));
}

void main(void)
{
  vec2 p = vTextureCoord * uInputSize.xy;
  vec2 near = region(uRegion0, p, vec2(0.0));
  near = region(uRegion1, p, near);
  near = region(uRegion2, p, near);
  near = region(uRegion3, p, near);
  float tear = max(uFull, near.x);
  float blocks = max(uFull * uBlocky, near.x * 0.8);
  float reach = uFull >= near.x ? 140.0 : near.y * 0.6;
  vec2 q = p;
  float band = floor(p.y / 26.0);
  q.x += step(hash(vec2(band, uTick)), tear * 0.6) * (hash(vec2(band, uTick + 1.0)) - 0.5) * reach;
  float fine = floor(p.y / 5.0);
  q.x += step(hash(vec2(fine, uTick + 2.0)), tear * 0.25) * (hash(vec2(fine, uTick + 3.0)) - 0.5) * 0.25 * reach;
  vec2 cell = floor(p / 24.0);
  float h = hash(cell + vec2(uTick * 7.0, uTick * 3.0));
  vec2 jump = floor(vec2(hash(cell + uTick + 11.0), hash(cell + uTick + 17.0)) * 5.0) - 2.0;
  q = mix(q, (cell + jump) * 24.0 + mod(p, 24.0), step(h, blocks * 0.3));
  q.y = mix(q.y, cell.y * 24.0 - hash(cell + uTick + 23.0) * 60.0, step(h, blocks * 0.12));
  vec2 off = vec2(uSplit + near.x * 4.0, 0.0);
  vec4 c = pick(q);
  vec4 r = pick(q - off);
  vec4 b = pick(q + off);
  c = vec4(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
  c.rgb = mix(c.rgb, c.brg * 1.4, step(h, blocks * 0.05));
  finalColor = c;
}
`;

const glitchSource = `struct GlitchUniforms {
  uRegion0: vec4<f32>,
  uRegion1: vec4<f32>,
  uRegion2: vec4<f32>,
  uRegion3: vec4<f32>,
  uFull: f32,
  uBlocky: f32,
  uSplit: f32,
  uTick: f32,
};

struct GlobalFilterUniforms {
  uInputSize: vec4<f32>,
  uInputPixel: vec4<f32>,
  uInputClamp: vec4<f32>,
  uOutputFrame: vec4<f32>,
  uGlobalFrame: vec4<f32>,
  uOutputTexture: vec4<f32>,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> glitchUniforms: GlitchUniforms;

fn hash(p: vec2<f32>) -> f32 {
  var q = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
  q = q + dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn region(r: vec4<f32>, p: vec2<f32>, best: vec2<f32>) -> vec2<f32> {
  let d = abs(p - r.xy) / max(r.z, 1.0);
  let k = r.w * (1.0 - smoothstep(0.6, 1.0, max(d.x, d.y * 1.4)));
  return select(best, vec2<f32>(k, r.z), k > best.x);
}

fn pick(p: vec2<f32>) -> vec4<f32> {
  return textureSample(uTexture, uSampler, clamp(p * gfu.uInputSize.zw, gfu.uInputClamp.xy, gfu.uInputClamp.zw));
}

@fragment
fn mainFragment(
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
) -> @location(0) vec4<f32> {
  let u = glitchUniforms;
  let p = uv * gfu.uInputSize.xy;
  var near = region(u.uRegion0, p, vec2<f32>(0.0));
  near = region(u.uRegion1, p, near);
  near = region(u.uRegion2, p, near);
  near = region(u.uRegion3, p, near);
  let tear = max(u.uFull, near.x);
  let blocks = max(u.uFull * u.uBlocky, near.x * 0.8);
  let reach = select(near.y * 0.6, 140.0, u.uFull >= near.x);
  var q = p;
  let band = floor(p.y / 26.0);
  q.x = q.x + step(hash(vec2<f32>(band, u.uTick)), tear * 0.6) * (hash(vec2<f32>(band, u.uTick + 1.0)) - 0.5) * reach;
  let fine = floor(p.y / 5.0);
  q.x = q.x + step(hash(vec2<f32>(fine, u.uTick + 2.0)), tear * 0.25) * (hash(vec2<f32>(fine, u.uTick + 3.0)) - 0.5) * 0.25 * reach;
  let cell = floor(p / 24.0);
  let h = hash(cell + vec2<f32>(u.uTick * 7.0, u.uTick * 3.0));
  let jump = floor(vec2<f32>(hash(cell + u.uTick + 11.0), hash(cell + u.uTick + 17.0)) * 5.0) - 2.0;
  q = mix(q, (cell + jump) * 24.0 + (p - floor(p / 24.0) * 24.0), step(h, blocks * 0.3));
  q.y = mix(q.y, cell.y * 24.0 - hash(cell + u.uTick + 23.0) * 60.0, step(h, blocks * 0.12));
  let off = vec2<f32>(u.uSplit + near.x * 4.0, 0.0);
  let c = pick(q);
  let r = pick(q - off);
  let b = pick(q + off);
  var color = vec4<f32>(r.r, c.g, b.b, max(c.a, max(r.a, b.a)));
  color = vec4<f32>(mix(color.rgb, color.brg * 1.4, step(h, blocks * 0.05)), color.a);
  return color;
}
`;

function glitchFilter() {
  return new Filter({
    glProgram: GlProgram.from({ vertex, fragment: glitchFragment, name: "glitch-filter" }),
    gpuProgram: GpuProgram.from({
      vertex: { source: wgslVertex, entryPoint: "mainVertex" },
      fragment: { source: glitchSource, entryPoint: "mainFragment" },
    }),
    resources: {
      glitchUniforms: {
        uRegion0: { value: new Float32Array(4), type: "vec4<f32>" },
        uRegion1: { value: new Float32Array(4), type: "vec4<f32>" },
        uRegion2: { value: new Float32Array(4), type: "vec4<f32>" },
        uRegion3: { value: new Float32Array(4), type: "vec4<f32>" },
        uFull: { value: 0, type: "f32" },
        uBlocky: { value: 0, type: "f32" },
        uSplit: { value: 0, type: "f32" },
        uTick: { value: 0, type: "f32" },
      },
    },
  });
}

interface Hack {
  x: number;
  y: number;
  radius: number;
  color: number;
  seed: number;
  targetId?: string;
  age: number;
  word: string;
  label: Text;
}

export interface HackStart {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: number;
  targetId?: string;
}

export interface GlitchWorld {
  dt: number;
  t: number;
  camera: Camera;
  zoom: number;
  screen: { w: number; h: number };
  locate: (id: string) => { x: number; y: number } | undefined;
}

export interface LabelCar {
  id: string;
  name: string;
  x: number;
  y: number;
  alive: boolean;
}

function drawHack(g: Graphics, hack: Hack, x: number, y: number, tick: number) {
  const level = hackLevel(hack.age);
  if (level <= 0) return;
  const r = hack.radius * 1.25;
  const seed = hack.seed;
  for (let i = 0; i < 8; i++) {
    if (hash01(i, tick, seed) > 0.3 + 0.6 * level) continue;
    const top = y - r + hash01(i, tick, seed + 1) * 2 * r;
    const h = r * (0.04 + 0.1 * hash01(i, tick, seed + 2));
    const w = r * (0.5 + 1.2 * hash01(i, tick, seed + 3));
    const dx = (hash01(i, tick, seed + 4) - 0.5) * r * 1.6 * level;
    g.rect(x - w / 2 + dx, top, w, h);
  }
  g.fill({ color: hack.color, alpha: 0.6 * level });
  const cell = r / 6;
  for (let i = 0; i < 14; i++) {
    if (hash01(i, tick, seed + 5) > level) continue;
    const cx = Math.floor((hash01(i, tick, seed + 6) - 0.5) * 12) * cell;
    const cy = Math.floor((hash01(i, tick, seed + 7) - 0.5) * 12) * cell;
    g.rect(x + cx, y + cy, cell, cell);
  }
  g.fill({ color: hack.color, alpha: 0.85 * level });
  if (hash01(tick, seed, 8) < level) g.rect(x - r, y + (hash01(tick, seed, 9) - 0.5) * 2 * r, 2 * r, cell * 0.4).fill({ color: 0xffffff, alpha: 0.7 * level });
}

function createCard() {
  const view = new Container();
  const band = new Graphics();
  const text = new Text({ text: "SIGNAL LOST", style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: CARD_FONT, fontWeight: "700", fill: 0xffffff, letterSpacing: 10 } });
  text.anchor.set(0.5);
  view.addChild(band, text);
  view.visible = false;
  return {
    view,
    update(frame: SignalFrame, rect: ViewRect, tick: number) {
      view.visible = frame.card > 0;
      if (!view.visible) return;
      const h = rect.h * 0.16;
      const cy = rect.y + rect.h / 2;
      const jitter = hash01(tick, 0, 67) < 0.3 ? (hash01(tick, 0, 68) - 0.5) * rect.w * 0.03 : 0;
      band.clear();
      band.rect(rect.x, cy - h / 2, rect.w, h).fill({ color: 0x000000, alpha: 0.78 });
      band.rect(rect.x, cy - h / 2, rect.w, 3).rect(rect.x, cy + h / 2 - 3, rect.w, 3).fill({ color: FEATURE.danger });
      text.scale.set((rect.h * 0.075) / CARD_FONT);
      text.position.set(rect.x + rect.w / 2 + jitter, cy);
      text.tint = hash01(tick, 0, 69) < 0.2 ? FEATURE.danger : 0xffffff;
      view.alpha = frame.card;
    },
    destroy() {
      view.destroy({ children: true });
    },
  };
}

export function createGlitchFx() {
  const filter = glitchFilter();
  const u = filter.resources.glitchUniforms.uniforms as {
    uRegion0: Float32Array;
    uRegion1: Float32Array;
    uRegion2: Float32Array;
    uRegion3: Float32Array;
    uFull: number;
    uBlocky: number;
    uSplit: number;
    uTick: number;
  };
  const regions = [u.uRegion0, u.uRegion1, u.uRegion2, u.uRegion3];
  const marks = new Graphics();
  const glyphs = new Container();
  const card = createCard();
  let hacks: Hack[] = [];
  let signal = SIGNAL_TIME;
  let transition: Transition | null = null;
  let leader = leaderIdle(Math.random);
  let leaderId: string | null = null;
  let full = false;
  let local = false;

  return {
    filter,
    marks,
    glyphs,
    card: card.view,

    active: () => full || local,

    hack(h: HackStart) {
      const word = hackWord(h.id);
      const label = new Text({ text: "", style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 15, fontWeight: "700", fill: h.color } });
      label.anchor.set(0, 1);
      glyphs.addChild(label);
      hacks.push({ x: h.x, y: h.y, radius: h.radius, color: h.color, seed: h.id, targetId: h.targetId, age: 0, word, label });
    },

    signalLost() {
      signal = 0;
    },

    glitch(strength: number, duration?: number) {
      transition = kickTransition(transition, strength, duration);
    },

    screen(view: ViewRect, dt: number, t: number) {
      const tick = glitchTick(t);
      const frame = signal < SIGNAL_TIME ? signalLoss(signal, tick) : SIGNAL_CLEAR;
      signal = Math.min(SIGNAL_TIME, signal + dt);
      const level = transition ? transitionLevel(transition) : 0;
      transition = stepTransition(transition, dt);
      u.uFull = Math.max(frame.corrupt, level);
      u.uBlocky = frame.corrupt >= level ? 1 : TRANSITION_BLOCKY;
      u.uSplit = Math.max(frame.split * MAX_SPLIT, level * TRANSITION_SPLIT);
      u.uTick = tick;
      full = u.uFull > 0 || u.uSplit > 0;
      card.update(frame, view, tick);
    },

    world({ dt, t, camera, zoom, screen, locate }: GlitchWorld) {
      const tick = glitchTick(t);
      marks.clear();
      for (const r of regions) r[3] = 0;
      hacks = hacks.filter((hack) => {
        hack.age += dt;
        if (hack.age < HACK_TIME) return true;
        hack.label.destroy();
        return false;
      });
      hacks.forEach((hack, k) => {
        const target = hack.targetId ? locate(hack.targetId) : undefined;
        const x = target?.x ?? hack.x;
        const y = target?.y ?? hack.y;
        drawHack(marks, hack, x, y, tick);
        const text = typed(hack.word, hack.age);
        hack.label.text = text;
        hack.label.visible = text !== "" && hash01(tick, hack.seed, 71) > 0.15;
        hack.label.scale.set(camera.scale);
        hack.label.position.set(x + hack.radius * 0.7, y - hack.radius * 0.8);
        const slot = hacks.length - 1 - k;
        if (slot >= REGIONS) return;
        const r = regions[slot]!;
        r[0] = screen.w / 2 + (x - camera.x) * zoom;
        r[1] = screen.h / 2 + (y - camera.y) * zoom;
        r[2] = hack.radius * 1.4 * zoom;
        r[3] = hackLevel(hack.age);
      });
      local = hacks.length > 0;
    },

    leader(cars: readonly LabelCar[], track: Track | null, line: number | null | undefined, dt: number): { id: string; text: string } | null {
      leader = stepLeader(leader, dt, Math.random);
      if (leader.frames === 0) {
        leaderId = null;
        return null;
      }
      leaderId ??= leaderOf(cars, track, line);
      const car = cars.find((c) => c.id === leaderId);
      return car ? { id: car.id, text: corruptName(car.name, Math.floor(Math.random() * 1e9)) } : null;
    },

    destroy() {
      filter.destroy();
      marks.destroy();
      glyphs.destroy({ children: true });
      card.destroy();
      hacks = [];
    },
  };
}

export type GlitchFx = ReturnType<typeof createGlitchFx>;
