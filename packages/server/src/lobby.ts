import { Room, TICK_RATE, type ClientMsg, type GameEvent, type Phase, type ServerMsg } from "@neon/sim";
import { log, logError, rateLimiter } from "./log";

const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
const STEP_MS = 1000 / TICK_RATE;
const SLOW_TICK_MS = STEP_MS / 2;

export interface Client {
  // Bun returns -1 when the message was queued behind a slow socket and 0 when it was dropped.
  send(data: string): number | void;
  /** Bytes sent but still waiting to go out on this socket. */
  getBufferedAmount?(): number;
}

/**
 * About six snapshots: more than this still waiting to go out and a player's connection isn't keeping up. Each
 * snapshot replaces the last, so skip theirs until it clears rather than queue up ever older ones.
 */
const SNAPSHOT_BACKLOG_BYTES = 8 * 1024;

interface Stats {
  maxTickMs: number;
  slowTicks: number;
  lagResets: number;
  tickErrors: number;
  handleErrors: number;
  badMessages: number;
  backpressured: number;
  dropped: number;
  skippedSnaps: number;
}

// What the logs know about a room, kept beside it rather than read out of the sim.
interface Watch {
  createdAt: number;
  joinedAt: Map<string, number>;
  names: Map<string, string>;
  phase: Phase;
  round: number;
  track: string | null;
  players: number;
  bots: number;
  stats: Stats;
}

interface Entry {
  room: Room;
  clients: Map<string, Client>;
  timer: ReturnType<typeof setInterval>;
  watch: Watch;
}

const freshStats = (): Stats => ({ maxTickMs: 0, slowTicks: 0, lagResets: 0, tickErrors: 0, handleErrors: 0, badMessages: 0, backpressured: 0, dropped: 0, skippedSnaps: 0 });
const allowed = rateLimiter(5);

export class Lobby {
  private rooms = new Map<string, Entry>();

