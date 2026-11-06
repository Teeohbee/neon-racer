import { CAR_RADIUS, speedOf, type CarState } from "./car";

export const DRAFT_RANGE = 300;
export const DRAFT_SPREAD = 0.22;
export const DRAFT_ALIGN = 0.8;
export const DRAFT_MIN_SPEED = 250;
export const DRAFT_SPEED_BONUS = 0.15;
export const DRAFT_ACCEL = 300;
export const DRAFT_RAMP_IN = 0.4;
export const DRAFT_RAMP_OUT = 0.9;

export interface DraftingCar {
  id: string;
  car: CarState;
}

export function inSlipstream(car: CarState, ahead: CarState): boolean {
  if (speedOf(ahead) < DRAFT_MIN_SPEED) return false;
  const fx = Math.cos(ahead.angle);
  const fy = Math.sin(ahead.angle);
  if (Math.cos(car.angle) * fx + Math.sin(car.angle) * fy < DRAFT_ALIGN) return false;
  const dx = car.x - ahead.x;
  const dy = car.y - ahead.y;
  const back = -(dx * fx + dy * fy);
  const side = Math.abs(-dx * fy + dy * fx);
  return back > 0 && back <= DRAFT_RANGE && side <= CAR_RADIUS + back * Math.tan(DRAFT_SPREAD);
}

export const draftTarget = (car: CarState, others: CarState[]): number => (others.some((o) => inSlipstream(car, o)) ? 1 : 0);

export function rampDraft(amount: number, target: number, dt: number): number {
  return target > amount ? Math.min(target, amount + dt / DRAFT_RAMP_IN) : Math.max(target, amount - dt / DRAFT_RAMP_OUT);
}

export const draftFactor = (amount: number): number => 1 + DRAFT_SPEED_BONUS * amount;

export class Slipstream {
  private amounts = new Map<string, number>();

  update(cars: DraftingCar[], dt: number): Map<string, number> {
    const next = new Map<string, number>();
    for (const { id, car } of cars) {
      const others = cars.filter((o) => o.id !== id).map((o) => o.car);
      next.set(id, rampDraft(this.amount(id), draftTarget(car, others), dt));
    }
    this.amounts = next;
    return next;
  }

  step(id: string, car: CarState, others: CarState[], dt: number): number {
    const amount = rampDraft(this.amount(id), draftTarget(car, others), dt);
    this.amounts.set(id, amount);
    return amount;
  }

  amount(id: string): number {
    return this.amounts.get(id) ?? 0;
  }
}
