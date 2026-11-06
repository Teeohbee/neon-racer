import type { BotSkill } from "./bot";
import type { Camera } from "./camera";
import type { CarInput, CarState } from "./car";
import type { Hazard, HazardKind } from "./hazards";
import type { Point } from "./track";
import type { TrackProblem } from "./validate";

export type Mode = "ghost" | "contact";
export type Phase = "lobby" | "sketch" | "countdown" | "race" | "roundEnd" | "matchEnd";

export interface PlayerInfo {
  id: string;
  name: string;
  color: number;
  ready: boolean;
  score: number;
  bot: boolean;
}

export interface CarSnap extends CarState {
  id: string;
  alive: boolean;
  ack: number;
}

export type GameEvent =
  | { kind: "eliminated"; id: string }
  | { kind: "hazardKill"; by: string; victim: string }
  | { kind: "roundWon"; id: string | null }
  | { kind: "matchWon"; id: string };

export type ClientMsg =
  | { t: "ready"; ready: boolean }
  | { t: "mode"; mode: Mode }
  | { t: "sketch"; points: Point[]; reset: boolean }
  | { t: "submit" }
  | { t: "state"; seq: number; car: CarState }
  | { t: "input"; seq: number; input: CarInput }
  | { t: "hazard"; kind: HazardKind; x: number; y: number }
  | { t: "addBot"; skill: BotSkill }
  | { t: "removeBot"; id: string }
  | { t: "again" };

export type ServerMsg =
  | { t: "welcome"; you: string; code: string }
  | { t: "error"; message: string }
  | {
      t: "room";
      code: string;
      players: PlayerInfo[];
      hostId: string | null;
      mode: Mode;
      phase: Phase;
      drawerId: string | null;
      target: number;
      remaining: number;
      round: number;
    }
  | { t: "sketch"; drawerId: string; points: Point[]; reset: boolean }
  | { t: "problems"; problems: TrackProblem[] }
  | { t: "track"; raw: Point[]; name: string }
  | {
      t: "snap";
      tick: number;
      phase: Phase;
      now: number;
      camera: Camera;
      cars: CarSnap[];
      hazards: Hazard[];
      cooldowns: Record<string, Record<HazardKind, number>>;
    }
  | { t: "event"; event: GameEvent };
