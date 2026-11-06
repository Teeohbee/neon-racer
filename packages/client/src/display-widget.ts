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
  const el = h("div", { class: "display-settings" }, crt);

  const sync = () => {
    const on = settings.get().crt;
    crt.textContent = on ? "CRT on" : "CRT off";
    crt.classList.toggle("on", on);
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
