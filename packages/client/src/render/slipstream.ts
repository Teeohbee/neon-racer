import type { Graphics } from "pixi.js";
import type { CarView } from "./types";

const SIDES = [-14, 15, -20, 21, -11, 12, -24, 25];
const RATE = 2.4;
const FRONT = 30;
const TRAVEL = 100;
const COLOR = 0xe6fbff;

const seedOf = (id: string) => [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 997, 7) / 997;

export function drawSlipstream(g: Graphics, cars: CarView[], t: number): void {
  g.clear();
  for (const car of cars) {
    const amount = car.drafting ?? 0;
    if (amount <= 0 || !car.alive || car.frozen) continue;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const seed = seedOf(car.id);
    const length = 12 + 18 * amount;
    SIDES.forEach((side, i) => {
      const phase = (t * RATE + i / SIDES.length + seed) % 1;
      const along = FRONT - phase * TRAVEL;
      const x = car.x + fx * along - fy * side;
      const y = car.y + fy * along + fx * side;
      const alpha = amount * 0.4 * Math.sin(Math.PI * phase);
      g.moveTo(x, y).lineTo(x - fx * length, y - fy * length).stroke({ width: 1.5, color: COLOR, alpha, cap: "round" });
    });
  }
}
