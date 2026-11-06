import type { EliminationReason } from "@neon/sim";
import { hash01, pick } from "./stream-seed";

export type StreamEvent =
  | { kind: "eliminated"; name: string; reason: EliminationReason }
  | { kind: "hazardKill"; by: string; victim: string }
  | { kind: "lead"; name: string }
  | { kind: "shave"; name: string }
  | { kind: "roundWon"; name: string | null }
  | { kind: "matchWon"; name: string }
  | { kind: "go" }
  | { kind: "suddenDeath" }
  | { kind: "ambient" };

export type ChatTone = "chat" | "hype" | "ad";

export interface ChatMessage {
  user: string;
  color: string;
  text: string;
  tone: ChatTone;
}

export interface ChatLine extends ChatMessage {
  id: number;
  at: number;
}

export const USERS = [
  "xX_flatline_Xx",
  "grid_goblin",
  "ICE_cold_99",
  "packetloss",
  "megacorp_intern",
  "lane_hijacker",
  "neonrat",
  "sub#88231",
  "adblock_martyr",
  "hardlight_hank",
  "0xDEADBEEF",
  "ripperdoc_rita",
  "chrome_mum",
  "cache_money",
  "syntax_terror",
  "free_trial_ghost",
  "null_ptr",
  "pixel_pirate",
  "rent_is_due",
  "sector7_lurker",
] as const;

const USER_COLORS = ["#00f0ff", "#ff2bd6", "#b6ff00", "#ffb000", "#8a5bff", "#7fd8ff", "#ff9cf0"] as const;

const LINES = {
  fell: ["lmao {name} fell off", "{name} found the edge of the lanes", "F in chat for {name}", "gravity patch hit {name} hard", "{name} unsubscribed from the road", "{name} forgot the lanes are hard-light, not hard-floor"],
  line: ["{name} got garbage collected", "the line ate {name} x_x", "{name} got deprecated", "{name} caught lacking", "line diff: -{name}", "{name} ran out of memory"],
  left: ["{name} rage-quit the stream", "{name} disconnected. coward or router?", "{name} logged off to pay rent"],
  hazardKill: ["{by} flatlined {victim} from beyond lmao", "{by} hacked a lane and {victim} paid for it", "{victim} got griefed by {by}", "clip it, {by} just deleted {victim}", "{by} is a menace. RIP {victim}", "dead and still posting, {by} got {victim}"],
  lead: ["{name} takes the lead", "{name} is P1, camera loves them", "{name} hogging the stream camera again", "{name} in front, chat", "{name} said excuse me"],
  shave: ["{name} was SO close to the line", "{name} kissed the firewall and lived", "HOW is {name} still alive", "the line licked {name}'s bumper", "{name} clutch"],
  roundWon: ["GG {name}", "{name} takes the round, sponsored by nobody", "{name} carried", "W {name}"],
  wipe: ["nobody survived lmao", "the line wins again", "total wipe, refund my subscription"],
  matchWon: ["{name} WINS IT ALL", "{name} is the main character now", "gg {name}, not even close", "clip that, {name} champion"],
  go: ["here we go", "GO GO GO", "first", "stream lagging or is it just me", "who hacked the lanes this time"],
  suddenDeath: ["SUDDEN DEATH lets gooo", "the line is speedrunning now", "this is where it gets ugly"],
  ambient: ["is this stream even legal", "mods asleep, post neon", "chat is this canon", "someone tell the city we're on their lanes", "my landlord is watching this too", "buffering in sector 7 again"],
  ad: ["[AD] Breathe+ Premium: now 12% more oxygen", "[AD] Your rent has been updated. Swipe to accept", "[AD] Skip this ad for 4.99 cred", "[AD] Gravity Lite: falls billed per metre"],
} as const;

const HYPE = new Set<StreamEvent["kind"]>(["hazardKill", "roundWon", "matchWon", "suddenDeath"]);
const LOW = new Set<StreamEvent["kind"]>(["lead", "shave", "go", "ambient"]);

export function isUrgent(event: StreamEvent): boolean {
  return !LOW.has(event.kind);
}

function templates(event: StreamEvent): readonly string[] {
  switch (event.kind) {
    case "eliminated":
      return LINES[event.reason];
    case "roundWon":
      return event.name ? LINES.roundWon : LINES.wipe;
    default:
      return LINES[event.kind];
  }
}

function fill(template: string, event: StreamEvent): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String((event as Record<string, unknown>)[key] ?? "someone"));
}

export function chatLine(event: StreamEvent, seed: number, n: number): ChatMessage {
  const ad = event.kind === "ambient" && hash01(seed, 3, n) < 0.4;
  const user = ad ? "CITY_SPONSOR" : pick(USERS, seed, 4, n);
  return {
    user,
    color: ad ? "#ffb000" : pick(USER_COLORS, seed, 5, USERS.indexOf(user as (typeof USERS)[number])),
    text: fill(pick(ad ? LINES.ad : templates(event), seed, 6, n), event),
    tone: ad ? "ad" : HYPE.has(event.kind) ? "hype" : "chat",
  };
}

export function mergeKills(events: StreamEvent[]): StreamEvent[] {
  const killed = new Set(events.flatMap((e) => (e.kind === "hazardKill" ? [e.victim] : [])));
  return events.filter((e) => !(e.kind === "eliminated" && killed.has(e.name)));
}

export interface ChatFeedOptions {
  max: number;
  ttl: number;
  gap: number;
}

export class ChatFeed {
  lines: ChatLine[] = [];
  private lastAt = -Infinity;
  private nextId = 0;

  constructor(private opts: ChatFeedOptions = { max: 5, ttl: 9, gap: 3 }) {}

  post(message: ChatMessage, urgent: boolean, now: number): boolean {
    if (!urgent && now - this.lastAt < this.opts.gap) return false;
    this.lastAt = now;
    this.lines = [...this.lines, { ...message, id: this.nextId++, at: now }].slice(-this.opts.max);
    return true;
  }

  expire(now: number): boolean {
    const kept = this.lines.filter((l) => now - l.at < this.opts.ttl);
    const changed = kept.length !== this.lines.length;
    this.lines = kept;
    return changed;
  }

  clear(): void {
    this.lines = [];
    this.lastAt = -Infinity;
  }
}
