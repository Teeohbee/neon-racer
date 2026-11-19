import {
  DEFAULT_WIN,
  emptyInput,
  EMOTES,
  HAZARD_KINDS,
  MAX_PLAYERS,
  PRESET_TRACKS,
  Room,
  TICK_RATE,
  VIEW,
  type BotSkill,
  type ClientMsg,
  type Emote,
  type HazardKind,
  type PlayerInfo,
  type ServerMsg,
} from "@neon/sim";
import { carInputFromPad, leftStick, type ButtonName } from "../controller/pad";
import type { ControllerFrame } from "../controller/poller";
import { PLAYER_COLOR_NAMES } from "../render/palette";

/**
 * Local play: a whole match on this device. A LocalMatch owns a Room and plays the part the
 * server and the network play online - it binds controllers to Seats, turns each Seat's
 * controller into Room messages, and ticks the Room at its fixed rate. It knows nothing about
 * the screen; everything the Room says goes to `onMessage`.
 */

export type RoomInfo = Extract<ServerMsg, { t: "room" }>;

export interface Seat {
  /** 1-based position among the Seats, as players see it. */
  number: number;
  playerId: string;
  /** Null while the Seat's controller is disconnected. */
  controllerId: string | null;
  name: string;
  color: number;
}

export type LocalNotice =
  | { kind: "joined"; seat: Seat }
  | { kind: "left"; seat: Seat }
  | { kind: "needsRacers" }
  | { kind: "disconnected"; seat: Seat }
  | { kind: "reclaimed"; seat: Seat }
  | { kind: "hazard"; seat: Seat; ready: boolean };

/** Where a knocked-out Seat is aiming its next hazard, in world coordinates. */
export interface HazardCursor {
  x: number;
  y: number;
  kind: HazardKind;
}

type Snap = Extract<ServerMsg, { t: "snap" }>;

/** A cursor's place on screen, from -0.5 to 0.5 of the view each way, so it stays put while the camera follows the race. */
interface ScreenCursor {
  across: number;
  down: number;
  kind: HazardKind;
}

export interface LocalMatchOptions {
  onMessage: (msg: ServerMsg) => void;
  rng?: () => number;
}

const DT = 1 / TICK_RATE;
const MAX_CATCH_UP = DT * 10;
const LOCAL_ROOM_CODE = "HOME";
const PAUSABLE = new Set(["countdown", "race", "roundEnd"]);
/** How far a fully pushed stick moves a hazard cursor each second, as a share of the view's width. */
const CURSOR_SPEED = 0.6;
const CURSOR_DEADZONE = 0.2;
/** The d-pad sends the emotes in the same order as keys 4-7. */
const EMOTE_BUTTONS: [ButtonName, Emote][] = [
  ["dpadUp", EMOTES[0]],
  ["dpadRight", EMOTES[1]],
  ["dpadDown", EMOTES[2]],
  ["dpadLeft", EMOTES[3]],
];

export class LocalMatch {
  private roomState: RoomInfo = emptyLobby();
  private seatList: Omit<Seat, "number">[] = [];
  private seatSeq = 0;
  private inputSeq = 0;
  private pads: ControllerFrame["pads"] = new Map();
  private carry = 0;
  private pauser: string | null = null;
  private latestSnap: Snap | null = null;
  private cursors = new Map<string, ScreenCursor>();
  private botSkills = new Map<string, BotSkill>();
  private botSkill: BotSkill = "medium";
  private sim: Room;

  constructor(private readonly opts: LocalMatchOptions) {
    this.sim = this.createRoom();
  }

  private createRoom(): Room {
    return new Room(
      LOCAL_ROOM_CODE,
      {
        send: (_playerId, msg) => this.receive(msg),
        broadcast: (msg) => this.receive(msg),
      },
      // Every tick, so the race can be drawn between the last two (see StepSnaps).
      { rng: this.opts.rng, snapEvery: 1 },
    );
  }

  private receive(msg: ServerMsg): void {
    if (msg.t === "welcome") return;
    if (msg.t === "room") {
      if (msg.phase !== "race") this.cursors.clear();
      if (!PAUSABLE.has(msg.phase)) this.pauser = null;
      this.roomState = msg;
    }
    if (msg.t === "snap") this.latestSnap = msg;
    this.opts.onMessage(msg);
  }

  get seats(): Seat[] {
    return this.seatList.map((seat, i) => ({ ...seat, number: i + 1 }));
  }

