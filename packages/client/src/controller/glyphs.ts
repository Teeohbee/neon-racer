import { h } from "../dom";
import "./glyphs.css";

/**
 * Button glyphs drawn to match the Steam Deck's face. Local play always shows these because Steam
 * Input hands the game a generic Xbox-layout pad, so the real controller can't be detected.
 */

export const GLYPH_NAMES = [
  "a",
  "b",
  "x",
  "y",
  "leftBumper",
  "rightBumper",
  "leftTrigger",
  "rightTrigger",
  "start",
  "select",
  "leftStick",
  "dpad",
  "dpadUp",
  "dpadDown",
  "dpadLeft",
  "dpadRight",
] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];

const LABELS: Record<GlyphName, string> = {
  a: "A",
  b: "B",
  x: "X",
  y: "Y",
  leftBumper: "L1",
  rightBumper: "R1",
  leftTrigger: "L2",
  rightTrigger: "R2",
  start: "Menu",
  select: "View",
  leftStick: "Left stick",
  dpad: "D-pad",
  dpadUp: "D-pad up",
  dpadDown: "D-pad down",
  dpadLeft: "D-pad left",
  dpadRight: "D-pad right",
};

const BODY = "#2a2d36";
const EDGE = "#596070";
const INK = "#f2f4f8";
const LIT = "#ffffff";

const svg = (name: GlyphName, width: number, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 32" width="${width}" height="32" role="img" aria-label="${LABELS[name]}">${inner}</svg>`;

const text = (x: number, label: string, size = 15) =>
  `<text x="${x}" y="16.5" fill="${INK}" font-family="system-ui, sans-serif" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${label}</text>`;

const face = (name: GlyphName, letter: string) => svg(name, 32, `<circle cx="16" cy="16" r="14" fill="${BODY}" stroke="${EDGE}" stroke-width="2"/>${text(16, letter, 16)}`);

const shoulder = (name: GlyphName, label: string, trigger: boolean) =>
  svg(name, 40, `<rect x="2" y="${trigger ? 3 : 7}" width="36" height="${trigger ? 26 : 18}" rx="${trigger ? 8 : 9}" fill="${BODY}" stroke="${EDGE}" stroke-width="2"/>${text(20, label, 13)}`);

const roundButton = (name: GlyphName, icon: string) => svg(name, 32, `<circle cx="16" cy="16" r="14" fill="${BODY}" stroke="${EDGE}" stroke-width="2"/>${icon}`);

const MENU_ICON = `<path d="M10 11h12M10 16h12M10 21h12" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
const VIEW_ICON = `<rect x="9" y="9" width="10" height="9" rx="1.5" fill="none" stroke="${INK}" stroke-width="2"/><rect x="13" y="14" width="10" height="9" rx="1.5" fill="${BODY}" stroke="${INK}" stroke-width="2"/>`;
const STICK_ICON = `<circle cx="16" cy="16" r="8" fill="none" stroke="${INK}" stroke-width="2"/><text x="16" y="16.5" fill="${INK}" font-family="system-ui, sans-serif" font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle">L</text>`;

type Arm = "up" | "down" | "left" | "right";
const ARMS: Record<Arm, string> = {
  up: "M13.5 4h5v8h-5z",
  down: "M13.5 20h5v8h-5z",
  left: "M4 13.5h8v5h-8z",
  right: "M20 13.5h8v5h-8z",
};

const dpad = (name: GlyphName, lit: Arm | null) =>
  svg(
    name,
    32,
    `<path d="M12 2h8v10h10v8h-10v10h-8v-10h-10v-8h10z" fill="${BODY}" stroke="${EDGE}" stroke-width="2" stroke-linejoin="round"/>` +
      (lit ? `<path d="${ARMS[lit]}" fill="${LIT}"/>` : ""),
  );

export function glyphSvg(name: GlyphName): string {
  switch (name) {
    case "a":
    case "b":
    case "x":
    case "y":
      return face(name, LABELS[name]);
    case "leftBumper":
    case "rightBumper":
      return shoulder(name, LABELS[name], false);
    case "leftTrigger":
    case "rightTrigger":
      return shoulder(name, LABELS[name], true);
    case "start":
      return roundButton(name, MENU_ICON);
    case "select":
      return roundButton(name, VIEW_ICON);
    case "leftStick":
      return roundButton(name, STICK_ICON);
    case "dpad":
      return dpad(name, null);
    case "dpadUp":
      return dpad(name, "up");
    case "dpadDown":
      return dpad(name, "down");
    case "dpadLeft":
      return dpad(name, "left");
    case "dpadRight":
      return dpad(name, "right");
  }
}

export const glyphLabel = (name: GlyphName): string => LABELS[name];

export function glyph(name: GlyphName): HTMLElement {
  const el = h("span", { class: "pad-glyph" });
  el.innerHTML = glyphSvg(name);
  return el;
}

/** A button glyph followed by what it does, e.g. "(A) Join". */
export function padPrompt(name: GlyphName, action: string): HTMLElement {
  return h("span", { class: "pad-prompt" }, glyph(name), h("span", { class: "pad-prompt-action" }, action));
}
