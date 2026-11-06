import { navDir, nextFocus } from "./focus-order";

const FOCUSABLE = "button:not(:disabled), input:not(:disabled)";

export interface KeyNavOptions {
  enabled?: () => boolean;
  onBack?: () => void;
  onMove?: () => void;
}

const visible = (el: HTMLElement) => el.getClientRects().length > 0;
const keyOf = (el: Element) => `${el.tagName}|${el.className}|${el.textContent}`;

export function createKeyNav(root: HTMLElement, opts: KeyNavOptions = {}): () => void {
  let last: { key: string; index: number } | null = null;

  const items = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(visible);
  const owns = (el: Element | null) => !el || el === document.body || root.contains(el);

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !root.isConnected || !(opts.enabled?.() ?? true)) return;
    const active = document.activeElement;
    if (!owns(active)) return;
    if (e.key === "Escape") {
      if (!opts.onBack) return;
      e.preventDefault();
      opts.onBack();
      return;
    }
    const dir = navDir(e.key);
    if (!dir) return;
    if (active instanceof HTMLInputElement && (dir === "left" || dir === "right")) return;
    const list = items();
    const next = list[nextFocus(list.map(box), list.indexOf(active as HTMLElement), dir)];
    e.preventDefault();
    if (!next || next === active) return;
    next.focus();
    opts.onMove?.();
  };

  const onFocusIn = (e: FocusEvent) => {
    if (!(e.target instanceof HTMLElement)) return;
    last = { key: keyOf(e.target), index: items().indexOf(e.target) };
  };
  const onFocusOut = (e: FocusEvent) => {
    if (e.relatedTarget instanceof Node && !root.contains(e.relatedTarget)) last = null;
  };
  const onPointerDown = (e: PointerEvent) => {
    if (!(e.target instanceof Node) || !root.contains(e.target)) last = null;
  };
  const restore = new MutationObserver(() => {
    const active = document.activeElement;
    if (!last || (active && active !== document.body) || !(opts.enabled?.() ?? true)) return;
    const list = items();
    const match = list.find((el) => keyOf(el) === last!.key) ?? list[Math.min(last.index, list.length - 1)];
    match?.focus({ preventScroll: true });
  });

  window.addEventListener("keydown", onKey);
  window.addEventListener("pointerdown", onPointerDown, true);
  root.addEventListener("focusin", onFocusIn);
  root.addEventListener("focusout", onFocusOut);
  restore.observe(root, { childList: true, subtree: true });
  return () => {
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("pointerdown", onPointerDown, true);
    root.removeEventListener("focusin", onFocusIn);
    root.removeEventListener("focusout", onFocusOut);
    restore.disconnect();
  };
}

function box(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
