import { Slipstream, type CarState } from "@neon/sim";
import type { CarView } from "../render/types";

const ENGAGE = 0.5;

type OtherCar = CarState & { id: string; alive: boolean };

const stateOf = (c: CarView): CarState => ({ x: c.x, y: c.y, angle: c.angle, vx: Math.cos(c.angle) * c.speed, vy: Math.sin(c.angle) * c.speed });

export function createDrafting(onEngage: () => void) {
  const local = new Slipstream();
  const seen = new Slipstream();
  let engaged = false;
  let paintedAt: number | null = null;

  return {
    step(you: string, car: CarState, cars: OtherCar[], dt: number): number {
      const others = cars.filter((c) => c.id !== you && c.alive);
      const amount = local.step(you, car, others, dt);
      if (amount >= ENGAGE && !engaged) {
        engaged = true;
        onEngage();
      } else if (amount === 0) engaged = false;
      return amount;
    },

    own(you: string): number {
      return local.amount(you);
    },

    paint(cars: CarView[], now: number): void {
      const dt = paintedAt === null ? 0 : Math.max(0, Math.min(0.1, now - paintedAt));
      paintedAt = now;
      const amounts = seen.update(cars.filter((c) => c.alive).map((c) => ({ id: c.id, car: stateOf(c) })), dt);
      for (const c of cars) c.drafting = !c.alive ? 0 : c.isYou ? local.amount(c.id) : (amounts.get(c.id) ?? 0);
    },
  };
}
