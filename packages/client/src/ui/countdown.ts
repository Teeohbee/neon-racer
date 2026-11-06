import { h } from "../dom";
import "./countdown.css";

export function countdownLabel(remaining: number): string {
  const n = Math.ceil(remaining);
  return n > 0 ? String(n) : "GO";
}

export function createCountdown(parent: HTMLElement) {
  const el = h("div", { class: "neon-countdown" });
  parent.append(el);
  let shown: string | null = null;

  return {
    show(label: string | null) {
      if (label === shown) return;
      shown = label;
      el.replaceChildren(label === null ? "" : h("span", { class: label === "GO" ? "go" : "num" }, label));
    },
  };
}
