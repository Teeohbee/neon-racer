import { CAR_RADIUS, speedOf, type CarState } from "./car";
import type { Award, EliminationReason } from "./protocol";

export const MAX_AWARDS = 5;
const DRIFT_SPEED = 120;
const DRIFT_LATERAL = 90;
const MIN_DRIFT = 0.5;

interface Stats {
  kills: number;
  falls: number;
  caught: number;
  placed: number;
  wins: number;
  leading: number;
  drift: number;
  longestDrift: number;
  roundShave: number;
  shave: number;
}

interface AwardSpec {
  title: string;
  blurb: string;
  score: (s: Stats) => number;
  lowest?: boolean;
  stat: (value: number) => string;
}

const MAX_SHAVE = CAR_RADIUS * 2 * 5;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const seconds = (n: number) => `${+n.toFixed(1)}s`;

const AWARDS: AwardSpec[] = [
  { title: "Black ICE Dealer", blurb: "Their hazards flatlined more hackers than a corporate firewall", score: (s) => s.kills, stat: (n) => `${plural(n, "racer")} flatlined` },
  {
    title: "Firewall Kisser",
    blurb: "Close enough to the line to read its source code",
    score: (s) => (s.shave <= MAX_SHAVE ? s.shave : Infinity),
    lowest: true,
    stat: (n) => `outran the line by ${+(n / (CAR_RADIUS * 2)).toFixed(1)} car lengths`,
  },
  { title: "Sideways Firmware", blurb: "Treated the hard-light lanes as a suggestion", score: (s) => (s.longestDrift >= MIN_DRIFT ? s.longestDrift : 0), stat: (n) => `${seconds(n)} sideways` },
  { title: "Gravity Subscriber", blurb: "Kept testing whether the hijacked lanes had edges. They do", score: (s) => s.falls, stat: (n) => `fell off the lanes ${plural(n, "time")}` },
  { title: "Garbage Collected", blurb: "The line has filed a restraining order", score: (s) => s.caught, stat: (n) => `caught by the line ${plural(n, "time")}` },
  { title: "Main Character Energy", blurb: "The pirate stream camera could not look away", score: (s) => s.leading, stat: (n) => `${seconds(n)} hogging the pirate stream camera` },
  { title: "Pirate Stream Troll", blurb: "Flatlined, but still posting", score: (s) => s.placed, stat: (n) => `${plural(n, "hazard")} dropped from beyond` },
  { title: "Sponsored Content", blurb: "Brought to you by a megacorp you have never heard of", score: (s) => s.wins, stat: (n) => `${plural(n, "round")} won` },
];

const fresh = (): Stats => ({ kills: 0, falls: 0, caught: 0, placed: 0, wins: 0, leading: 0, drift: 0, longestDrift: 0, roundShave: Infinity, shave: Infinity });

export class MatchStats {
  private stats = new Map<string, Stats>();

  private of(id: string): Stats {
    let s = this.stats.get(id);
    if (!s) this.stats.set(id, (s = fresh()));
    return s;
  }

  sample(id: string, car: CarState, gap: number | null, dt: number): void {
    const s = this.of(id);
    const lateral = Math.abs(-car.vx * Math.sin(car.angle) + car.vy * Math.cos(car.angle));
    s.drift = speedOf(car) > DRIFT_SPEED && lateral > DRIFT_LATERAL ? s.drift + dt : 0;
    s.longestDrift = Math.max(s.longestDrift, s.drift);
    if (gap !== null && gap >= 0) s.roundShave = Math.min(s.roundShave, gap);
  }

  leading(id: string, dt: number): void {
    this.of(id).leading += dt;
  }

  hazardKill(by: string): void {
    this.of(by).kills++;
  }

  hazardPlaced(id: string): void {
    this.of(id).placed++;
  }

  eliminated(id: string, reason: EliminationReason): void {
    const s = this.of(id);
    s.drift = 0;
    if (reason === "fell") s.falls++;
    if (reason === "line") {
      s.caught++;
      s.roundShave = Infinity;
    }
  }

  endRound(winner: string | null): void {
    if (winner) this.of(winner).wins++;
    for (const s of this.stats.values()) {
      s.shave = Math.min(s.shave, s.roundShave);
      s.roundShave = Infinity;
      s.drift = 0;
    }
  }

  awards(ids: string[]): Award[] {
    const given = new Map<string, number>();
    const awards: Award[] = [];
    for (const spec of AWARDS) {
      if (awards.length >= MAX_AWARDS) break;
      const sign = spec.lowest ? -1 : 1;
      const candidates = ids.flatMap((id) => {
        const value = spec.score(this.of(id));
        return Number.isFinite(value) && (spec.lowest || value > 0) ? [{ id, value }] : [];
      });
      const best = candidates.reduce<{ id: string; value: number } | null>((top, c) => {
        if (!top) return c;
        const diff = sign * (c.value - top.value);
        return diff > 0 || (diff === 0 && (given.get(c.id) ?? 0) < (given.get(top.id) ?? 0)) ? c : top;
      }, null);
      if (!best) continue;
      given.set(best.id, (given.get(best.id) ?? 0) + 1);
      awards.push({ id: best.id, title: spec.title, blurb: spec.blurb, stat: spec.stat(best.value) });
    }
    return awards;
  }
}
