export function createNetStats() {
  let late: number[] = [];
  let frames = 0;
  let starved = 0;
  let trips: number[] = [];
  let corrections: number[] = [];

  return {
    snap(lateMs: number) {
      late.push(lateMs);
    },
    frame(isStarved: boolean) {
      frames++;
      if (isStarved) starved++;
    },
    roundTrip(ms: number) {
      trips.push(ms);
    },
    corrected(distance: number) {
      corrections.push(distance);
    },
    take(): Record<string, number> | null {
      if (!frames) return null;
      const summary = {
        snapLateP95: late.length ? Math.round(p95(late)) : undefined,
        snapLateMax: late.length ? Math.round(Math.max(...late)) : undefined,
        starvedPct: Math.round((starved / frames) * 100),
        rttAvg: trips.length ? Math.round(avg(trips)) : undefined,
        rttMax: trips.length ? Math.round(Math.max(...trips)) : undefined,
        correctAvg: corrections.length ? tenths(avg(corrections)) : undefined,
        correctMax: corrections.length ? tenths(Math.max(...corrections)) : undefined,
      };
      late = [];
      trips = [];
      corrections = [];
      frames = starved = 0;
      return Object.fromEntries(Object.entries(summary).filter(([, v]) => v !== undefined)) as Record<string, number>;
    },
  };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const tenths = (x: number) => Math.round(x * 10) / 10;

function p95(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}
