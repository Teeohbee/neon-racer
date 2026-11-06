export const ATTRACT = {
  trackSeconds: 24,
  shotSeconds: 6,
  cars: 4,
};

export interface AttractShot {
  round: number;
  track: number;
  focus: number;
}

export function attractShot(elapsed: number, firstTrack: number, trackCount: number, carCount = ATTRACT.cars): AttractShot {
  const t = Math.max(0, elapsed);
  const round = Math.floor(t / ATTRACT.trackSeconds);
  const shot = Math.floor((t - round * ATTRACT.trackSeconds) / ATTRACT.shotSeconds);
  return {
    round,
    track: (((firstTrack + round) % trackCount) + trackCount) % trackCount,
    focus: carCount > 0 ? (round + shot) % carCount : 0,
  };
}
