const HOVER_GAP_MS = 45;

export function bindHoverSound(root: HTMLElement, play: () => void, enabled: () => boolean = () => true): () => void {
  let current: Element | null = null;
  let lastAt = 0;
  const onOver = (e: PointerEvent) => {
    const target = e.target instanceof Element ? e.target.closest("button:not(:disabled)") : null;
    if (target === current) return;
    current = target;
    const now = performance.now();
    if (!target || !enabled() || now - lastAt < HOVER_GAP_MS) return;
    lastAt = now;
    play();
  };
  const onLeave = () => {
    current = null;
  };
  root.addEventListener("pointerover", onOver);
  root.addEventListener("pointerleave", onLeave);
  return () => {
    root.removeEventListener("pointerover", onOver);
    root.removeEventListener("pointerleave", onLeave);
  };
}
