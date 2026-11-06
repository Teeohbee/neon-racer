import { defaultCarParams, type CarParams } from "@neon/sim";

const STORAGE_KEY = "neon-racer.carParams";

export function loadCarParams(): CarParams {
  const params = { ...defaultCarParams };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<Record<keyof CarParams, unknown>>;
    for (const key of Object.keys(params) as (keyof CarParams)[]) {
      const value = saved[key];
      if (typeof value === "number" && Number.isFinite(value)) params[key] = value;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return params;
}

const saveCarParams = (params: CarParams) => localStorage.setItem(STORAGE_KEY, JSON.stringify(params));

const stepFor = (value: number) => (value >= 100 ? 10 : value >= 10 ? 0.5 : 0.05);

export interface DebugPanel {
  readonly visible: boolean;
  toggle(): void;
  dispose(): void;
}

export function createDebugPanel(ui: HTMLElement, params: CarParams): DebugPanel {
  const panel = document.createElement("div");
  panel.className = "debug-panel";
  panel.hidden = true;

  const title = document.createElement("div");
  title.className = "debug-title";
  title.textContent = "car tuning";
  panel.append(title);

  const rows = (Object.keys(defaultCarParams) as (keyof CarParams)[]).map((key) => {
    const fallback = defaultCarParams[key];
    const row = document.createElement("label");
    row.className = "debug-row";
    const name = document.createElement("span");
    name.textContent = key;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(fallback * 3);
    slider.step = String(stepFor(fallback));
    const value = document.createElement("output");
    const sync = () => {
      slider.value = String(params[key]);
      value.textContent = String(+params[key].toFixed(2));
    };
    slider.addEventListener("input", () => {
      params[key] = Number(slider.value);
      value.textContent = String(+params[key].toFixed(2));
      saveCarParams(params);
    });
    slider.addEventListener("change", () => slider.blur());
    slider.addEventListener("pointerup", () => slider.blur());
    row.append(name, slider, value);
    panel.append(row);
    sync();
    return sync;
  });

  const reset = document.createElement("button");
  reset.type = "button";
  reset.textContent = "reset";
  reset.addEventListener("click", () => {
    Object.assign(params, defaultCarParams);
    localStorage.removeItem(STORAGE_KEY);
    rows.forEach((sync) => sync());
    reset.blur();
  });
  panel.append(reset);
  ui.append(panel);

  return {
    get visible() {
      return !panel.hidden;
    },
    toggle() {
      panel.hidden = !panel.hidden;
    },
    dispose() {
      panel.remove();
    },
  };
}
