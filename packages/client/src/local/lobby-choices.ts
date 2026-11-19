import { PRESET_TRACKS, TARGET_SCORE, type ClientMsg, type CupLegs, type WinCondition } from "@neon/sim";

/**
 * The Local play lobby's settings as left/right choices. The Room still takes a pool of tracks;
 * here a pool of one is that track and anything bigger is Random, which is what a sofa asks for.
 */

export const RANDOM_TRACK = "Random";
const DEFAULT_LAPS = 3;
const ALL_TRACKS = PRESET_TRACKS.map((t) => t.name);

export function modeWin(kind: WinCondition["kind"]): WinCondition {
  return kind === "laps" ? { kind: "laps", laps: DEFAULT_LAPS } : { kind: "score", target: TARGET_SCORE };
}

export function trackChoices(cup: CupLegs): string[] {
  return cup ? [RANDOM_TRACK] : [RANDOM_TRACK, ...ALL_TRACKS];
}

export function trackChoice(selected: readonly string[]): string {
  return selected.length === 1 ? selected[0]! : RANDOM_TRACK;
}

export function tracksFor(choice: string): Extract<ClientMsg, { t: "tracks" }> {
  return { t: "tracks", names: choice === RANDOM_TRACK ? ALL_TRACKS : [choice] };
}

/** A cup on one track would race it every leg, so starting a cup puts the tracks back to Random. */
export function cupMessages(legs: CupLegs, selected: readonly string[]): ClientMsg[] {
  return legs && trackChoice(selected) !== RANDOM_TRACK ? [{ t: "cup", legs }, tracksFor(RANDOM_TRACK)] : [{ t: "cup", legs }];
}
