import { Graphics } from "pixi.js";
import { createDebris, DEBRIS, flashAlpha, launchSpeed, RING, ringAlpha, ringRadius, ringWidth, stepDebris } from "./explosion-math";
import { coreColor, neonStroke } from "./neon";

const SLOTS = 6;
const BUCKETS = 3;
const STREAK = { width: 3, core: 1.3 };

interface Blast {
  x: number;
  y: number;
  color: number;
  core: number;
  scale: number;
  age: number;
  count: number;
  live: number;
}

export interface Explosions {
  readonly view: Graphics;
  explode(x: number, y: number, color: number, scale?: number): void;
  update(dt: number): void;
  destroy(): void;
}

export function createExplosions(): Explosions {
  const view = new Graphics();
  view.blendMode = "add";
  const debris = createDebris(SLOTS * DEBRIS.count);
  const hot = new Uint8Array(SLOTS * DEBRIS.count);
  const blasts: Blast[] = Array.from({ length: SLOTS }, () => ({ x: 0, y: 0, color: 0, core: 0, scale: 0, age: Infinity, count: 0, live: 0 }));

  const slotFor = () => {
    let pick = 0;
    for (let s = 1; s < SLOTS; s++) if (blasts[s]!.age > blasts[pick]!.age) pick = s;
    return pick;
  };

  const streaks = (b: Blast, from: number, bucket: number, core: boolean) => {
    let any = false;
    for (let k = from; k < from + b.count; k++) {
      const life = debris.life[k]!;
      if (life <= 0 || (!core && hot[k])) continue;
      if (Math.min(BUCKETS, Math.ceil((life / debris.max[k]!) * BUCKETS)) !== bucket) continue;
      const x = debris.x[k]!;
      const y = debris.y[k]!;
      view.moveTo(x, y).lineTo(x - debris.vx[k]! * DEBRIS.streak, y - debris.vy[k]! * DEBRIS.streak);
      any = true;
    }
    if (!any) return;
    const alpha = bucket / BUCKETS;
    view.stroke(core ? { width: STREAK.core, color: b.core, alpha, cap: "round" } : { width: STREAK.width, color: b.color, alpha, cap: "round" });
  };

  const drawBlast = (b: Blast, from: number) => {
    if (b.age < RING.flash) view.circle(b.x, b.y, RING.flashRadius * b.scale).fill({ color: b.core, alpha: 0.5 * flashAlpha(b.age) });
    if (b.age < RING.life) {
      const r = ringRadius(b.age, b.scale);
      neonStroke(view, (g) => g.circle(b.x, b.y, r), { width: ringWidth(b.age, b.scale), color: b.color, alpha: ringAlpha(b.age) });
    }
    for (let bucket = 1; bucket <= BUCKETS; bucket++) {
      streaks(b, from, bucket, false);
      streaks(b, from, bucket, true);
    }
  };

  return {
    view,
    explode(x, y, color, scale = 1) {
      const s = slotFor();
      const b = blasts[s]!;
      const from = s * DEBRIS.count;
      b.x = x;
      b.y = y;
      b.color = color;
      b.core = coreColor(color);
      b.scale = scale;
      b.age = 0;
      b.count = Math.max(1, Math.min(DEBRIS.count, Math.round(DEBRIS.count * scale)));
      b.live = b.count;
      for (let k = from; k < from + DEBRIS.count; k++) debris.life[k] = 0;
      for (let k = from; k < from + b.count; k++) {
        const a = Math.random() * Math.PI * 2;
        const speed = launchSpeed(Math.random()) * Math.sqrt(scale);
        const life = (DEBRIS.lifeMin + Math.random() * (DEBRIS.lifeMax - DEBRIS.lifeMin)) * (0.6 + 0.4 * scale);
        debris.x[k] = x;
        debris.y[k] = y;
        debris.vx[k] = Math.cos(a) * speed;
        debris.vy[k] = Math.sin(a) * speed;
        debris.life[k] = life;
        debris.max[k] = life;
        hot[k] = Math.random() < DEBRIS.hot ? 1 : 0;
      }
    },
    update(dt) {
      view.clear();
      for (let s = 0; s < SLOTS; s++) {
        const b = blasts[s]!;
        if (b.live === 0 && b.age >= RING.life) continue;
        b.age += dt;
        const from = s * DEBRIS.count;
        b.live = stepDebris(debris, from, from + b.count, dt);
        drawBlast(b, from);
      }
    },
    destroy() {
      view.destroy();
    },
  };
}
