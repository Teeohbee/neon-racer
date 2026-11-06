import { stepWorldCar, type CarInput, type CarState, type StepContext } from "@neon/sim";

const MAX_PENDING = 120;
const SMOOTHING = 12;

export class Predictor {
  private pending: { seq: number; input: CarInput }[] = [];
  private seq = 0;
  private errorX = 0;
  private errorY = 0;

  constructor(public state: CarState) {}

  step(input: CarInput, dt: number, ctx: StepContext): { seq: number; input: CarInput } {
    const entry = { seq: ++this.seq, input };
    this.pending.push(entry);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.state = stepWorldCar(this.state, input, dt, ctx).car;
    const decay = Math.exp(-SMOOTHING * dt);
    this.errorX *= decay;
    this.errorY *= decay;
    return entry;
  }

  reconcile(server: CarState, ack: number, dt: number, ctx: StepContext): void {
    this.pending = this.pending.filter((p) => p.seq > ack);
    const before = this.state;
    let state = server;
    for (const p of this.pending) state = stepWorldCar(state, p.input, dt, ctx).car;
    this.errorX += before.x - state.x;
    this.errorY += before.y - state.y;
    this.state = state;
  }

  reset(state: CarState): void {
    this.state = state;
    this.pending = [];
    this.errorX = 0;
    this.errorY = 0;
  }

  get rendered(): CarState {
    return { ...this.state, x: this.state.x + this.errorX, y: this.state.y + this.errorY };
  }

  get lastSeq(): number {
    return this.seq;
  }
}