  room(): RoomInfo {
    return this.roomState;
  }

  hostSeat(): Seat | undefined {
    return this.seats.find((s) => s.playerId === this.roomState?.hostId);
  }

  seatOf(controllerId: string): Seat | undefined {
    return this.seats.find((s) => s.controllerId === controllerId);
  }

  /** The Seat that paused the match, while it is paused. */
  pausedBy(): Seat | undefined {
    return this.seats.find((s) => s.playerId === this.pauser);
  }

  resume(): void {
    this.pauser = null;
  }

  /** The hazard cursor of the Seat on this controller, while that Seat is knocked out of a race. */
  cursor(controllerId: string): HazardCursor | null {
    const cursor = this.cursors.get(this.seatOf(controllerId)?.playerId ?? "");
    return cursor ? this.inWorld(cursor) : null;
  }

  /** Every knocked-out Seat's hazard cursor, with the Seat it belongs to. */
  allCursors(): { seat: Seat; cursor: HazardCursor }[] {
    return this.seats.flatMap((seat) => {
      const cursor = this.cursors.get(seat.playerId);
      return cursor ? [{ seat, cursor: this.inWorld(cursor) }] : [];
    });
  }

  /** Which controllers may drive the on-screen menus right now. */
  menuControllers(): (controllerId: string) => boolean {
    const phase = this.roomState?.phase ?? "lobby";
    const pauser = this.pausedBy();
    if (pauser) {
      const pauserController = pauser.controllerId;
      return pauserController && this.pads.has(pauserController) ? (id) => id === pauserController : () => true;
    }
    if (phase === "lobby") {
      const host = this.hostSeat()?.controllerId;
      return (id) => id === host;
    }
    if (phase === "matchEnd") return (id) => this.seatOf(id) !== undefined;
    return () => false;
  }

  /** Send a message as the Host, for the lobby and podium buttons the Host's controller presses. */
  asHost(msg: ClientMsg): void {
    const host = this.hostSeat();
    if (!host) return;
    const before = new Set(this.roomState?.players.map((p) => p.id));
    this.sim.handle(host.playerId, msg);
    if (msg.t === "addBot") {
      const added = this.roomState?.players.find((p) => p.bot && !before.has(p.id));
      if (added) this.botSkills.set(added.id, msg.skill);
    }
  }

  /** The lobby's bots: how many, the one skill they share, and how many fit beside the Seats. */
  bots(): { count: number; skill: BotSkill; max: number } {
    const count = this.roomState.players.filter((p) => p.bot).length;
    return { count, skill: this.botSkill, max: MAX_PLAYERS - this.seatList.length };
  }

  /** Add or remove bots to reach `count`, all of `skill`; a new skill swaps every bot. */
  setBots(count: number, skill: BotSkill): void {
    if (!this.hostSeat()) return;
    const target = Math.max(0, Math.min(count, this.bots().max));
    this.botSkill = skill;
    const current = () => this.roomState.players.filter((p) => p.bot);
    for (const bot of current()) {
      if (this.botSkills.get(bot.id) !== skill || current().length > target) this.asHost({ t: "removeBot", id: bot.id });
    }
    while (current().length < target) {
      const before = current().length;
      this.asHost({ t: "addBot", skill });
      if (current().length === before) return;
    }
  }

  /** Every Seat's Room messages that only the whole group should decide, like a rematch. */
  asEverySeat(msg: ClientMsg): void {
    for (const seat of this.seatList) this.sim.handle(seat.playerId, msg);
  }

  /**
   * Abandon the match and start a fresh lobby with the same Seats, controllers, settings and bots.
   * The Room only goes back to its lobby on its own at the end of a match, so this builds a new one.
   * Seats join first, so they take the first colours; match wins are forgotten.
   */
  backToLobby(): void {
    const previous = this.roomState;
    const seats = this.seatList;
    this.pauser = null;
    this.carry = 0;
    this.cursors.clear();
    this.latestSnap = null;
    this.roomState = emptyLobby();
    this.seatList = [];
    this.sim = this.createRoom();
    for (const seat of seats) {
      const joined = this.join(seat.controllerId ?? "", seat.playerId);
      if (joined && seat.controllerId === null) this.bind(joined.playerId, null);
    }
    if (!previous) return;
    const bots = previous.players.flatMap((p) => {
      const skill = this.botSkills.get(p.id);
      return p.bot && skill ? [skill] : [];
    });
    this.botSkills.clear();
    this.asHost({ t: "tracks", names: previous.tracks });
    this.asHost({ t: "winCondition", ...previous.win });
    this.asHost({ t: "cup", legs: previous.cup });
    for (const skill of bots) this.asHost({ t: "addBot", skill });
  }

