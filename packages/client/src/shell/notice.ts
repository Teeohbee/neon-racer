import { audio } from "../audio";
import { h } from "../dom";
import "../ui/notice.css";

const TOAST_MS = 2600;
const LEAVE_MS = 220;

export type Tone = "info" | "error";

export interface DialogAction<T> {
  label: string;
  value: T;
  primary?: boolean;
}

export interface DialogOptions<T> {
  title: string;
  body?: string;
  tone?: Tone;
  actions: DialogAction<T>[];
  cancel: T;
}

const open = new Set<() => void>();

function host(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(".nr-notices");
  if (existing) return existing;
  const el = h("div", { class: "nr-notices" });
  (document.getElementById("ui") ?? document.body).append(el);
  return el;
}

export function notify(text: string, tone: Tone = "info", ms = TOAST_MS): void {
  const el = h("div", { class: `nr-toast ${tone}`, role: "status" }, text);
  host().append(el);
  window.setTimeout(() => {
    el.classList.add("leaving");
    window.setTimeout(() => el.remove(), LEAVE_MS);
  }, ms);
}

export function dialog<T>(opts: DialogOptions<T>): Promise<T> {
  return new Promise((resolve) => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const buttons = opts.actions.map((a) => h("button", { class: a.primary ? "nr-btn primary" : "nr-btn", onclick: () => close(a.value, a.primary) }, a.label));
    const card = h(
      "div",
      { class: `nr-dialog nr-panel ${opts.tone ?? "info"}`, role: "dialog", ariaModal: "true", ariaLabel: opts.title },
      h("h2", {}, opts.title),
      opts.body ? h("p", {}, opts.body) : null,
      h("div", { class: "nr-dialog-actions" }, ...buttons),
    );
    const layer = h("div", { class: "nr-dialog-layer" }, card);

    const close = (value: T, confirmed = false) => {
      if (!open.delete(dismiss)) return;
      (confirmed ? audio.sfx.confirm : audio.sfx.click)();
      layer.remove();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      resolve(value);
    };
    const dismiss = () => close(opts.cancel);

    layer.addEventListener("keydown", (e) => {
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey);
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "Tab";
      if (e.key !== "Escape" && !back && !forward) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") return dismiss();
      buttons[(at + (back ? -1 : 1) + buttons.length) % buttons.length]!.focus();
      audio.sfx.hover();
    });
    layer.addEventListener("pointerdown", (e) => {
      if (e.target === layer) dismiss();
    });

    open.add(dismiss);
    host().append(layer);
    (buttons.find((_, i) => opts.actions[i]!.primary) ?? buttons[0])?.focus();
  });
}

export function dismissDialogs(): void {
  for (const dismiss of [...open]) dismiss();
}
