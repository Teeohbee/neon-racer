import { botInput, buildTrack, nearestOnTrack, Room, TICK_RATE, type ClientMsg, type ServerMsg, type Track } from "@neon/sim";
import { describe, expect, it } from "vitest";
import { Predictor } from "../src/net/prediction";
import { seededRng } from "./local-helpers";

const DT = 1 / TICK_RATE;

/** One direction of a WebSocket: in order, `delay` ticks late, and now and then stalled for a while (a Wi-Fi hiccup). */
class Link<T> {
  private queue: { at: number; msg: T }[] = [];
  private last = 0;
  private stalledUntil = 0;

  constructor(private readonly delay: number, private readonly stall: { chance: number; ticks: [number, number] }, private readonly rng: () => number) {}

  send(tick: number, msg: T): void {
    if (tick >= this.stalledUntil && this.rng() < this.stall.chance) {
      const [min, max] = this.stall.ticks;
      this.stalledUntil = tick + min + Math.floor(this.rng() * (max - min));
    }
    this.last = Math.max(this.last, tick + this.delay, this.stalledUntil);
    this.queue.push({ at: this.last, msg });
  }

  arrived(tick: number): T[] {
    const out: T[] = [];
    while (this.queue.length && this.queue[0]!.at <= tick) out.push(this.queue.shift()!.msg);
    return out;
  }
}

/** A Contact race against a bot, played through a predicting client over a laggy link, as Online play does. */
function raceOverLink(delay: number, stall: { chance: number; ticks: [number, number] }, seconds = 30) {
  let tick = 0;
  const down = new Link<ServerMsg>(delay, stall, seededRng(11));
  const up = new Link<ClientMsg>(delay, stall, seededRng(12));
  const rng = seededRng(3);
  const room = new Room("LAG", { send: (to, msg) => to === "me" && down.send(tick, msg), broadcast: (msg) => down.send(tick, msg) }, { rng, sketching: false });
  room.join("me", "me");
  room.handle("me", { t: "mode", mode: "contact" });
  room.handle("me", { t: "addBot", skill: "hard" });
  room.handle("me", { t: "ready", ready: true });

  let track: Track | null = null;
  let now = 0;
  let racing = false;
  const predictor = new Predictor({ x: 0, y: 0, angle: 0, vx: 0, vy: 0 });
  const ctx = () => ({ track, hazards: [], now, carId: "me", near: track ? nearestOnTrack(track, predictor.state.x, predictor.state.y).s : undefined });
  const corrections: number[] = [];
  const inFlight: number[] = [];

  for (; tick < seconds * TICK_RATE; tick++) {
    for (const msg of down.arrived(tick)) {
      if (msg.t === "track") track = buildTrack(msg.raw, msg.features);
      if (msg.t !== "snap") continue;
      now = msg.now;
      const mine = msg.cars.find((c) => c.id === "me");
      if (!mine || msg.phase !== "race" || !mine.alive) {
        racing = false;
        continue;
      }
      const car = { x: mine.x, y: mine.y, angle: mine.angle, vx: mine.vx, vy: mine.vy };
      if (!racing) {
        predictor.reset(car);
        racing = true;
        continue;
      }
      const before = predictor.state;
      predictor.reconcile(car, mine.ack, DT, ctx());
      corrections.push(Math.hypot(before.x - predictor.state.x, before.y - predictor.state.y));
      inFlight.push(predictor.lastSeq - mine.ack);
    }
    if (racing && track) {
      const sent = predictor.step(botInput(predictor.state, track, "hard", rng), DT, ctx());
      up.send(tick, { t: "input", seq: sent.seq, input: sent.input });
    }
    for (const msg of up.arrived(tick)) room.handle("me", msg);
    room.update(DT);
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { corrections, worst: Math.max(...corrections), meanInFlight: mean(inFlight) };
}

describe("driving Online over a laggy connection", () => {
  // 50 ms each way, with a 200-330 ms stall about once every 1.7 s.
  const hiccups = { chance: 0.01, ticks: [12, 20] as [number, number] };

  it("never pulls your car more than a car's width off where you drove it", () => {
    const { corrections, worst } = raceOverLink(3, hiccups);
    expect(corrections.length).toBeGreaterThan(300);
    expect(worst).toBeLessThan(32);
  });

  it("gets back to the connection's own delay after a hiccup instead of carrying the backlog", () => {
    const steady = raceOverLink(3, { chance: 0, ticks: [0, 0] });
    const hiccupy = raceOverLink(3, hiccups);
    expect(hiccupy.meanInFlight).toBeLessThan(steady.meanInFlight + 3);
  });
});
