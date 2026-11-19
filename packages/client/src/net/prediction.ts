import { stepWorldCar, type CarInput, type CarState, type StepContext } from "@neon/sim";

const MAX_PENDING = 120;
const SMOOTHING = 12;

export class Predictor {
  private pending: { seq: number; input: CarInput }[] = [];
  private seq = 0;
  private errorX = 0;
  private errorY = 0;
  /** The server's clock and your ack in the snapshot last reconciled with, to time inputs by the tick the server will apply them. */
  private server: { now: number; ack: number } | null = null;

  constructor(public state: CarState) {}

  step(input: CarInput, dt: number, ctx: StepContext): { seq: number; input: CarInput } {
    const entry = { seq: ++this.seq, input };
    this.pending.push(entry);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
    this.state = stepWorldCar(this.state, input, dt, { ...ctx, now: this.timeOf(entry.seq, dt) ?? ctx.now }).car;
    const decay = Math.exp(-SMOOTHING * dt);
    this.errorX *= decay;
    this.errorY *= decay;
    return entry;
  }

  /**
   * Replays the inputs the server hadn't applied yet on top of its car. `ctx.now` is the server's clock in that
   * snapshot: it applies one input a tick from there, so each is replayed at the time it will meet hazards.
   */
  reconcile(server: CarState, ack: number, dt: number, ctx: StepContext): void {
    this.pending = this.pending.filter((p) => p.seq > ack);
    this.server = { now: ctx.now, ack };
    const before = this.state;
    let state = server;
    for (const p of this.pending) state = stepWorldCar(state, p.input, dt, { ...ctx, now: this.timeOf(p.seq, dt)! }).car;
    this.errorX += before.x - state.x;
    this.errorY += before.y - state.y;
    this.state = state;
  }

  reset(state: CarState): void {
    this.state = state;
    this.pending = [];
    this.server = null;
    this.errorX = 0;
    this.errorY = 0;
  }

  get rendered(): CarState {
    return { ...this.state, x: this.state.x + this.errorX, y: this.state.y + this.errorY };
  }

  private timeOf(seq: number, dt: number): number | null {
    return this.server && this.server.now + (seq - this.server.ack) * dt;
  }

  get lastSeq(): number {
    return this.seq;
  }
}
