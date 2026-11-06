import { botInput, BOT_SKILLS, type BotSkill } from "./bot";
import { isOutsideView, stepCamera, suddenDeathScale, type Camera } from "./camera";
import { emptyInput, type CarInput, type CarState } from "./car";
import { resolveCarCollisions } from "./collision";
import { HAZARD_KINDS, HAZARD_SPECS, placeHazard, pruneHazards, touchingHazard, type Hazard, type HazardKind } from "./hazards";
import type { ClientMsg, GameEvent, Mode, Phase, ServerMsg } from "./protocol";
import { advanceProgress, buildTrack, gridSlots, nearestOnTrack, pointAt, type Point, type ProgressState, type Track } from "./track";
import { PRESET_TRACKS } from "./tracks";
import { randomTrackPoints, validateDrawing } from "./validate";
import { stepWorldCar } from "./world";

export const TICK_RATE = 60;
export const SNAP_EVERY = 3;
export const MAX_PLAYERS = 6;
export const TARGET_SCORE = 5;
export const SKETCH_SECONDS = 30;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_END_SECONDS = 4;
export const ELIMINATION_GRACE = 1;
export const KILL_CREDIT_WINDOW = 3;
const MAX_PROGRESS_STEP = 200;
const MAX_INPUT_QUEUE = 8;
const MAX_SKETCH_POINTS = 4000;
const BOT_NAMES = ["Bolt", "Glitch", "Nova", "Pixel", "Sprocket", "Turbo"];

export interface RoomIO {
  send(playerId: string, msg: ServerMsg): void;
  broadcast(msg: ServerMsg): void;
}

interface Player {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  score: number;
  car: CarState | null;
  alive: boolean;
  progress: ProgressState;
  lastInput: CarInput;
  inputs: { seq: number; input: CarInput }[];
  ack: number;
  lastHit: { owner: string; at: number } | null;
  cooldowns: Record<HazardKind, number>;
  bot: BotSkill | null;
  nextBotHazardAt: number;
}

const freshCooldowns = (): Record<HazardKind, number> => ({ block: 0, slow: 0, freeze: 0 });

export class Room {
  phase: Phase = "lobby";
  mode: Mode = "ghost";
  private players = new Map<string, Player>();
  private hostId: string | null = null;
  private drawerId: string | null = null;
  private nextDrawerId: string | null = null;
  private drawing: Point[] = [];
  private raw: Point[] | null = null;
  private trackName = "";
  private track: Track | null = null;
  private hazards: Hazard[] = [];
  private hazardSeq = 0;
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private phaseTime = 0;
  private tick = 0;
  private round = 0;
  private eliminationOrder: string[] = [];
  private starters = 0;
  private presetBag: number[] = [];
  private botSeq = 0;
  private lastPreset = -1;
  private readonly rng: () => number;
  private readonly sketching: boolean;

  constructor(
    readonly code: string,
    private readonly io: RoomIO,
    opts: { rng?: () => number; sketching?: boolean } = {},
  ) {
    this.rng = opts.rng ?? Math.random;
    this.sketching = opts.sketching ?? false;
  }

  get size(): number {
    return [...this.players.values()].filter((p) => !p.bot).length;
  }

  join(id: string, name: string, bot: BotSkill | null = null): boolean {
    if (this.players.size >= MAX_PLAYERS) return false;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = [...Array(MAX_PLAYERS).keys()].find((c) => !used.has(c)) ?? 0;
    this.players.set(id, {
      id,
      name: name.trim().slice(0, 16) || "Racer",
      color,
      ready: bot !== null,
      score: 0,
      car: null,
      alive: false,
      progress: { s: 0, progress: 0 },
      lastInput: emptyInput,
      inputs: [],
      ack: 0,
      lastHit: null,
      cooldowns: freshCooldowns(),
      bot,
      nextBotHazardAt: 0,
    });
    if (!bot) this.hostId ??= id;
    this.io.send(id, { t: "welcome", you: id, code: this.code });
    if (this.phase === "sketch" && this.drawerId) this.io.send(id, { t: "sketch", drawerId: this.drawerId, points: this.drawing, reset: true });
    if (this.raw && this.phase !== "sketch") this.io.send(id, { t: "track", raw: this.raw, name: this.trackName });
    this.broadcastRoom();
    return true;
  }

  leave(id: string): void {
    if (!this.players.delete(id)) return;
    if (this.hostId === id) this.hostId = [...this.players.values()].find((p) => !p.bot)?.id ?? null;
    if (this.phase !== "lobby" && this.players.size < 2) {
      this.toLobby();
      return;
    }
    if (this.phase === "sketch" && this.drawerId === id) this.finishSketch();
    this.broadcastRoom();
  }

