import { h } from "../dom";
import { isTyping } from "../input";
import type { SettingsStore } from "./settings";
import "./widget.css";

export function createAudioSettings(settings: SettingsStore, onClick?: () => void): { el: HTMLElement; dispose(): void } {
  const slider = (label: string, key: "music" | "sfx") => {
    const input = h("input", { type: "range", min: "0", max: "100", step: "1", title: `${label} volume` });
    input.addEventListener("input", () => settings.set({ [key]: Number(input.value) / 100 }));
    return { input, el: h("label", { class: "audio-slider" }, h("span", {}, label), input) };
  };
  const music = slider("Music", "music");
  const sfx = slider("SFX", "sfx");
  const label = h("span", { class: "audio-label" });
  const mute = h("button", { class: "audio-mute", title: "Mute (M)" }, h("span", { class: "audio-icon" }, "♪"), label);
  mute.addEventListener("click", () => {
    settings.toggleMute();
    onClick?.();
  });
  const el = h("div", { class: "audio-settings" }, mute, h("div", { class: "audio-sliders" }, music.el, sfx.el));

  const sync = () => {
    const s = settings.get();
    music.input.value = String(Math.round(s.music * 100));
    sfx.input.value = String(Math.round(s.sfx * 100));
    label.textContent = s.muted ? "Sound off" : "Sound on";
    mute.classList.toggle("on", !s.muted);
    el.classList.toggle("muted", s.muted);
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

export function bindMuteKey(settings: SettingsStore, target: Window = window): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== "KeyM" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    settings.toggleMute();
  };
  target.addEventListener("keydown", onKey);
  return () => target.removeEventListener("keydown", onKey);
}
