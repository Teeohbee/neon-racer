import { h } from "../dom";
import "./selector.css";

/**
 * A controller-first setting: one row, `Label  ‹ value ›`. Up and down move between rows like any
 * button; left and right change the value; A, Enter or a click on the row steps forward; the mouse
 * can click either arrow. Handling the arrow keys here marks them handled, so keynav leaves them be.
 */

export interface SelectorOptions<T> {
  label: string;
  options: readonly T[];
  value: T;
  /** Text or a node to show for a value; the text is what screen readers hear. */
  format?: (value: T) => string | Node;
  /** Wrap round the ends (default), or stop at them, as a count should. */
  wrap?: boolean;
  disabled?: boolean;
  onChange: (value: T) => void;
}

export function stepOption<T>(options: readonly T[], current: T, delta: 1 | -1, opts: { wrap?: boolean } = {}): T {
  const at = options.indexOf(current);
  if (at < 0) return options[0]!;
  const next = at + delta;
  if (opts.wrap === false) return options[Math.max(0, Math.min(options.length - 1, next))]!;
  return options[(next + options.length) % options.length]!;
}

export function selector<T>(o: SelectorOptions<T>): HTMLButtonElement {
  const wrap = o.wrap ?? true;
  const fixed = o.disabled || o.options.length < 2;
  const at = o.options.indexOf(o.value);
  const step = (delta: 1 | -1) => {
    const next = stepOption(o.options, o.value, delta, { wrap });
    if (next !== o.value) o.onChange(next);
  };
  const arrow = (delta: 1 | -1) => {
    const end = !wrap && (delta < 0 ? at <= 0 : at >= o.options.length - 1);
    return h(
      "span",
      {
        class: `selector-arrow${end || fixed ? " end" : ""}`,
        onclick: (e: MouseEvent) => {
          e.stopPropagation();
          if (!fixed) step(delta);
        },
      },
      delta < 0 ? "‹" : "›",
    );
  };
  const shown = (o.format ?? String)(o.value);
  const value = h("span", { class: "selector-value" }, shown);
  const row = h(
    "button",
    { class: "selector", disabled: fixed, onclick: () => step(1) },
    h("span", { class: "selector-label" }, o.label),
    h("span", { class: "selector-choice" }, arrow(-1), value, arrow(1)),
  );
  row.setAttribute("aria-label", `${o.label}: ${value.textContent}`);
  row.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(e.key === "ArrowLeft" ? -1 : 1);
  });
  return row;
}