  /** Handle this frame's controller presses. Call once per controller poll, before `step`. */
  controllers(frame: ControllerFrame): LocalNotice[] {
    this.pads = frame.pads;
    const notices: LocalNotice[] = [];
    const phase = this.roomState?.phase ?? "lobby";
    for (const controllerId of frame.disconnected) {
      const seat = this.seatOf(controllerId);
      if (!seat) continue;
      if (phase === "lobby") {
        this.leave(seat);
        notices.push({ kind: "left", seat });
      } else {
        this.bind(seat.playerId, null);
        notices.push({ kind: "disconnected", seat: { ...seat, controllerId: null } });
      }
    }
    for (const controllerId of frame.connected) {
      const orphan = this.seats.find((s) => s.controllerId === null);
      if (!orphan || this.seatOf(controllerId)) continue;
      this.bind(orphan.playerId, controllerId);
      notices.push({ kind: "reclaimed", seat: { ...orphan, controllerId } });
    }
    for (const controllerId of frame.pads.keys()) {
      const seat = this.seatOf(controllerId);
      if (!seat) {
        if (phase === "lobby" && frame.pressed(controllerId, "a")) {
          const joined = this.join(controllerId);
          if (joined) notices.push({ kind: "joined", seat: joined });
        }
        continue;
      }
      if (phase === "lobby" && frame.pressed(controllerId, "b")) {
        this.leave(seat);
        notices.push({ kind: "left", seat });
        continue;
      }
      if (phase === "lobby" && frame.pressed(controllerId, "start") && seat.playerId === this.roomState?.hostId) {
        if (!this.startMatch()) notices.push({ kind: "needsRacers" });
      }
    }
    this.pauseButtons(frame, phase);
    if (phase === "race" && !this.pauser) notices.push(...this.knockedOutButtons(frame));
    return notices;
  }

  private pauseButtons(frame: ControllerFrame, phase: string): void {
    if (!PAUSABLE.has(phase)) return;
    const pauser = this.pausedBy();
    if (!pauser) {
      const starter = this.seats.find((s) => s.controllerId && frame.pressed(s.controllerId, "start"));
      if (starter) this.pauser = starter.playerId;
      return;
    }
    const canResume = pauser.controllerId && frame.pads.has(pauser.controllerId) ? [pauser] : this.seats;
    if (canResume.some((s) => s.controllerId && (frame.pressed(s.controllerId, "start") || frame.pressed(s.controllerId, "b")))) this.resume();
  }

  private knockedOutButtons(frame: ControllerFrame): LocalNotice[] {
    const notices: LocalNotice[] = [];
    this.refreshCursors();
    for (const seat of this.seats) {
      const cursor = this.cursors.get(seat.playerId);
      if (!cursor || !seat.controllerId) continue;
      const pressed = (button: ButtonName) => frame.pressed(seat.controllerId!, button);
      const at = HAZARD_KINDS.indexOf(cursor.kind);
      if (pressed("rightBumper")) cursor.kind = HAZARD_KINDS[(at + 1) % HAZARD_KINDS.length]!;
      if (pressed("leftBumper")) cursor.kind = HAZARD_KINDS[(at - 1 + HAZARD_KINDS.length) % HAZARD_KINDS.length]!;
      if (pressed("a")) {
        const readyAt = this.latestSnap?.cooldowns[seat.playerId]?.[cursor.kind] ?? 0;
        notices.push({ kind: "hazard", seat, ready: (this.latestSnap?.now ?? 0) >= readyAt });
        const { x, y } = this.inWorld(cursor);
        this.sim.handle(seat.playerId, { t: "hazard", kind: cursor.kind, x, y });
      }
      for (const [button, emote] of EMOTE_BUTTONS) if (pressed(button)) this.sim.handle(seat.playerId, { t: "emote", emote });
    }
    return notices;
  }

