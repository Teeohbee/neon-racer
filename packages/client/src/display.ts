import { createDisplaySettings } from "./display-settings";

export const display = createDisplaySettings(safeLocalStorage());

if (typeof document !== "undefined") {
  const sync = () => document.documentElement.classList.toggle("crt", display.get().crt);
  sync();
  display.subscribe(sync);
}

function safeLocalStorage() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
