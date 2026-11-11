const WINDOW_MS = 500;
const PAUSE_MS = 1000;

export interface FpsSample {
  fps: number;
  worstMs: number;
}

export function createFpsMeter() {
  let last: number | null = null;
  let windowStart = 0;
  let frames = 0;
  let worst = 0;

  return {
    frame(now: number): FpsSample | null {
      if (last === null || now - last > PAUSE_MS) {
        last = windowStart = now;
        frames = worst = 0;
        return null;
      }
      worst = Math.max(worst, now - last);
      last = now;
      frames++;
      if (now - windowStart < WINDOW_MS) return null;
      const sample = { fps: Math.round((frames * 1000) / (now - windowStart)), worstMs: Math.round(worst) };
      windowStart = now;
      frames = worst = 0;
      return sample;
    },
  };
}
