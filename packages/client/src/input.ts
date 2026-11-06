import type { CarInput } from "@neon/sim";

type Action = keyof CarInput;

const BINDINGS: Record<string, Action> = {
  KeyW: "throttle",
  ArrowUp: "throttle",
  KeyS: "brake",
  ArrowDown: "brake",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  ShiftLeft: "handbrake",
  ShiftRight: "handbrake",
};

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
}

export function createKeyboard(): { read(): CarInput; dispose(): void } {
  const held = new Set<string>();

  const onDown = (e: KeyboardEvent) => {
    if (isTyping(e.target) || !(e.code in BINDINGS)) return;
    e.preventDefault();
    held.add(e.code);
  };
  const onUp = (e: KeyboardEvent) => {
    if (!(e.code in BINDINGS)) return;
    held.delete(e.code);
  };
  const onBlur = () => held.clear();

  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);

  return {
    read() {
      const input: CarInput = { throttle: false, brake: false, left: false, right: false, handbrake: false };
      for (const code of held) input[BINDINGS[code]!] = true;
      return input;
    },
    dispose() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      held.clear();
    },
  };
}
