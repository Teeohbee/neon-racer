import { audio } from "./audio";
import { display } from "./display";
import type { DisplayStore } from "./display-settings";
import { h } from "./dom";
import "./display.css";

export function createDisplayToggle(settings: DisplayStore, onClick?: () => void): { el: HTMLElement; dispose(): void } {
  const crt = h("button", { class: "display-crt", title: "Retro CRT screen" });
  crt.addEventListener("click", () => {
    settings.toggleCrt();
    onClick?.();
  });
  const fps = h("button", { class: "display-fps", title: "Frame rate readout" });
  fps.addEventListener("click", () => {
    settings.toggleFps();
    onClick?.();
  });
  const el = h("div", { class: "display-settings" }, crt, fps);

  const sync = () => {
    const { crt: crtOn, fps: fpsOn } = settings.get();
    crt.textContent = crtOn ? "CRT on" : "CRT off";
    crt.classList.toggle("on", crtOn);
    fps.textContent = fpsOn ? "FPS on" : "FPS off";
    fps.classList.toggle("on", fpsOn);
  };
  sync();
  const unsubscribe = settings.subscribe(sync);

  return {
    el,
    dispose() {
      unsubscribe();
      el.remove();
    },
  };
}

export const displaySettingsWidget = () => createDisplayToggle(display, audio.sfx.click);
