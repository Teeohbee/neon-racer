import { MatchStats } from "./awards";
import { botInput, BOT_SKILLS, type BotSkill } from "./bot";
import { frameCamera, frameTarget, isOutsideView, lineGap, type Camera } from "./camera";
import { defaultCarParams, emptyInput, type CarInput, type CarState } from "./car";
import { resolveCarCollisions } from "./collision";
import { HAZARD_KINDS, HAZARD_SPECS, placeHazard, pruneHazards, touchingHazard, type Hazard, type HazardKind } from "./hazards";
import { CUP_LEGS, EMOTES, LAP_COUNTS, SCORE_TARGETS, type ClientMsg, type CupLegs, type EliminationReason, type GameEvent, type Mode, type Phase, type ServerMsg, type WinCondition } from "./protocol";
import { advanceProgress, bridgeAt, buildTrack, dropAt, fellOffAt, gridSlots, nearestOnTrack, pointAt, type FeatureSpec, type Point, type ProgressState, type Track } from "./track";
import { PRESET_TRACKS } from "./tracks";
import { Slipstream } from "./slipstream";
import { randomTrackPoints, validateDrawing } from "./validate";
import { BOOST_FACTOR, stepWorldCar } from "./world";

export const TICK_RATE = 60;
export const SNAP_EVERY = 3;
export const MAX_PLAYERS = 6;
export const TARGET_SCORE = 8;
export const DEFAULT_WIN: WinCondition = { kind: "laps", laps: 3 };
export const SKETCH_SECONDS = 30;
export const COUNTDOWN_SECONDS = 3;
export const ROUND_END_SECONDS = 4;
export const ELIMINATION_GRACE = 1;
export const KILL_CREDIT_WINDOW = 3;
const MAX_PROGRESS_STEP = 200;
const MAX_TRAVEL_SPEED = defaultCarParams.maxSpeed * BOOST_FACTOR * 1.5;
const GRID_CLEAR_STEP = 20;
const PLACE_POINTS = [2, 1];
const LAST_PLACE_POINTS = -1;
export const LEG_POINTS = [10, 6, 4, 3, 2, 1];
const MAX_INPUT_QUEUE = 8;
export const EMOTE_COOLDOWN = 0.1;
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
  movedAt: number;
  lastInput: CarInput;
  inputs: { seq: number; input: CarInput }[];
  ack: number;
  lastHit: { owner: string; at: number } | null;
  cooldowns: Record<HazardKind, number>;
  bot: BotSkill | null;
  nextBotHazardAt: number;
  wins: number;
  rematch: boolean;
  cupPoints: number;
  emoteAt: number;
}

const freshCooldowns = (): Record<HazardKind, number> => ({ block: 0, slow: 0, freeze: 0 });