  /** Give every Seat that has just been knocked out a cursor in the middle of the view. */
  private refreshCursors(): void {
    const snap = this.latestSnap;
    if (!snap || this.roomState?.phase !== "race") return;
    for (const seat of this.seatList) {
      const car = snap.cars.find((c) => c.id === seat.playerId);
      if (car && !car.alive && !this.cursors.has(seat.playerId)) this.cursors.set(seat.playerId, { across: 0, down: 0, kind: "block" });
    }
  }

  private moveCursors(): void {
    const step = CURSOR_SPEED * DT;
    const aspect = VIEW.width / VIEW.height;
    for (const seat of this.seatList) {
      const cursor = this.cursors.get(seat.playerId);
      const pad = seat.controllerId ? this.pads.get(seat.controllerId) : undefined;
      if (!cursor || !pad) continue;
      const stick = leftStick(pad);
      if (Math.hypot(stick.x, stick.y) < CURSOR_DEADZONE) continue;
      cursor.across = Math.min(0.5, Math.max(-0.5, cursor.across + stick.x * step));
      cursor.down = Math.min(0.5, Math.max(-0.5, cursor.down + stick.y * step * aspect));
    }
  }

  private inWorld(cursor: ScreenCursor): HazardCursor {
    const camera = this.latestSnap?.camera ?? { x: 0, y: 0, scale: 1 };
    return { x: camera.x + cursor.across * VIEW.width * camera.scale, y: camera.y + cursor.down * VIEW.height * camera.scale, kind: cursor.kind };
  }

  /** Advance the match by real elapsed time, in whole Room ticks. */
  step(elapsedSeconds: number): void {
    // Paused, keep the carry, so the race stays drawn where it stopped.
    if (this.pauser) return;
    this.carry = Math.min(this.carry + elapsedSeconds, MAX_CATCH_UP);
    while (this.carry >= DT - 1e-9) {
      this.carry -= DT;
      this.tick();
    }
  }

  /** How far real time is into the next tick, 0..1, for drawing between the last two. */
  blend(): number {
    return Math.min(1, Math.max(0, this.carry / DT));
  }

  private tick(): void {
    if (this.roomState?.phase === "race") {
      this.inputSeq++;
      for (const seat of this.seatList) {
        const pad = seat.controllerId ? this.pads.get(seat.controllerId) : undefined;
        const input = pad ? carInputFromPad(pad) : emptyInput;
        this.sim.handle(seat.playerId, { t: "input", seq: this.inputSeq, input });
      }
      this.moveCursors();
    }
    this.sim.update(DT);
    this.refreshCursors();
  }

  private join(controllerId: string, playerId = `seat-${++this.seatSeq}`): Seat | undefined {
    const players = this.roomState?.players ?? [];
    if (players.length >= MAX_PLAYERS) return undefined;
    const color = nextFreeColor(players);
    const name = PLAYER_COLOR_NAMES[color]!;
    if (!this.sim.join(playerId, name)) return undefined;
    this.seatList.push({ playerId, controllerId, name, color });
    return this.seats.find((s) => s.playerId === playerId);
  }

  private bind(playerId: string, controllerId: string | null): void {
    const seat = this.seatList.find((s) => s.playerId === playerId);
    if (seat) seat.controllerId = controllerId;
  }

  private leave(seat: Seat): void {
    this.seatList = this.seatList.filter((s) => s.playerId !== seat.playerId);
    this.sim.leave(seat.playerId);
  }

  private startMatch(): boolean {
    if ((this.roomState?.players.length ?? 0) < 2) return false;
    for (const seat of this.seatList) this.sim.handle(seat.playerId, { t: "ready", ready: true });
    return true;
  }
}

/**
 * What the lobby looks like before anyone has joined. The Room only says what it looks like once it
 * has a player to tell, but the screen needs a lobby to show so the first person knows to press A.
 */
function emptyLobby(): RoomInfo {
  return {
    t: "room",
    code: LOCAL_ROOM_CODE,
    players: [],
    hostId: null,
    mode: "contact",
    phase: "lobby",
    drawerId: null,
    win: DEFAULT_WIN,
    tracks: PRESET_TRACKS.map((t) => t.name),
    remaining: 0,
    round: 0,
    cup: 0,
    leg: 0,
  };
}

/** The colour the Room will give the next player to join: the lowest one nobody has. */
export function nextFreeColor(players: Pick<PlayerInfo, "color">[]): number {
  const used = new Set(players.map((p) => p.color));
  return [...Array(MAX_PLAYERS).keys()].find((c) => !used.has(c)) ?? 0;
}