  handle(id: string, msg: ClientMsg): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.t) {
      case "ready":
        if (this.phase !== "lobby") return;
        p.ready = msg.ready;
        this.broadcastRoom();
        this.maybeStart();
        return;
      case "mode":
        if (this.phase !== "lobby" || id !== this.hostId || (msg.mode !== "ghost" && msg.mode !== "contact")) return;
        this.mode = msg.mode;
        this.broadcastRoom();
        return;
      case "sketch": {
        if (this.phase !== "sketch" || id !== this.drawerId || !Array.isArray(msg.points)) return;
        if (msg.reset) this.drawing = [];
        const points = msg.points.filter(isPoint).slice(0, MAX_SKETCH_POINTS - this.drawing.length);
        this.drawing.push(...points);
        for (const other of this.players.keys()) {
          if (other !== id) this.io.send(other, { t: "sketch", drawerId: id, points, reset: msg.reset });
        }
        return;
      }
      case "submit": {
        if (this.phase !== "sketch" || id !== this.drawerId) return;
        const problems = validateDrawing(this.drawing);
        if (problems.length) this.io.send(id, { t: "problems", problems });
        else this.finishSketch();
        return;
      }
      case "state":
        if (this.mode !== "ghost" || this.phase !== "race" || !p.alive || !isCar(msg.car)) return;
        p.car = { x: msg.car.x, y: msg.car.y, angle: msg.car.angle, vx: msg.car.vx, vy: msg.car.vy };
        p.ack = msg.seq;
        return;
      case "input":
        if (this.mode !== "contact" || this.phase !== "race" || !p.alive) return;
        p.inputs.push({ seq: msg.seq, input: sanitizeInput(msg.input) });
        if (p.inputs.length > MAX_INPUT_QUEUE) p.inputs.splice(0, p.inputs.length - MAX_INPUT_QUEUE);
        return;
      case "hazard":
        this.placeHazard(p, msg.kind, msg.x, msg.y);
        return;
      case "addBot": {
        if (this.phase !== "lobby" || id !== this.hostId || !BOT_SKILLS.includes(msg.skill)) return;
        const n = ++this.botSeq;
        this.join(`bot-${n}`, `${BOT_NAMES[(n - 1) % BOT_NAMES.length]} (${msg.skill})`, msg.skill);
        return;
      }
      case "removeBot":
        if (this.phase !== "lobby" || id !== this.hostId || !this.players.get(msg.id)?.bot) return;
        this.leave(msg.id);
        return;
      case "again":
        if (this.phase === "matchEnd" && id === this.hostId) this.toLobby();
        return;
    }
  }

  update(dt: number): void {
    this.tick++;
    this.phaseTime += dt;
    switch (this.phase) {
      case "sketch":
        if (this.phaseTime >= SKETCH_SECONDS) this.finishSketch();
        else if (this.tick % TICK_RATE === 0) this.broadcastRoom();
        break;
      case "countdown":
        if (this.phaseTime >= COUNTDOWN_SECONDS) this.setPhase("race");
        break;
      case "race":
        this.raceTick(dt);
        break;
      case "roundEnd":
        if (this.phaseTime >= ROUND_END_SECONDS) this.nextRound();
        break;
    }
    if ((this.phase === "countdown" || this.phase === "race" || this.phase === "roundEnd") && this.tick % SNAP_EVERY === 0) {
      this.io.broadcast(this.snapshot());
    }
  }

  private raceTick(dt: number): void {
    const track = this.track!;
    const now = this.phaseTime;
    this.hazards = pruneHazards(this.hazards, now);
    const racers = [...this.players.values()].filter((p) => p.alive && p.car);

    for (const p of racers) {
      if (!p.bot) continue;
      const input = botInput(p.car!, track, p.bot, this.rng);
      if (this.mode === "ghost") p.car = stepWorldCar(p.car!, input, dt, { track, hazards: this.hazards, now, carId: p.id }).car;
      else {
        p.inputs = [];
        p.lastInput = input;
      }
    }

    if (this.mode === "contact") {
      for (const p of racers) {
        const next = p.inputs.shift();
        if (next) {
          p.lastInput = next.input;
          p.ack = next.seq;
        }
        p.car = stepWorldCar(p.car!, p.lastInput, dt, { track, hazards: this.hazards, now, carId: p.id }).car;
      }
      const resolved = resolveCarCollisions(racers.map((p) => p.car!));
      racers.forEach((p, i) => (p.car = resolved[i]!));
    }

    for (const p of racers) {
      const hit = touchingHazard(p.id, p.car!, this.hazards, now);
      if (hit) p.lastHit = { owner: hit.owner, at: now };
      p.progress = advanceProgress(p.progress, nearestOnTrack(track, p.car!.x, p.car!.y).s, track.length, MAX_PROGRESS_STEP);
    }

    const leader = racers.reduce<Player | null>((best, p) => (!best || p.progress.progress > best.progress.progress ? p : best), null);
    if (leader) {
      this.camera = stepCamera(this.camera, leader.car!, dt, suddenDeathScale(now));
      this.botHazards(leader, now);
    }

    if (now > ELIMINATION_GRACE) {
      for (const p of racers) if (isOutsideView(this.camera, p.car!.x, p.car!.y)) this.eliminate(p, now);
    }

    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= (this.starters >= 2 ? 1 : 0)) this.endRound(alive[0] ?? null);
  }

  private botHazards(leader: Player, now: number): void {
    const track = this.track!;
    for (const p of this.players.values()) {
      if (!p.bot || p.alive || !p.car || now < p.nextBotHazardAt) continue;
      p.nextBotHazardAt = now + 2 + this.rng() * 3;
      const ready = HAZARD_KINDS.filter((k) => now >= p.cooldowns[k]);
      if (!ready.length) continue;
      const kind = ready[Math.floor(this.rng() * ready.length)]!;
      const [x, y] = kind === "freeze" ? [leader.car!.x, leader.car!.y] : pointAt(track, leader.progress.s + 350 + this.rng() * 300);
      this.placeHazard(p, kind, x, y);
    }
  }

  private eliminate(p: Player, now: number): void {
    p.alive = false;
    p.nextBotHazardAt = now + 1.5;
    this.eliminationOrder.push(p.id);
    this.emit({ kind: "eliminated", id: p.id });
    const credit = p.lastHit && now - p.lastHit.at <= KILL_CREDIT_WINDOW ? this.players.get(p.lastHit.owner) : undefined;
    if (credit && credit.id !== p.id) {
      credit.score += 0.5;
      this.emit({ kind: "hazardKill", by: credit.id, victim: p.id });
    }
  }

  private endRound(winner: Player | null): void {
    if (winner) winner.score += 1;
    this.emit({ kind: "roundWon", id: winner?.id ?? null });
    this.nextDrawerId = this.eliminationOrder.find((id) => this.players.has(id)) ?? null;
    this.setPhase("roundEnd");
  }

  private nextRound(): void {
    const best = [...this.players.values()].sort((a, b) => b.score - a.score)[0];
    if (best && best.score >= TARGET_SCORE) {
      this.emit({ kind: "matchWon", id: best.id });
      this.setPhase("matchEnd");
      return;
    }
    this.startRound(this.nextDrawerId && this.players.has(this.nextDrawerId) ? this.nextDrawerId : this.randomPlayerId());
  }

  private startRound(drawerId: string): void {
    if (this.sketching) {
      this.startSketch(drawerId);
      return;
    }
    this.round++;
    this.drawerId = null;
    const preset = PRESET_TRACKS[this.nextPreset()]!;
    this.startCountdown(preset.points, preset.name);
  }

  private nextPreset(): number {
    if (this.presetBag.length === 0) {
      this.presetBag = shuffle([...PRESET_TRACKS.keys()].filter((i) => i !== this.lastPreset), this.rng);
      if (this.lastPreset >= 0) this.presetBag.push(this.lastPreset);
    }
    this.lastPreset = this.presetBag.shift()!;
    return this.lastPreset;
  }

  private placeHazard(p: Player, kind: HazardKind, x: number, y: number): void {
    if (this.phase !== "race" || p.alive || !HAZARD_KINDS.includes(kind) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = this.phaseTime;
    if (now < p.cooldowns[kind] || isOutsideView(this.camera, x, y, 0)) return;
    const targets = [...this.players.values()].filter((t) => t.alive && t.car).map((t) => ({ id: t.id, x: t.car!.x, y: t.car!.y }));
    const hazard = placeHazard(kind, x, y, p.id, now, ++this.hazardSeq, targets);
    if (!hazard) return;
    this.hazards.push(hazard);
    p.cooldowns[kind] = now + HAZARD_SPECS[kind].cooldown;
  }

  private maybeStart(): void {
    const players = [...this.players.values()];
    if (this.phase !== "lobby" || players.length < 2 || !players.every((p) => p.ready)) return;
    for (const p of players) p.score = 0;
    this.round = 0;
    this.startRound(this.randomPlayerId());
  }

  private startSketch(drawerId: string): void {
    this.round++;
    this.drawerId = drawerId;
    this.drawing = [];
    this.raw = null;
    this.track = null;
    this.hazards = [];
    for (const p of this.players.values()) {
      p.alive = false;
      p.car = null;
    }
    this.setPhase("sketch");
    this.io.broadcast({ t: "sketch", drawerId, points: [], reset: true });
    if (this.players.get(drawerId)?.bot) this.finishSketch();
  }

  private finishSketch(): void {
    const valid = validateDrawing(this.drawing).length === 0;
    this.startCountdown(valid ? this.drawing : randomTrackPoints(this.rng), valid ? `${this.players.get(this.drawerId ?? "")?.name ?? "Someone"}'s track` : "Random track");
  }

  private startCountdown(raw: Point[], name: string): void {
    this.raw = raw.map(([x, y]) => [x, y] as Point);
    this.trackName = name;
    this.track = buildTrack(this.raw);
    this.io.broadcast({ t: "track", raw: this.raw, name });

    const others = shuffle([...this.players.values()].filter((p) => p.id !== this.drawerId), this.rng);
    const drawer = this.drawerId ? this.players.get(this.drawerId) : undefined;
    const order = drawer ? [...others, drawer] : others;
    const slots = gridSlots(this.track, order.length);
    order.forEach((p, i) => {
      const slot = slots[i]!;
      const s = nearestOnTrack(this.track!, slot.x, slot.y).s;
      p.car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
      p.alive = true;
      p.progress = { s, progress: s > this.track!.length / 2 ? s - this.track!.length : s };
      p.inputs = [];
      p.lastInput = emptyInput;
      p.lastHit = null;
      p.cooldowns = freshCooldowns();
    });
    this.starters = order.length;
    this.eliminationOrder = [];
    this.hazards = [];
    const front = slots[0]!;
    this.camera = { x: front.x, y: front.y, scale: 1 };
    this.setPhase("countdown");
  }

  private toLobby(): void {
    for (const p of this.players.values()) {
      p.ready = p.bot !== null;
      p.alive = false;
      p.car = null;
    }
    this.drawerId = null;
    this.raw = null;
    this.track = null;
    this.hazards = [];
    this.setPhase("lobby");
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.phaseTime = 0;
    this.broadcastRoom();
  }

  private remaining(): number {
    const limit = { sketch: SKETCH_SECONDS, countdown: COUNTDOWN_SECONDS, roundEnd: ROUND_END_SECONDS }[this.phase as string];
    return limit === undefined ? 0 : Math.max(0, limit - this.phaseTime);
  }

  private broadcastRoom(): void {
    this.io.broadcast({
      t: "room",
      code: this.code,
      players: [...this.players.values()].map(({ id, name, color, ready, score, bot }) => ({ id, name, color, ready, score, bot: bot !== null })),
      hostId: this.hostId,
      mode: this.mode,
      phase: this.phase,
      drawerId: this.drawerId,
      target: TARGET_SCORE,
      remaining: this.remaining(),
      round: this.round,
    });
  }

  private snapshot(): ServerMsg {
    const players = [...this.players.values()];
    return {
      t: "snap",
      tick: this.tick,
      phase: this.phase,
      now: this.phaseTime,
      camera: this.camera,
      cars: players.filter((p) => p.car).map((p) => ({ id: p.id, ...p.car!, alive: p.alive, ack: p.ack })),
      hazards: this.hazards,
      cooldowns: Object.fromEntries(players.map((p) => [p.id, p.cooldowns])),
    };
  }

  private emit(event: GameEvent): void {
    this.io.broadcast({ t: "event", event });
  }

  private randomPlayerId(): string {
    const ids = [...this.players.keys()];
    return ids[Math.floor(this.rng() * ids.length)]!;
  }
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

function isPoint(p: unknown): p is Point {
  return Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function isCar(c: unknown): c is CarState {
  if (!c || typeof c !== "object") return false;
  const car = c as Record<string, unknown>;
  return ["x", "y", "angle", "vx", "vy"].every((k) => Number.isFinite(car[k]));
}

function sanitizeInput(input: Partial<CarInput> | undefined): CarInput {
  return {
    throttle: !!input?.throttle,
    brake: !!input?.brake,
    left: !!input?.left,
    right: !!input?.right,
    handbrake: !!input?.handbrake,
  };
}
