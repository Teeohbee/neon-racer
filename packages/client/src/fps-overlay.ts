import { display } from "./display";
import { h } from "./dom";
import { createFpsMeter } from "./fps-meter";

export function bindFpsOverlay(parent: HTMLElement): void {
  const el = h("div", { class: "fps-readout", ariaHidden: "true" });
  let meter = createFpsMeter();
  let frame = 0;

  const tick = (now: number) => {
    const sample = meter.frame(now);
    if (sample) {
      el.textContent = `${sample.fps} fps · ${sample.worstMs} ms worst`;
      el.classList.toggle("slow", sample.fps < 50 || sample.worstMs > 50);
    }
    frame = requestAnimationFrame(tick);
  };

  const sync = () => {
    cancelAnimationFrame(frame);
    if (!display.get().fps) return el.remove();
    meter = createFpsMeter();
    el.textContent = "… fps";
    parent.append(el);
    frame = requestAnimationFrame(tick);
  };
  sync();
  display.subscribe(sync);
}
