import type { Emote } from "@neon/sim";
import { h } from "../dom";

export const EMOTE_GLYPHS: Record<Emote, string> = { fire: "🔥", lol: "😂", scream: "😱", wave: "👋" };
export const EMOTE_KEYS = ["4", "5", "6", "7"] as const;
const FLOAT_MS = 2200;
const MAX_FLOATING = 30;

export function floatEmote(root: HTMLElement, emote: Emote, name: string, color: string): void {
  const el = h("div", { class: "emote-float", style: `--x:${10 + Math.random() * 80}%;--c:${color}` }, h("span", { class: "emote-glyph" }, EMOTE_GLYPHS[emote]), h("span", { class: "emote-name" }, name));
  const floating = root.querySelectorAll(".emote-float");
  if (floating.length >= MAX_FLOATING) floating[0]!.remove();
  root.append(el);
  window.setTimeout(() => el.remove(), FLOAT_MS);
}
