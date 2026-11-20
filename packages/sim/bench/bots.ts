// Bot bench: races bot-only Rounds headlessly on every preset track and reports whether they're worth watching.
// Run by hand (`bun run bench:bots [roundsPerTrack]`), not in CI: it takes a minute or two.
// Exits non-zero when any target is missed.
// The sim package has no Node or DOM types; declare the two globals this script uses.
declare const process: { argv: string[]; exit(code: number): never };
declare const console: { log(...args: unknown[]): void };

import type { ServerMsg } from "../src/protocol";
import { Room, TICK_RATE } from "../src/room";
import { PRESET_TRACKS } from "../src/tracks";

const DT = 1 / TICK_RATE;
const ROUNDS_PER_TRACK = Number(process.argv[2] ?? 30);
const STALL_SECONDS = 300;
// Two cars side by side swap the lead every tick; only a pass by more than this counts.
const LEAD_HYSTERESIS = 60;
// The Room's host is a person, so five Runners fit beside them, and the Room picks which five.
const FIELD_SIZE = 5;

const TARGETS = {
  leadChanges: 3,
  roundSeconds: [35, 60] as const,
  dropShare: 0.25,
  maxWinShare: 0.3,
  maxTrackWinShare: 0.5,
};

interface RoundResult {
  seconds: number;
  leadChanges: number;
  winner: string | null;
  stalled: boolean;
}

// Reaches into the Room for each car's progress round the track; this is a dev tool, not a client.
interface RacerView {
  id: string;
  name: string;
  bot: unknown;
  alive: boolean;
  progress: { progress: number };
}
const racers = (room: Room) => [...(room as unknown as { players: Map<string, RacerView> }).players.values()].filter((p) => p.bot && p.alive);

function benchTrack(track: string, rounds: number) {
  const results: RoundResult[] = [];
  const reasons: Record<string, number> = {};
  for (let seed = 1; results.length < rounds; seed++) {
    let s = seed * 7919 + track.length * 104729;
    const rng = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    let phase = "lobby";
    let t = 0;
    let start = 0;
    let leader: string | null = null;
    let changes = 0;
    let winner: string | null = null;
    let matchOver = false;
    const names = new Map<string, string>();
    const on = (m: ServerMsg) => {
      if (m.t === "event" && m.event.kind === "eliminated" && m.event.id !== "host") reasons[m.event.reason] = (reasons[m.event.reason] ?? 0) + 1;
      if (m.t === "event" && m.event.kind === "roundWon") winner = m.event.id;
      if (m.t !== "room" || m.phase === phase) return;
      m.players.forEach((p) => names.set(p.id, p.name));
      if (m.phase === "race") {
        start = t;
        leader = null;
        changes = 0;
        winner = null;
      }
      if (phase === "race") results.push({ seconds: t - start, leadChanges: changes, winner: winner ? (names.get(winner) ?? winner) : null, stalled: false });
      if (m.phase === "matchEnd") matchOver = true;
      phase = m.phase;
    };
    const room = new Room("BNCH", { send: (_, m) => on(m), broadcast: on }, { rng, sketching: false });
    room.join("host", "host");
    for (let i = 0; i < FIELD_SIZE; i++) room.handle("host", { t: "addBot" });
    room.handle("host", { t: "tracks", names: [track] });
    room.handle("host", { t: "winCondition", kind: "score", target: 12 });
    room.handle("host", { t: "ready", ready: true });
    while (!matchOver && results.length < rounds) {
      room.update(DT);
      t += DT;
      if (phase !== "race" || t - start < 1) continue;
      const alive = racers(room);
      const front = alive.reduce<RacerView | null>((a, b) => (!a || b.progress.progress > a.progress.progress ? b : a), null);
      const current = alive.find((p) => p.id === leader);
      if (front && (!current || (front.id !== leader && front.progress.progress - current.progress.progress > LEAD_HYSTERESIS))) {
        if (current) changes++;
        leader = front.id;
      }
      if (t - start > STALL_SECONDS) {
        results.push({ seconds: STALL_SECONDS, leadChanges: changes, winner: null, stalled: true });
        break;
      }
    }
  }
  return { results, reasons };
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] ?? 0;
const share = (n: number, d: number) => (d ? n / d : 0);
const fmt = (x: number) => `${Math.round(x * 100)}%`;

