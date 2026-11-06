import { h } from "./dom";
import "./online.css";

const NAME_KEY = "neon-racer:name";

export interface MenuChoice {
  kind: "practice" | "create" | "join";
  name: string;
  room?: string;
}

export function showMenu(ui: HTMLElement, onChoose: (choice: MenuChoice) => void, notice?: string): () => void {
  const params = new URLSearchParams(location.search);
  const invited = params.get("room")?.toUpperCase() ?? "";
  const name = h("input", { value: localStorage.getItem(NAME_KEY) ?? "", placeholder: "Your name", maxLength: 16 });
  const code = h("input", { value: invited, placeholder: "CODE", maxLength: 4, class: "code-input" });

  const choose = (kind: MenuChoice["kind"]) => {
    const trimmed = name.value.trim();
    if (kind !== "practice" && !trimmed) {
      name.focus();
      return;
    }
    localStorage.setItem(NAME_KEY, trimmed);
    if (kind === "join" && code.value.trim().length !== 4) {
      code.focus();
      return;
    }
    onChoose({ kind, name: trimmed || "Racer", room: code.value.trim().toUpperCase() });
  };

  const root = h(
    "div",
    { class: "online menu" },
    h(
      "div",
      { class: "online-center" },
      h(
        "div",
        { class: "panel lobby" },
        h("h1", {}, "NEON RACER"),
        notice ? h("p", { class: "problems" }, notice) : null,
        h("label", {}, "Name ", name),
        h("div", { class: "modes" }, h("button", { class: "big", onclick: () => choose("create") }, "Create room")),
        h("div", { class: "modes" }, code, h("button", { onclick: () => choose("join") }, invited ? `Join ${invited}` : "Join room")),
        h("div", { class: "modes" }, h("button", { onclick: () => choose("practice") }, "Solo practice")),
        h("p", { class: "hint" }, "Drive: WASD / arrows · Shift handbrake"),
      ),
    ),
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter") choose(invited || code.value.trim() ? "join" : "create");
  };
  root.addEventListener("keydown", onKey);
  ui.append(root);
  (invited ? name : name.value ? code : name).focus();
  return () => root.remove();
}
