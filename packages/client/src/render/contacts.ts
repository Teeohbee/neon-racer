import { CAR_RADIUS, type Hazard } from "@neon/sim";
import { IMPACT } from "./impact";

export const CONTACT = { slack: 4, hitMin: 80, hitFull: 450, scrapeMin: 60, scrapeFull: 400, scrapeRate: 60 };
export const SPRAY = { spread: 0.35, push: 0.35, speed: 220, speedJitter: 380, life: 0.18, lifeJitter: 0.22, hot: 0xffffff };

export interface ContactCar {
  id: string;
  x: number;
  y: number;
  angle: number;
  speed: number;
  alive: boolean;
  color: number;
}

export interface Touch {
  key: string;
  x: number;
  y: number;
  nx: number;
  ny: number;
  vn: number;
  vt: number;
  colors: number[];
  block: boolean;
}

export interface ContactHit {
  touch: Touch;
  kind: "hit" | "scrape";
  strength: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const velocity = (c: ContactCar): [number, number] => [Math.cos(c.angle) * c.speed, Math.sin(c.angle) * c.speed];

function touch(key: string, x: number, y: number, nx: number, ny: number, vx: number, vy: number, colors: number[], block: boolean): Touch {
  return { key, x, y, nx, ny, vn: vx * nx + vy * ny, vt: -vx * ny + vy * nx, colors, block };
}

export function findTouches(cars: ContactCar[], hazards: Hazard[], now: number, carContact: boolean, blockColor: number): Touch[] {
  const alive = cars.filter((c) => c.alive);
  const out: Touch[] = [];
  for (const h of hazards) {
    if (h.kind !== "block" || now < h.armsAt || now >= h.expiresAt) continue;
    for (const c of alive) {
      const dx = c.x - h.x;
      const dy = c.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d > h.radius + CAR_RADIUS + CONTACT.slack) continue;
      const nx = dx / d;
      const ny = dy / d;
      out.push(touch(`${c.id}#${h.id}`, h.x + nx * h.radius, h.y + ny * h.radius, nx, ny, ...velocity(c), [blockColor, c.color], true));
    }
  }
  if (!carContact) return out;
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i]!;
      const b = alive[j]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d === 0 || d > CAR_RADIUS * 2 + CONTACT.slack) continue;
      const [ax, ay] = velocity(a);
      const [bx, by] = velocity(b);
      out.push(touch(`${a.id}|${b.id}`, (a.x + b.x) / 2, (a.y + b.y) / 2, dx / d, dy / d, ax - bx, ay - by, [a.color, b.color], false));
    }
  }
  return out;
}

export function classify(touches: Touch[], previous: ReadonlySet<string>): { hits: ContactHit[]; touching: Set<string> } {
  const hits: ContactHit[] = [];
  for (const t of touches) {
    const vn = Math.abs(t.vn);
    const vt = Math.abs(t.vt);
    if (!previous.has(t.key) && vn >= CONTACT.hitMin) hits.push({ touch: t, kind: "hit", strength: clamp01(vn / CONTACT.hitFull) });
    else if (vt >= CONTACT.scrapeMin) hits.push({ touch: t, kind: "scrape", strength: clamp01(vt / CONTACT.scrapeFull) });
  }
  return { hits, touching: new Set(touches.map((t) => t.key)) };
}

export function sparkCount(hit: ContactHit, dt: number, rand: () => number): number {
  if (hit.kind === "hit") return Math.round(8 + 22 * hit.strength);
  return Math.floor(CONTACT.scrapeRate * hit.strength * dt + rand());
}

export function spray(hit: ContactHit, count: number, rand: () => number = Math.random): Particle[] {
  const { x, y, nx, ny, vt, colors, block } = hit.touch;
  const along = vt >= 0 ? 1 : -1;
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const side = hit.kind === "scrape" ? along : rand() < 0.5 ? -1 : 1;
    const turn = (rand() * 2 - 1) * SPRAY.spread;
    const tx = -ny * side;
    const ty = nx * side;
    const push = block ? SPRAY.push : 0;
    const dx = tx * Math.cos(turn) - ty * Math.sin(turn) + nx * push;
    const dy = tx * Math.sin(turn) + ty * Math.cos(turn) + ny * push;
    const len = Math.hypot(dx, dy);
    const speed = (SPRAY.speed + rand() * SPRAY.speedJitter) * (0.5 + hit.strength);
    const max = SPRAY.life + rand() * SPRAY.lifeJitter;
    const color = rand() < 0.4 ? SPRAY.hot : colors[Math.floor(rand() * colors.length)]!;
    out.push({ x, y, vx: (dx / len) * speed, vy: (dy / len) * speed, life: max, max, color });
  }
  return out;
}

export function createContactTracker(blockColor: number, rand: () => number = Math.random) {
  let touching: ReadonlySet<string> = new Set();
  return (cars: ContactCar[], hazards: Hazard[], now: number, carContact: boolean, dt: number) => {
    const result = classify(findTouches(cars, hazards, now, carContact, blockColor), touching);
    touching = result.touching;
    const sparks: Particle[] = [];
    const impacts: { x: number; y: number; strength: number }[] = [];
    for (const h of result.hits) {
      sparks.push(...spray(h, sparkCount(h, dt, rand), rand));
      if (h.kind === "hit") impacts.push({ x: h.touch.x, y: h.touch.y, strength: h.strength * (h.touch.block ? IMPACT.block : IMPACT.car) });
    }
    return { sparks, impacts };
  };
}
