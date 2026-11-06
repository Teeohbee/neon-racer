import { hash01 } from "./stream-seed";

export type Hype = "eliminated" | "hazardKill" | "shave" | "lead" | "roundWon" | "matchWon";

const MIN_BASE = 900;
const BASE_RANGE = 4200;
const DRIFT_STEP = 5;
const DRIFT = 0.12;
const HALF_LIFE = 6;
const MAX_SPIKES = 16;
const BITRATE = 6.2;
const MIN_BITRATE = 0.4;
const SPIKES: Record<Hype, { burst: number; keep: number }> = {
  eliminated: { burst: 0.25, keep: 0.02 },
  hazardKill: { burst: 0.45, keep: 0.04 },
  shave: { burst: 0.15, keep: 0.01 },
  lead: { burst: 0.1, keep: 0.005 },
  roundWon: { burst: 0.35, keep: 0.03 },
  matchWon: { burst: 0.8, keep: 0.05 },
};

export interface ViewerModel {
  spike(kind: Hype, t: number): void;
  count(t: number): number;
  bitrate(t: number): number;
}

export function createViewerModel(seed: number): ViewerModel {
  const base = MIN_BASE + Math.floor(hash01(seed, 0) * BASE_RANGE);
  let growth = 1;
  let spikes: { at: number; size: number }[] = [];

  const drift = (t: number) => {
    const i = Math.floor(t / DRIFT_STEP);
    const f = t / DRIFT_STEP - i;
    const ease = f * f * (3 - 2 * f);
    const a = hash01(seed, 1, i) * 2 - 1;
    const b = hash01(seed, 1, i + 1) * 2 - 1;
    return (a + (b - a) * ease) * DRIFT;
  };
  const energy = (t: number) => spikes.reduce((sum, s) => (t >= s.at ? sum + s.size * 0.5 ** ((t - s.at) / HALF_LIFE) : sum), 0);

  return {
    spike(kind, t) {
      const { burst, keep } = SPIKES[kind];
      growth += keep;
      spikes = [...spikes, { at: t, size: burst }].slice(-MAX_SPIKES);
    },
    count(t) {
      return Math.round(base * growth * (1 + drift(t) + energy(t)));
    },
    bitrate(t) {
      const jitter = (hash01(seed, 2, Math.floor(t)) - 0.5) * 0.6;
      return Math.max(MIN_BITRATE, BITRATE + jitter - energy(t) * 6);
    },
  };
}

export function formatViewers(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("en-GB");
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}