function summarise(results: RoundResult[], reasons: Record<string, number>) {
  const wins = new Map<string, number>();
  for (const r of results) if (r.winner) wins.set(r.winner, (wins.get(r.winner) ?? 0) + 1);
  const eliminations = Object.values(reasons).reduce((a, b) => a + b, 0);
  return {
    rounds: results.length,
    median: median(results.map((r) => r.seconds)),
    p10: pct(results.map((r) => r.seconds), 0.1),
    p90: pct(results.map((r) => r.seconds), 0.9),
    leadChanges: median(results.map((r) => r.leadChanges)),
    dropShare: share(reasons.fell ?? 0, eliminations),
    stalled: results.filter((r) => r.stalled).length,
    topWinShare: share(Math.max(0, ...wins.values()), results.length),
    wins,
  };
}

const all: RoundResult[] = [];
const allReasons: Record<string, number> = {};
const misses: string[] = [];
console.log(`Bot bench: ${ROUNDS_PER_TRACK} Rounds per track, ${FIELD_SIZE} random Runners and an idle host\n`);
console.log("track            rounds  median   p10   p90  leads  drops  stalled  top winner");
for (const { name } of PRESET_TRACKS) {
  const { results, reasons } = benchTrack(name, ROUNDS_PER_TRACK);
  all.push(...results);
  for (const [k, v] of Object.entries(reasons)) allReasons[k] = (allReasons[k] ?? 0) + v;
  const s = summarise(results, reasons);
  const top = [...s.wins].sort((a, b) => b[1] - a[1])[0];
  console.log(
    `${name.padEnd(16)} ${String(s.rounds).padStart(6)} ${s.median.toFixed(1).padStart(6)}s ${s.p10.toFixed(0).padStart(5)} ${s.p90.toFixed(0).padStart(5)} ${String(s.leadChanges).padStart(6)} ${fmt(s.dropShare).padStart(6)} ${String(s.stalled).padStart(8)}  ${top ? `${top[0]} ${fmt(s.topWinShare)}` : "-"}`,
  );
  if (s.topWinShare > TARGETS.maxTrackWinShare) misses.push(`${name}: ${top?.[0]} wins ${fmt(s.topWinShare)} of Rounds (max ${fmt(TARGETS.maxTrackWinShare)})`);
}

const s = summarise(all, allReasons);
console.log(`\nOverall: ${s.rounds} Rounds, median ${s.median.toFixed(1)}s (p10 ${s.p10.toFixed(0)}, p90 ${s.p90.toFixed(0)}), ${s.leadChanges} lead changes, ${fmt(s.dropShare)} of eliminations from drops, ${s.stalled} stalled`);
console.log(`Wins: ${[...s.wins].sort((a, b) => b[1] - a[1]).map(([n, w]) => `${n} ${fmt(share(w, s.rounds))}`).join(", ")}`);

if (s.leadChanges < TARGETS.leadChanges) misses.push(`median lead changes ${s.leadChanges} (min ${TARGETS.leadChanges})`);
if (s.median < TARGETS.roundSeconds[0] || s.median > TARGETS.roundSeconds[1]) misses.push(`median Round ${s.median.toFixed(1)}s (want ${TARGETS.roundSeconds.join("-")}s)`);
if (s.dropShare < TARGETS.dropShare) misses.push(`drops ${fmt(s.dropShare)} of eliminations (min ${fmt(TARGETS.dropShare)})`);
if (s.stalled > 0) misses.push(`${s.stalled} Rounds stalled past ${STALL_SECONDS}s`);
if (s.topWinShare > TARGETS.maxWinShare) misses.push(`one bot wins ${fmt(s.topWinShare)} of Rounds (max ${fmt(TARGETS.maxWinShare)})`);

console.log(misses.length ? `\nMISSED:\n  ${misses.join("\n  ")}` : "\nAll targets met.");
process.exit(misses.length ? 1 : 0);