  create(): string {
    let code: string;
    do code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
    while (this.rooms.has(code));

    const clients = new Map<string, Client>();
    const watch: Watch = { createdAt: Date.now(), joinedAt: new Map(), names: new Map(), phase: "lobby", round: 0, track: null, players: 0, bots: 0, stats: freshStats() };
    const deliver = (id: string, client: Client, data: string, snapshot = false) => {
      if (snapshot && (client.getBufferedAmount?.() ?? 0) > SNAPSHOT_BACKLOG_BYTES) {
        watch.stats.skippedSnaps++;
        return;
      }
      const result = client.send(data);
      if (result === -1) watch.stats.backpressured++;
      if (result === 0) {
        watch.stats.dropped++;
        if (allowed(`drop:${code}:${id}`)) log("send.dropped", { room: code, player: this.who(watch, id) });
      }
    };
    const io = {
      send: (id: string, msg: ServerMsg) => {
        this.observe(code, watch, msg);
        const client = clients.get(id);
        if (client) deliver(id, client, JSON.stringify(msg));
      },
      broadcast: (msg: ServerMsg) => {
        this.observe(code, watch, msg);
        const data = JSON.stringify(msg);
        for (const [id, c] of clients) deliver(id, c, data, msg.t === "snap");
      },
    };
    const room = new Room(code, io);
    let last = performance.now();
    let acc = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      acc += now - last;
      last = now;
      if (acc > STEP_MS * 10) {
        watch.stats.lagResets++;
        if (allowed(`lag:${code}`)) log("room.lag", { room: code, behindMs: Math.round(acc), phase: watch.phase });
        acc = STEP_MS * 10;
      }
      while (acc >= STEP_MS) {
        const start = performance.now();
        try {
          room.update(1 / TICK_RATE);
        } catch (err) {
          watch.stats.tickErrors++;
          if (allowed(`tick:${code}`)) logError("room.tick_error", err, { room: code, phase: watch.phase, round: watch.round, track: watch.track });
        }
        const took = performance.now() - start;
        watch.stats.maxTickMs = Math.max(watch.stats.maxTickMs, took);
        if (took > SLOW_TICK_MS) watch.stats.slowTicks++;
        acc -= STEP_MS;
      }
    }, 4);
    this.rooms.set(code, { room, clients, timer, watch });
    log("room.created", { room: code, rooms: this.rooms.size });
    return code;
  }

  get size(): number {
    return this.rooms.size;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  join(code: string, id: string, name: string, client: Client): string | null {
    const entry = this.rooms.get(code);
    if (!entry) return "Room not found";
    entry.clients.set(id, client);
    if (!entry.room.join(id, name)) {
      entry.clients.delete(id);
      return "Room is full";
    }
    entry.watch.joinedAt.set(id, Date.now());
    log("player.joined", { room: code, player: this.who(entry.watch, id, name), phase: entry.watch.phase, humans: entry.clients.size });
    return null;
  }

  message(code: string, id: string, raw: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      entry.watch.stats.badMessages++;
      if (allowed(`bad:${code}:${id}`)) log("message.bad_json", { room: code, player: this.who(entry.watch, id), raw: raw.slice(0, 200) });
      return;
    }
    if (!msg || typeof msg !== "object" || typeof msg.t !== "string") {
      entry.watch.stats.badMessages++;
      if (allowed(`bad:${code}:${id}`)) log("message.bad_shape", { room: code, player: this.who(entry.watch, id), raw: raw.slice(0, 200) });
      return;
    }
    if (msg.t !== "input" && msg.t !== "state") this.logAction(code, entry.watch, id, msg);
    try {
      entry.room.handle(id, msg);
    } catch (err) {
      entry.watch.stats.handleErrors++;
      if (allowed(`handle:${code}:${msg.t}`)) logError("message.handle_error", err, { room: code, player: this.who(entry.watch, id), type: msg.t, phase: entry.watch.phase, raw: raw.slice(0, 500) });
    }
  }

  leave(code: string, id: string, closeCode?: number, reason?: string): void {
    const entry = this.rooms.get(code);
    if (!entry) return;
    const joined = entry.watch.joinedAt.get(id);
    log("player.left", {
      room: code,
      player: this.who(entry.watch, id),
      phase: entry.watch.phase,
      round: entry.watch.round,
      closeCode,
      reason: reason || undefined,
      connectedS: joined ? Math.round((Date.now() - joined) / 1000) : undefined,
      humansLeft: entry.clients.size - (entry.clients.has(id) ? 1 : 0),
    });
    entry.clients.delete(id);
    entry.watch.joinedAt.delete(id);
    try {
      entry.room.leave(id);
    } catch (err) {
      logError("room.leave_error", err, { room: code, player: id, phase: entry.watch.phase });
    }
    if (entry.room.size === 0) {
      clearInterval(entry.timer);
      this.rooms.delete(code);
      log("room.closed", { room: code, lifetimeS: Math.round((Date.now() - entry.watch.createdAt) / 1000), rounds: entry.watch.round, rooms: this.rooms.size });
    }
  }

  // A summary per room, logged every minute while any room is open.
  logStats(): void {
    if (this.rooms.size === 0) return;
    const humans = [...this.rooms.values()].reduce((n, e) => n + e.clients.size, 0);
    const mem = process.memoryUsage();
    log("stats", { rooms: this.rooms.size, humans, rssMb: Math.round(mem.rss / 1e6), heapMb: Math.round(mem.heapUsed / 1e6) });
    for (const [code, entry] of this.rooms) {
      const s = entry.watch.stats;
      log("room.stats", {
        room: code,
        phase: entry.watch.phase,
        round: entry.watch.round,
        track: entry.watch.track,
        humans: entry.clients.size,
        bots: entry.watch.bots,
        maxTickMs: Number(s.maxTickMs.toFixed(1)),
        slowTicks: s.slowTicks || undefined,
        lagResets: s.lagResets || undefined,
        tickErrors: s.tickErrors || undefined,
        handleErrors: s.handleErrors || undefined,
        badMessages: s.badMessages || undefined,
        backpressured: s.backpressured || undefined,
        skippedSnaps: s.skippedSnaps || undefined,
        dropped: s.dropped || undefined,
      });
      entry.watch.stats = freshStats();
    }
  }

  private logAction(code: string, watch: Watch, id: string, msg: ClientMsg): void {
    if (msg.t === "emote" || msg.t === "sketch") return;
    const detail: Record<string, unknown> = { room: code, player: this.who(watch, id), type: msg.t, phase: watch.phase };
    if (msg.t === "hazard") detail.kind = msg.kind;
    else if (msg.t === "addBot" && msg.runner) detail.runner = msg.runner;
    else if (msg.t === "ready") detail.ready = msg.ready;
    else if (msg.t === "mode") detail.mode = msg.mode;
    else if (msg.t === "tracks") detail.tracks = msg.names.length;
    else if (msg.t === "winCondition") detail.win = msg.kind === "laps" ? `${msg.laps}laps` : `${msg.target}pts`;
    else if (msg.t === "cup") detail.legs = msg.legs;
    else if (msg.t === "rematch") detail.in = msg.in;
    if (msg.t === "hazard" && !allowed(`hazard:${code}:${id}`)) return;
    log("player.action", detail);
  }

  // Watches what the room sends out, so the logs follow the match without the sim knowing about logging.
  private observe(code: string, watch: Watch, msg: ServerMsg): void {
    if (msg.t === "room") {
      for (const p of msg.players) watch.names.set(p.id, p.name);
      watch.players = msg.players.length;
      watch.bots = msg.players.filter((p) => p.bot).length;
      if (msg.phase !== watch.phase || msg.round !== watch.round) {
        log("room.phase", {
          room: code,
          from: watch.phase,
          to: msg.phase,
          round: msg.round,
          players: msg.players.length,
          bots: watch.bots,
          mode: msg.mode,
          win: msg.win.kind === "laps" ? `${msg.win.laps}laps` : `${msg.win.target}pts`,
          cup: msg.cup || undefined,
        });
        watch.phase = msg.phase;
        watch.round = msg.round;
      }
    } else if (msg.t === "track") {
      watch.track = msg.name;
      log("room.track", { room: code, track: msg.name, round: watch.round });
    } else if (msg.t === "error") {
      log("room.error_sent", { room: code, message: msg.message });
    } else if (msg.t === "event") {
      this.logEvent(code, watch, msg.event);
    }
  }

  private logEvent(code: string, watch: Watch, event: GameEvent): void {
    const base = { room: code, round: watch.round, track: watch.track };
    switch (event.kind) {
      case "eliminated":
        log("race.eliminated", { ...base, player: this.who(watch, event.id), reason: event.reason });
        break;
      case "hazardKill":
        log("race.hazard_kill", { ...base, by: this.who(watch, event.by), victim: this.who(watch, event.victim) });
        break;
      case "roundWon":
        log("race.round_won", { ...base, winner: event.id ? this.who(watch, event.id) : "none" });
        break;
      case "matchWon":
        log("race.match_won", { ...base, winner: this.who(watch, event.id) });
        break;
      case "cupWon":
        log("race.cup_won", { ...base, winner: this.who(watch, event.id) });
        break;
    }
  }

  private who(watch: Watch, id: string, name?: string): string {
    return `${name ?? watch.names.get(id) ?? "?"}#${id}`;
  }
}
