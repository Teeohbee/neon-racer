import { h } from "../dom";
import { dismissDialogs } from "./notice";
import { SWAP_AT, TEAR_MS, tearBands } from "./tear";
import "../ui/transition.css";

let queue: Promise<void> = Promise.resolve();

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export function glitchSwap(swap: () => void): Promise<void> {
  queue = queue.then(() => tear(swap)).catch((err) => console.warn("screen transition failed", err));
  return queue;
}

async function tear(swap: () => void) {
  dismissDialogs();
  if (reducedMotion()) {
    swap();
    return;
  }
  const overlay = h(
    "div",
    { class: "nr-tear", style: `--tear-ms:${TEAR_MS}ms` },
    h("div", { class: "nr-tear-flash" }),
    ...tearBands(Math.random).map((b) =>
      h("div", { class: "nr-tear-band", style: `top:${b.top}%; height:${b.height}%; --shift:${b.shift}px; animation-delay:${b.delay * TEAR_MS}ms` }),
    ),
  );
  const ui = document.getElementById("ui");
  document.body.append(overlay);
  ui?.classList.add("nr-tearing");
  try {
    await wait(TEAR_MS * SWAP_AT);
    swap();
    await wait(TEAR_MS * (1 - SWAP_AT));
  } finally {
    overlay.remove();
    ui?.classList.remove("nr-tearing");
  }
}
