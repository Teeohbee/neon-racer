import { nearestOnTrack, SUDDEN_DEATH_AT, type GameEvent, type Phase, type Track } from "@neon/sim";
import { h } from "../dom";
import type { CarView } from "../render/types";
import { ChatFeed, chatLine, isUrgent, mergeKills, type ChatLine, type StreamEvent } from "./chat-lines";
import { RaceWatch, signedGap } from "./race-watch";
import { hash01, seedFrom } from "./stream-seed";
import { createViewerModel, formatClock, formatViewers, type Hype } from "./viewers";
import "./stream-hud.css";

const STREAMING = new Set<Phase>(["countdown", "race", "roundEnd"]);
const ALERT_MS = 4500;
const READOUT_MS = 500;
const AMBIENT_SLOT = 18;
const AMBIENT_CHANCE = 0.6;
const WATCH_FROM = 3;
const REC_SPAN = 5400;
const LOW_BITRATE = 3;

export interface StreamFrame {
  cars: CarView[];
  line: number | null;
}

export function createStreamHud(root: HTMLElement, top: HTMLElement, nameOf: (id: string | null) => string) {
  const viewers = h("b");
  const badge = h("div", { class: "stream-badge" }, h("span", { class: "stream-live" }, h("i"), "LIVE"), h("span", { class: "stream-viewers" }, viewers, " watching"));
  const channel = h("span");
  const clock = h("span");
  const bitrate = h("span", { class: "stream-bitrate" });
  const chrome = h("div", { class: "stream-chrome" }, h("div", { class: "stream-mark" }, "NEON", h("b", {}, "//"), "PIRATE.TV", channel), h("div", { class: "stream-rec" }, h("i"), "REC ", clock, " · ", bitrate));
  const chat = h("div", { class: "stream-chat" });
  const alert = h("div", { class: "stream-alert" });
  top.prepend(badge);
  root.append(chat, chrome, alert);

  let seed = 0;
  let model = createViewerModel(seed);
  const feed = new ChatFeed();
  const watch = new RaceWatch();
  const counts = new Map<StreamEvent["kind"], number>();
  const rendered = new Map<number, HTMLElement>();
  let pending: StreamEvent[] = [];
  let phase: Phase | null = null;
  let suddenSaid = false;
  let lastReadout = 0;
  let alertTimer = 0;
  const startedAt = performance.now();
  const wall = () => Date.now() / 1000;
  let ambientSlot = Math.floor(wall() / AMBIENT_SLOT);

  const say = (event: StreamEvent) => {
    const n = counts.get(event.kind) ?? 0;
    counts.set(event.kind, n + 1);
    if (feed.post(chatLine(event, seed, event.kind === "ambient" ? ambientSlot : n), isUrgent(event), wall())) drawChat();
  };
  const hype = (kind: Hype) => model.spike(kind, wall());

  function drawChat() {
    const live = new Set(feed.lines.map((l) => l.id));
    for (const id of rendered.keys()) if (!live.has(id)) rendered.delete(id);
    chat.replaceChildren(...feed.lines.map((l) => rendered.get(l.id) ?? rendered.set(l.id, chatRow(l)).get(l.id)!));
  }

  function readouts() {
    const t = wall();
    const rate = model.bitrate(t);
    viewers.textContent = formatViewers(model.count(t));
    bitrate.textContent = `${rate.toFixed(1)} Mbps`;
    clock.textContent = formatClock(hash01(seed, 7) * REC_SPAN + (performance.now() - startedAt) / 1000);
    badge.classList.toggle("hot", rate < LOW_BITRATE);
    bitrate.classList.toggle("dip", rate < LOW_BITRATE);
  }

  function watchRace(track: Track, frame: StreamFrame) {
    if (frame.line === null) return;
    const line = frame.line;
    const alive = frame.cars.filter((c) => c.alive);
    const racers = alive.map((c) => ({ id: c.id, gap: signedGap(c.s ?? nearestOnTrack(track, c.x, c.y).s, line, track.length) }));
    for (const e of watch.update(racers, wall())) {
      hype(e.kind);
      say({ kind: e.kind, name: alive.find((c) => c.id === e.id)?.name || nameOf(e.id) });
    }
  }

  return {
    phase(next: Phase, code: string) {
      if (seedFrom(code) !== seed) {
        seed = seedFrom(code);
        model = createViewerModel(seed);
        channel.textContent = `/${code}`;
      }
      root.classList.toggle("streaming", STREAMING.has(next));
      // Chat carries on from one round to the next, like a stream that never cut; only the race watch starts over.
      if (next === "countdown") {
        watch.reset();
        suddenSaid = false;
      }
      if (next === "race" && phase !== "race") say({ kind: "go" });
      if (!STREAMING.has(next)) {
        feed.clear();
        pending = [];
        drawChat();
      }
      phase = next;
    },
    event(event: GameEvent) {
      switch (event.kind) {
        case "eliminated":
          pending.push({ kind: "eliminated", name: nameOf(event.id), reason: event.reason });
          break;
        case "hazardKill":
          pending.push({ kind: "hazardKill", by: nameOf(event.by), victim: nameOf(event.victim) });
          break;
        case "roundWon":
          pending.push({ kind: "roundWon", name: event.id && nameOf(event.id) });
          break;
        case "matchWon":
          pending.push({ kind: "matchWon", name: nameOf(event.id) });
          break;
        default:
          return;
      }
      hype(event.kind);
    },
    emote(name: string, color: string, glyph: string) {
      if (feed.stack(name, glyph, wall()) || feed.post({ user: name, color, text: glyph, tone: "player" }, true, wall())) {
        rendered.clear();
        drawChat();
      }
    },
    alert(text: string) {
      alert.textContent = text;
      alert.classList.remove("show");
      void alert.offsetWidth;
      alert.classList.add("show");
      clearTimeout(alertTimer);
      alertTimer = window.setTimeout(() => alert.classList.remove("show"), ALERT_MS);
    },
    dismissAlert() {
      clearTimeout(alertTimer);
      alert.classList.remove("show");
    },
    update(track: Track | null, frame: StreamFrame | null, now: number) {
      if (!phase || !STREAMING.has(phase)) return;
      if (pending.length) {
        const batch = mergeKills(pending);
        pending = [];
        for (const e of batch) say(e);
      }
      if (phase === "race" && track && frame && now > WATCH_FROM) watchRace(track, frame);
      if (phase === "race" && now > SUDDEN_DEATH_AT && !suddenSaid) {
        suddenSaid = true;
        say({ kind: "suddenDeath" });
      }
      const slot = Math.floor(wall() / AMBIENT_SLOT);
      if (slot !== ambientSlot) {
        ambientSlot = slot;
        if (hash01(seed, 8, slot) < AMBIENT_CHANCE) say({ kind: "ambient" });
      }
      if (feed.expire(wall())) drawChat();
      if (performance.now() - lastReadout >= READOUT_MS) {
        lastReadout = performance.now();
        readouts();
      }
    },
    dispose() {
      clearTimeout(alertTimer);
      root.classList.remove("streaming");
      badge.remove();
      chat.remove();
      chrome.remove();
      alert.remove();
    },
  };
}

function chatRow(line: ChatLine): HTMLElement {
  return h("div", { class: `chat-line ${line.tone}` }, h("span", { class: "chat-user", style: `--u:${line.color}` }, line.user), " ", line.text);
}
