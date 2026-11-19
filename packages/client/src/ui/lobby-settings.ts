import { buildTrack, CUP_LEGS, LAP_COUNTS, PRESET_TRACKS, SCORE_TARGETS, TARGET_SCORE, type CupLegs, type Track, type WinCondition } from "@neon/sim";
import { h } from "../dom";
import { drawTrackShape } from "../minimap";

/** The Host's match settings in a lobby, shared by Online play and Local play. */

const DEFAULT_LAPS = 3;
const THUMB = { width: 84, height: 50, pad: 200 };

export function winPicker(win: WinCondition, isHost: boolean, pick: (next: WinCondition) => void): HTMLElement {
  const values: WinCondition[] = win.kind === "laps" ? LAP_COUNTS.map((laps) => ({ kind: "laps", laps })) : SCORE_TARGETS.map((target) => ({ kind: "score", target }));
  return h(
    "div",
    { class: "modes" },
    "Win: ",
    h(
      "span",
      { class: "seg" },
      h("button", { class: win.kind === "laps" ? "on" : "", disabled: !isHost, onclick: () => pick({ kind: "laps", laps: DEFAULT_LAPS }) }, "Laps"),
      h("button", { class: win.kind === "score" ? "on" : "", disabled: !isHost, onclick: () => pick({ kind: "score", target: TARGET_SCORE }) }, "Points"),
    ),
    h(
      "span",
      { class: "seg" },
      ...values.map((v) => {
        const n = v.kind === "laps" ? v.laps : v.target;
        const on = win.kind === "laps" ? win.laps === n : win.target === n;
        return h("button", { class: on ? "on" : "", disabled: !isHost, onclick: () => pick(v) }, String(n));
      }),
    ),
    h("span", { class: "hint" }, win.kind === "laps" ? "laps per track" : "points per track"),
  );
}

export function cupPicker(cup: CupLegs, isHost: boolean, pick: (legs: CupLegs) => void): HTMLElement {
  return h(
    "div",
    { class: "modes" },
    "Cup: ",
    h("span", { class: "seg" }, ...CUP_LEGS.map((legs) => h("button", { class: cup === legs ? "on" : "", disabled: !isHost, onclick: () => pick(legs) }, legs ? `${legs} tracks` : "Off"))),
    h("span", { class: "hint" }, cup ? "points carry across tracks" : "one track per match"),
  );
}

export function trackPicker(selected: string[], isHost: boolean, thumbs: Map<string, HTMLCanvasElement>, choose: (names: string[]) => void): HTMLElement {
  const pick = (names: string[]) => {
    if (names.length) choose(names);
  };
  const toggle = (name: string) => pick(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  return h(
    "div",
    { class: "track-picker" },
    h(
      "div",
      { class: "modes" },
      `Tracks (${selected.length}/${PRESET_TRACKS.length})`,
      isHost ? h("button", { disabled: selected.length === PRESET_TRACKS.length, onclick: () => pick(PRESET_TRACKS.map((t) => t.name)) }, "All") : null,
    ),
    h(
      "div",
      { class: "track-grid" },
      ...PRESET_TRACKS.map((t) =>
        h("button", { class: `track-card${selected.includes(t.name) ? " on" : ""}`, disabled: !isHost, title: t.name, onclick: () => toggle(t.name) }, thumbs.get(t.name)!, h("span", {}, t.name)),
      ),
    ),
  );
}

export function trackThumbs(): Map<string, HTMLCanvasElement> {
  return new Map(PRESET_TRACKS.map((t) => [t.name, trackThumb(buildTrack(t.points, t.features))]));
}

function trackThumb(track: Track): HTMLCanvasElement {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const canvas = h("canvas", { width: THUMB.width * dpr, height: THUMB.height * dpr });
  canvas.style.width = `${THUMB.width}px`;
  canvas.style.height = `${THUMB.height}px`;
  const ctx = canvas.getContext("2d")!;
  const [minX, maxX, minY, maxY] = [Math.min(...track.xs), Math.max(...track.xs), Math.min(...track.ys), Math.max(...track.ys)];
  const scale = Math.min(THUMB.width / (maxX - minX + THUMB.pad * 2), THUMB.height / (maxY - minY + THUMB.pad * 2));
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (THUMB.width / 2 - ((minX + maxX) / 2) * scale), dpr * (THUMB.height / 2 - ((minY + maxY) / 2) * scale));
  drawTrackShape(ctx, track, scale);
  return canvas;
}
