import type { Point } from "./track";

export type TrackProblem = "too-few-points" | "too-short" | "too-tight" | "overlapping" | "out-of-bounds";

export function validateDrawing(_raw: Point[]): TrackProblem[] {
  return [];
}

export function describeProblem(problem: TrackProblem): string {
  return problem;
}

export function randomTrackPoints(_rng: () => number): Point[] {
  return [];
}
