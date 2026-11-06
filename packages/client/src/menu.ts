import { audio, audioSettingsWidget } from "./audio";
import { displaySettingsWidget } from "./display-widget";
import { h } from "./dom";
import { createKeyNav } from "./shell/keynav";
import { dialog, notify } from "./shell/notice";
import { bindHoverSound } from "./shell/ui-sounds";
import "./online.css";
import "./ui/menu.css";

const NAME_KEY = "neon-racer:name";

export interface MenuChoice {
  kind: "practice" | "create" | "join";
  name: string;
  room?: string;
}

const logo = (word: string, cls: string, offset: number) =>
  h("span", { class: `title-word ${cls}` }, ...[...word].map((ch, i) => h("span", { class: "title-letter", style: `--i:${offset + i}` }, ch)));

export function showMenu(ui: HTMLElement, onChoose: (choice: MenuChoice) => void, notice?: string): () => void {
  const params = new URLSearchParams(location.search);
  const invited = params.get("room")?.toUpperCase() ?? "";
  const settings = audioSettingsWidget();
  const displaySettings = displaySettingsWidget();
  const name = h("input", { value: localStorage.getItem(NAME_KEY) ?? "", placeholder: "Your name", maxLength: 16, ariaLabel: "Your name" });
  const code = h("input", { value: invited, placeholder: "CODE", maxLength: 4, class: "code-input", ariaLabel: "Room code" });

  const choose = (kind: MenuChoice["kind"]) => {
    const trimmed = name.value.trim();
    if (kind !== "practice" && !trimmed) {
      notify("Pick a name first", "error");
      name.focus();
      return;
    }
    localStorage.setItem(NAME_KEY, trimmed);
    if (kind === "join" && code.value.trim().length !== 4) {
      notify("Room codes are 4 letters", "error");
      code.focus();
      return;
    }
    audio.sfx.confirm();
    onChoose({ kind, name: trimmed || "Racer", room: code.value.trim().toUpperCase() });
  };

  const root = h(
    "div",
    { class: "online menu title-screen" },
    h("h1", { class: "title-logo", ariaLabel: "Neon Racer" }, logo("NEON", "neon", 0), logo("RACER", "racer", 4)),
    h(
      "div",
      { class: "panel title-panel" },
      h("label", { class: "title-field" }, h("span", { class: "nr-label" }, "Racer"), name),
      h("button", { class: "big", onclick: () => choose("create") }, "Create room"),
      h("div", { class: "title-join" }, code, h("button", { onclick: () => choose("join") }, invited ? `Join ${invited}` : "Join room")),
      h("button", { class: "title-practice", onclick: () => choose("practice") }, "Solo practice"),
      h("p", { class: "nr-hint title-keys" }, "↑↓ select · Enter go · M mute"),
      h("div", { class: "menu-audio" }, settings.el, displaySettings.el),
    ),
    h("p", { class: "nr-hint title-drive" }, "Drive: WASD / arrows · Shift handbrake"),
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target.type !== "range") choose(invited || code.value.trim() ? "join" : "create");
  };
  root.addEventListener("keydown", onKey);
  const unbindNav = createKeyNav(root, { onMove: audio.sfx.hover });
  const unbindHover = bindHoverSound(root, audio.sfx.hover);
  ui.append(root);
  (invited ? name : name.value ? code : name).focus();
  if (notice) void dialog({ title: "Signal lost", body: notice, tone: "error", actions: [{ label: "OK", value: undefined, primary: true }], cancel: undefined });
  return () => {
    unbindNav();
    unbindHover();
    settings.dispose();
    displaySettings.dispose();
    root.remove();
  };
}
