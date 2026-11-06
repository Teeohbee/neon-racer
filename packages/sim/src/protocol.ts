import type { BotSkill } from "./bot";
import type { Camera } from "./camera";
import type { CarInput, CarState } from "./car";
import type { Hazard, HazardKind } from "./hazards";
import type { FeatureSpec, Point } from "./track";
import type { TrackProblem } from "./validate";

export type Mode = "ghost" | "contact";
export type EliminationReason = "line" | "fell" | "left";
export type Phase = "lobby" | "sketch" | "countdown" | "race" | "roundEnd" | "matchEnd";

export const SCORE_TARGETS = [5, 8, 12] as const;
export const LAP_COUNTS = [2, 3, 5] as const;
export type WinCondition = { kind: "score"; target: (typeof SCORE_TARGETS)[number] } | { kind: "laps"; laps: (typeof LAP_COUNTS)[number] };

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

export interface Award {
  id: string;
  title: string;
  blurb: string;
  stat: string;
}

export type GameEvent =
  | { kind: "eliminated"; id: string; reason: EliminationReason }
  | { kind: "roundScored"; results: { id: string; delta: number }[] }
  | { kind: "hazardKill"; by: string; victim: string }
  | { kind: "roundWon"; id: string | null }
  | { kind: "matchWon"; id: string }
  | { kind: "awards"; awards: Award[] };

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
  | { t: "tracks"; names: string[] }
  | ({ t: "winCondition" } & WinCondition)
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
      win: WinCondition;
      tracks: string[];
      remaining: number;
      round: number;
    }
  | { t: "sketch"; drawerId: string; points: Point[]; reset: boolean }
  | { t: "problems"; problems: TrackProblem[] }
  | { t: "track"; raw: Point[]; name: string; features: FeatureSpec[] }
  | {
      t: "snap";
      tick: number;
      phase: Phase;
      now: number;
      camera: Camera;
      line: number | null;
      lap: number | null;
      cars: CarSnap[];
      hazards: Hazard[];
      cooldowns: Record<string, Record<HazardKind, number>>;
    }
  | { t: "event"; event: GameEvent };
