import { emptyInput, MAX_PLAYERS, Room, TICK_RATE, type ClientMsg, type PlayerInfo, type ServerMsg } from "@neon/sim";
import { carInputFromPad } from "../controller/pad";
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
  | { kind: "reclaimed"; seat: Seat };

export interface LocalMatchOptions {
  onMessage: (msg: ServerMsg) => void;
  rng?: () => number;
}

const DT = 1 / TICK_RATE;
const MAX_CATCH_UP = DT * 10;
const LOCAL_ROOM_CODE = "HOME";

export class LocalMatch {
  private roomState: RoomInfo | null = null;
  private seatList: Omit<Seat, "number">[] = [];
  private seatSeq = 0;
  private inputSeq = 0;
  private pads: ControllerFrame["pads"] = new Map();
  private carry = 0;
  private readonly sim: Room;

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
      { rng: this.opts.rng },
    );
  }

  private receive(msg: ServerMsg): void {
    if (msg.t === "welcome") return;
    if (msg.t === "room") this.roomState = msg;
    this.opts.onMessage(msg);
  }

  get seats(): Seat[] {
    return this.seatList.map((seat, i) => ({ ...seat, number: i + 1 }));
  }

  room(): RoomInfo | null {
    return this.roomState;
  }

  hostSeat(): Seat | undefined {
    return this.seats.find((s) => s.playerId === this.roomState?.hostId);
  }

  seatOf(controllerId: string): Seat | undefined {
    return this.seats.find((s) => s.controllerId === controllerId);
  }

  /** Which controllers may drive the on-screen menus right now. */
  menuControllers(): (controllerId: string) => boolean {
    const phase = this.roomState?.phase ?? "lobby";
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
    if (host) this.sim.handle(host.playerId, msg);
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
    return notices;
  }

  /** Advance the match by real elapsed time, in whole Room ticks. */
  step(elapsedSeconds: number): void {
    this.carry = Math.min(this.carry + elapsedSeconds, MAX_CATCH_UP);
    while (this.carry >= DT - 1e-9) {
      this.carry -= DT;
      this.tick();
    }
  }

  private tick(): void {
    if (this.roomState?.phase === "race") {
      this.inputSeq++;
      for (const seat of this.seatList) {
        const pad = seat.controllerId ? this.pads.get(seat.controllerId) : undefined;
        const input = pad ? carInputFromPad(pad) : emptyInput;
        this.sim.handle(seat.playerId, { t: "input", seq: this.inputSeq, input });
      }
    }
    this.sim.update(DT);
  }

  private join(controllerId: string): Seat | undefined {
    const players = this.roomState?.players ?? [];
    if (players.length >= MAX_PLAYERS) return undefined;
    const color = nextFreeColor(players);
    const playerId = `seat-${++this.seatSeq}`;
    const name = PLAYER_COLOR_NAMES[color]!;
    if (!this.sim.join(playerId, name)) return undefined;
    this.seatList.push({ playerId, controllerId, name, color });
    return this.seatOf(controllerId);
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

/** The colour the Room will give the next player to join: the lowest one nobody has. */
export function nextFreeColor(players: Pick<PlayerInfo, "color">[]): number {
  const used = new Set(players.map((p) => p.color));
  return [...Array(MAX_PLAYERS).keys()].find((c) => !used.has(c)) ?? 0;
}