export class Room {
  phase: Phase = "lobby";
  mode: Mode = "contact";
  private players = new Map<string, Player>();
  private hostId: string | null = null;
  private drawerId: string | null = null;
  private drawing: Point[] = [];
  private raw: Point[] | null = null;
  private trackName = "";
  private features: FeatureSpec[] = [];
  private line: number | null = null;
  private track: Track | null = null;
  private hazards: Hazard[] = [];
  private hazardSeq = 0;
  private slipstream = new Slipstream();
  private camera: Camera = { x: 0, y: 0, scale: 1 };
  private phaseTime = 0;
  private tick = 0;
  private round = 0;
  private eliminationOrder: string[] = [];
  private standings: string[] = [];
  private starters = 0;
  private win: WinCondition = DEFAULT_WIN;
  private cup: CupLegs = 0;
  private leg = 0;
  private finalLapDone = false;
  private selected: string[] = PRESET_TRACKS.map((t) => t.name);
  private presetBag: string[] = [];
  private botSeq = 0;
  private lastPreset: string | null = null;
  private stats = new MatchStats();
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
      name: bot ? name : name.trim().slice(0, 16) || "Racer",
      color,
      ready: bot !== null,
      score: 0,
      car: null,
      alive: false,
      progress: { s: 0, progress: 0 },
      movedAt: 0,
      lastInput: emptyInput,
      inputs: [],
      ack: 0,
      lastHit: null,
      cooldowns: freshCooldowns(),
      bot,
      nextBotHazardAt: 0,
      emoteAt: -Infinity,
      wins: 0,
      rematch: false,
      cupPoints: 0,
    });
    if (!bot) this.hostId ??= id;
    this.io.send(id, { t: "welcome", you: id, code: this.code });
    if (this.phase === "sketch" && this.drawerId) this.io.send(id, { t: "sketch", drawerId: this.drawerId, points: this.drawing, reset: true });
    if (this.raw && this.phase !== "sketch") this.io.send(id, { t: "track", raw: this.raw, name: this.trackName, features: this.features });
    this.broadcastRoom();
    return true;
  }

  leave(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.phase === "race" && p.alive) this.emit({ kind: "eliminated", id, reason: "left" });
    if (this.hostId === id) this.hostId = [...this.players.values()].find((p) => !p.bot)?.id ?? null;
    if (this.phase !== "lobby" && this.players.size < 2) {
      this.toLobby();
      return;
    }
    if (this.phase === "sketch" && this.drawerId === id) this.finishSketch();
    this.broadcastRoom();
    this.maybeRematch();
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
      case "emote":
        if (this.phase !== "race" || p.alive || p.bot || !EMOTES.includes(msg.emote) || this.phaseTime + 1e-9 < p.emoteAt + EMOTE_COOLDOWN) return;
        p.emoteAt = this.phaseTime;
        this.emit({ kind: "emote", id, emote: msg.emote });
        return;
      case "addBot": {
        if (this.phase !== "lobby" || id !== this.hostId || !BOT_SKILLS.includes(msg.skill)) return;
        const n = ++this.botSeq;
        this.join(`bot-${n}`, `${BOT_NAMES[(n - 1) % BOT_NAMES.length]} (${msg.skill})`, msg.skill);
        return;
      }
      case "tracks": {
        if (this.phase !== "lobby" || id !== this.hostId || !Array.isArray(msg.names)) return;
        const names = PRESET_TRACKS.map((t) => t.name).filter((n) => msg.names.includes(n));
        if (!names.length) return;
        this.selected = names;
        this.presetBag = [];
        this.broadcastRoom();
        return;
      }
      case "winCondition": {
        if (this.phase !== "lobby" || id !== this.hostId) return;
        const win = parseWin(msg);
        if (!win) return;
        this.win = win;
        this.broadcastRoom();
        return;
      }
      case "removeBot":
        if (this.phase !== "lobby" || id !== this.hostId || !this.players.get(msg.id)?.bot) return;
        this.leave(msg.id);
        return;
      case "again":
        if (this.phase === "matchEnd" && id === this.hostId) this.toLobby();
        return;
      case "rematch":
        if (this.phase !== "matchEnd") return;
        p.rematch = msg.in === true;
        this.broadcastRoom();
        this.maybeRematch();
        return;
      case "cup": {
        if (this.phase !== "lobby" || id !== this.hostId) return;
        const legs = CUP_LEGS.find((l) => l === msg.legs);
        if (legs === undefined) return;
        this.cup = legs;
        this.broadcastRoom();
        return;
      }
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
    const drafts = this.slipstream.update(racers.map((p) => ({ id: p.id, car: p.car! })), dt);

    for (const p of racers) {
      if (!p.bot) continue;
      const input = botInput(p.car!, track, p.bot, this.rng, drafts.get(p.id), p.progress.s);
      if (this.mode === "ghost") p.car = stepWorldCar(p.car!, input, dt, { track, hazards: this.hazards, now, carId: p.id, draft: drafts.get(p.id), near: p.progress.s }).car;
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
        p.car = stepWorldCar(p.car!, p.lastInput, dt, { track, hazards: this.hazards, now, carId: p.id, draft: drafts.get(p.id), near: p.progress.s }).car;
      }
      const resolved = resolveCarCollisions(racers.map((p) => p.car!), racers.map((p) => bridgeAt(track, p.progress.s)));
      racers.forEach((p, i) => (p.car = resolved[i]!));
    }

    const fell = new Set<Player>();
    for (const p of racers) {
      const hit = touchingHazard(p.id, p.car!, this.hazards, now);
      if (hit) p.lastHit = { owner: hit.owner, at: now };
      const at = nearestOnTrack(track, p.car!.x, p.car!.y, p.progress.s);
      if (fellOffAt(track, at)) fell.add(p);
      if (at.s !== p.progress.s) {
        p.progress = advanceProgress(p.progress, at.s, track.length, MAX_PROGRESS_STEP + MAX_TRAVEL_SPEED * (now - p.movedAt));
        p.movedAt = now;
      }
    }

    const leader = racers.reduce<Player | null>((best, p) => (!best || p.progress.progress > best.progress.progress ? p : best), null);
    if (leader) {
      this.line = leader.progress.progress - lineGap(now);
      this.trackStats(racers, leader, now, dt);
      const [lx, ly] = pointAt(track, this.line);
      this.camera = frameCamera(this.camera, leader.car!, { x: lx, y: ly }, dt);
      this.botHazards(leader, now);
      if (this.win.kind === "laps" && leader.progress.progress >= this.win.laps * track.length) {
        this.finalLapDone = true;
        this.endRound();
        return;
      }
    }

    if (now > ELIMINATION_GRACE) {
      for (const p of racers) {
        if (fell.has(p)) this.eliminate(p, now, "fell");
        else if (this.line !== null && p.progress.progress < this.line) this.eliminate(p, now, "line");
      }
    }

    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= (this.starters >= 2 ? 1 : 0)) this.endRound();
  }

  private trackStats(racers: Player[], leader: Player, now: number, dt: number): void {
    this.stats.leading(leader.id, dt);
    for (const p of racers) this.stats.sample(p.id, p.car!, now > ELIMINATION_GRACE ? p.progress.progress - this.line! : null, dt);
  }

  private botHazards(leader: Player, now: number): void {
    const track = this.track!;
    for (const p of this.players.values()) {
      if (!p.bot || p.alive || !p.car || now < p.nextBotHazardAt) continue;
      p.nextBotHazardAt = now + 2 + this.rng() * 3;
      const ready = HAZARD_KINDS.filter((k) => now >= p.cooldowns[k]);
      if (!ready.length) continue;
      const kind = ready[Math.floor(this.rng() * ready.length)]!;
      const [x, y] = kind === "freeze" ? [leader.car!.x, leader.car!.y] : pointAt(track, leader.progress.s + 150 + this.rng() * 250);
      this.placeHazard(p, kind, x, y);
    }
  }

  private eliminate(p: Player, now: number, reason: EliminationReason): void {
    p.alive = false;
    p.nextBotHazardAt = now + 1.5;
    this.eliminationOrder.push(p.id);
    this.emit({ kind: "eliminated", id: p.id, reason });
    this.stats.eliminated(p.id, reason);
    const credit = p.lastHit && now - p.lastHit.at <= KILL_CREDIT_WINDOW ? this.players.get(p.lastHit.owner) : undefined;
    if (credit && credit.id !== p.id) {
      credit.score += 0.5;
      this.stats.hazardKill(credit.id);
      this.emit({ kind: "hazardKill", by: credit.id, victim: p.id });
      this.broadcastRoom();
    }
  }

  private endRound(): void {
    const alive = [...this.players.values()].filter((p) => p.alive).sort((a, b) => b.progress.progress - a.progress.progress);
    const ranked = [...alive, ...[...this.eliminationOrder].reverse().flatMap((id) => this.players.get(id) ?? [])];
    this.standings = ranked.map((p) => p.id);
    const results = ranked.map((p, rank) => {
      const delta = PLACE_POINTS[rank] ?? (ranked.length >= 3 && rank === ranked.length - 1 ? LAST_PLACE_POINTS : 0);
      p.score = Math.max(0, p.score + delta);
      return { id: p.id, delta };
    });
    this.emit({ kind: "roundScored", results });
    this.emit({ kind: "roundWon", id: ranked[0]?.id ?? null });
    this.stats.endRound(ranked[0]?.id ?? null);
    this.line = null;
    this.setPhase("roundEnd");
  }

  private nextRound(): void {
    const best = [...this.players.values()].sort((a, b) => b.score - a.score || b.progress.progress - a.progress.progress)[0];
    const over = this.win.kind === "laps" ? this.finalLapDone : !!best && best.score >= this.win.target;
    if (best && over) {
      this.emit({ kind: "matchWon", id: best.id });
      this.finishMatch(best);
      return;
    }
    this.regrid();
  }

  private finishMatch(best: Player): void {
    let champion = best;
    if (this.cup) {
      const byScore = [...this.players.values()].sort((a, b) => b.score - a.score || (a === best ? -1 : b === best ? 1 : 0));
      byScore.forEach((p, i) => (p.cupPoints += LEG_POINTS[i] ?? 0));
      if (this.leg < this.cup) {
        this.setPhase("matchEnd");
        return;
      }
      champion = [...this.players.values()].sort((a, b) => b.cupPoints - a.cupPoints || (a === best ? -1 : b === best ? 1 : 0))[0]!;
      this.emit({ kind: "cupWon", id: champion.id });
    }
    champion.wins++;
    this.emit({ kind: "awards", awards: this.stats.awards([...this.players.keys()]) });
    this.setPhase("matchEnd");
  }

  private maybeRematch(): void {
    const players = [...this.players.values()];
    if (this.phase !== "matchEnd" || players.length < 2 || !players.every((p) => p.bot !== null || p.rematch)) return;
    if (this.cup && this.leg > 0 && this.leg < this.cup) {
      this.leg++;
      this.startLeg();
    } else this.startMatch();
  }

  private startMatch(): void {
    this.stats = new MatchStats();
    this.leg = 1;
    for (const p of this.players.values()) p.cupPoints = 0;
    this.startLeg();
  }

  private startLeg(): void {
    this.round = 0;
    this.finalLapDone = false;
    this.standings = [];
    for (const p of this.players.values()) {
      p.score = 0;
      p.rematch = false;
    }
    if (this.sketching) {
      this.startSketch(this.randomPlayerId());
      return;
    }
    this.round++;
    this.drawerId = null;
    const name = this.nextPreset();
    const preset = PRESET_TRACKS.find((t) => t.name === name)!;
    this.startCountdown(preset.points, preset.name, preset.features);
  }

  private nextPreset(): string {
    if (this.presetBag.length === 0) {
      this.presetBag = shuffle(this.selected.filter((n) => n !== this.lastPreset), this.rng);
      if (this.lastPreset && this.selected.includes(this.lastPreset)) this.presetBag.push(this.lastPreset);
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
    this.stats.hazardPlaced(p.id);
    p.cooldowns[kind] = now + HAZARD_SPECS[kind].cooldown;
  }

  private maybeStart(): void {
    const players = [...this.players.values()];
    if (this.phase !== "lobby" || players.length < 2 || !players.every((p) => p.ready)) return;
    this.startMatch();
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

  private startCountdown(raw: Point[], name: string, features: FeatureSpec[] = []): void {
    this.raw = raw.map(([x, y]) => [x, y] as Point);
    this.trackName = name;
    this.features = features;
    this.track = buildTrack(this.raw, features);
    this.io.broadcast({ t: "track", raw: this.raw, name, features });

    const others = shuffle([...this.players.values()].filter((p) => p.id !== this.drawerId), this.rng);
    const drawer = this.drawerId ? this.players.get(this.drawerId) : undefined;
    this.grid(drawer ? [...others, drawer] : others, 0, 0);
  }

  private regrid(): void {
    const track = this.track!;
    this.round++;
    const ranked = this.standings.flatMap((id) => this.players.get(id) ?? []);
    const order = [...ranked, ...[...this.players.values()].filter((p) => !ranked.includes(p))];
    const lead = ranked.find((p) => p.car);
    const front = gridSlots(track, 1)[0]!.back;
    const s = lead ? nearestOnTrack(track, lead.car!.x, lead.car!.y, lead.progress.s).s : 0;
    this.grid(order, s - front, (lead?.progress.progress ?? 0) - front);
  }

  private grid(order: Player[], anchor: number, anchorProgress: number): void {
    const track = this.track!;
    let shift = 0;
    let slots = gridSlots(track, order.length, anchor);
    while (shift < track.length && slots.some((slot) => dropAt(track, slot.s))) {
      shift += GRID_CLEAR_STEP;
      slots = gridSlots(track, order.length, anchor + shift);
    }
    order.forEach((p, i) => {
      const slot = slots[i]!;
      p.car = { x: slot.x, y: slot.y, angle: slot.angle, vx: 0, vy: 0 };
      p.alive = true;
      p.progress = { s: slot.s, progress: anchorProgress + shift + slot.back };
      p.movedAt = 0;
      p.inputs = [];
      p.lastInput = emptyInput;
      p.lastHit = null;
      p.cooldowns = freshCooldowns();
    });
    this.starters = order.length;
    this.eliminationOrder = [];
    this.hazards = [];
    this.line = null;
    const [lx, ly] = pointAt(track, order[0]!.progress.progress - lineGap(0));
    this.camera = frameTarget(order[0]!.car!, { x: lx, y: ly });
    this.setPhase("countdown");
  }

  private toLobby(): void {
    for (const p of this.players.values()) {
      p.ready = p.bot !== null;
      p.rematch = false;
      p.alive = false;
      p.car = null;
    }
    this.drawerId = null;
    this.raw = null;
    this.track = null;
    this.hazards = [];
    this.leg = 0;
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
      players: [...this.players.values()].map(({ id, name, color, ready, score, bot, wins, rematch, cupPoints }) => ({ id, name, color, ready, score, bot: bot !== null, wins, rematch, cupPoints })),
      hostId: this.hostId,
      mode: this.mode,
      phase: this.phase,
      drawerId: this.drawerId,
      win: this.win,
      tracks: this.selected,
      remaining: this.remaining(),
      round: this.round,
      cup: this.cup,
      leg: this.leg,
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
      line: this.phase === "race" ? this.line : null,
      lap: this.leaderLap(),
      cars: players.filter((p) => p.car).map((p) => ({ id: p.id, ...p.car!, alive: p.alive, ack: p.ack })),
      hazards: this.hazards,
      cooldowns: Object.fromEntries(players.map((p) => [p.id, p.cooldowns])),
    };
  }

  private leaderLap(): number | null {
    if (this.win.kind !== "laps" || !this.track) return null;
    const best = Math.max(0, ...[...this.players.values()].filter((p) => p.alive).map((p) => p.progress.progress));
    return Math.min(this.win.laps, Math.floor(best / this.track.length) + 1);
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

function parseWin(msg: Partial<Record<"kind" | "target" | "laps", unknown>>): WinCondition | null {
  if (msg.kind === "score") {
    const target = SCORE_TARGETS.find((t) => t === msg.target);
    return target ? { kind: "score", target } : null;
  }
  if (msg.kind === "laps") {
    const laps = LAP_COUNTS.find((l) => l === msg.laps);
    return laps ? { kind: "laps", laps } : null;
  }
  return null;
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
