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

export type ChatTone = "chat" | "hype" | "ad" | "player";

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
  fell: ["lmao {name} fell off", "{name} found the edge of the lanes", "F in chat for {name}", "gravity patch hit {name} hard", "{name} unsubscribed from the road", "{name} forgot the lanes are hard-light, not hard-floor", "{name} is still falling. the city is a long way down", "{name} rolled a little too high", "{name} took the scenic route down", "{name} speedran the ground floor", "{name} has left the lanes. and the building", "respawn {name} pls", "{name} trusted the guardrail. there is no guardrail", "{name} is a pedestrian now", "somebody check on {name}, that was 90 floors", "{name} yeeted into the smog"],
  line: ["{name} got garbage collected", "the line ate {name} x_x", "{name} got deprecated", "{name} caught lacking", "line diff: -{name}", "{name} ran out of memory", "{name} got 404'd", "{name} was too slow for the patch notes", "the line said no to {name}", "{name} hit end of support", "{name} got rolled back", "{name} timed out", "rm -rf {name}", "{name} has been archived"],
  left: ["{name} rage-quit the stream", "{name} disconnected. coward or router?", "{name} logged off to pay rent", "{name} pulled the plug", "{name}'s connection got repo'd", "{name} alt-f4'd irl", "{name} went to touch grass. there is no grass"],
  hazardKill: ["{by} flatlined {victim} from beyond lmao", "{by} hacked a lane and {victim} paid for it", "{victim} got griefed by {by}", "clip it, {by} just deleted {victim}", "{by} is a menace. RIP {victim}", "dead and still posting, {by} got {victim}", "{by} with the trap card on {victim}", "{victim} never saw {by} coming", "{by} griefing from the afterlife again, poor {victim}", "{by} 1, {victim} 0", "{victim} is filing a complaint about {by}", "ghost {by} still has hands. ask {victim}"],
  lead: ["{name} takes the lead", "{name} is P1, camera loves them", "{name} hogging the stream camera again", "{name} in front, chat", "{name} said excuse me", "{name} out front, someone stop them", "{name} driving like they stole it", "{name} leading, betting slips are on fire", "{name} up top, chat cope", "{name} has the camera now"],
  shave: ["{name} was SO close to the line", "{name} kissed the firewall and lived", "HOW is {name} still alive", "the line licked {name}'s bumper", "{name} clutch", "{name} with the frame-perfect dodge", "{name} is running on vibes", "{name} heard the line breathing", "inches. {name} had inches", "my heart rate for {name} rn"],
  roundWon: ["GG {name}", "{name} takes the round, sponsored by nobody", "{name} carried", "W {name}", "{name} cooked", "{name} takes it, clip it", "{name} with the dub", "{name} didn't even look worried", "easy money for {name}"],
  wipe: ["nobody survived lmao", "the line wins again", "total wipe, refund my subscription", "everyone deleted, gg no re", "zero survivors, ratings through the roof", "the line was the real winner all along"],
  matchWon: ["{name} WINS IT ALL", "{name} is the main character now", "gg {name}, not even close", "clip that, {name} champion", "{name} is getting a sponsor after that", "bow down to {name}", "{name} retires undefeated (for now)", "{name} owns the lanes now"],
  go: ["here we go", "GO GO GO", "first", "stream lagging or is it just me", "who hacked the lanes this time", "lets gooo", "lights out", "hands on sticks chat", "popcorn ready", "no lag pls no lag pls"],
  suddenDeath: ["SUDDEN DEATH lets gooo", "the line is speedrunning now", "this is where it gets ugly", "oh it's getting tight", "line's hungry", "squeeze time", "nobody blink"],
  ambient: ["is this stream even legal", "mods asleep, post neon", "chat is this canon", "someone tell the city we're on their lanes", "my landlord is watching this too", "buffering in sector 7 again", "the view from up here goes hard", "rooftops look tiny from the lanes", "whose turn is it to pay the bandwidth bill", "pirate tv > corp tv", "my implant is buffering", "can we get a replay cam", "first time watching, why is the road made of light", "the smog is extra purple tonight", "posting from a vending machine", "chat do we know who owns these lanes"],
  ad: ["[AD] Breathe+ Premium: now 12% more oxygen", "[AD] Your rent has been updated. Swipe to accept", "[AD] Skip this ad for 4.99 cred", "[AD] Gravity Lite: falls billed per metre", "[AD] SkyLane Insurance: we cover falls up to floor 3", "[AD] Nutripaste: tastes like a memory", "[AD] Upgrade your eyes. Now with fewer ads (premium)", "[AD] Sleep is a subscription. Renew today"],
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

const MAX_STACK = 12;

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

  stack(user: string, glyph: string, now: number): boolean {
    const last = this.lines.at(-1);
    if (last?.tone !== "player" || last.user !== user) return false;
    this.lines = [...this.lines.slice(0, -1), { ...last, text: [...last.text, ...glyph].slice(-MAX_STACK).join(""), at: now }];
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
