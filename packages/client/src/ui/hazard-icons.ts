import type { HazardKind } from "@neon/sim";

const PATHS: Record<HazardKind, string> = {
  block: '<rect x="4" y="9" width="24" height="14" rx="2" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="2.5"/><path d="M9 9l-5 7M17 9l-9 14M25 9l-9 14M28 14l-6 9" stroke="currentColor" stroke-width="2.5"/>',
  slow: '<circle cx="16" cy="16" r="4" fill="currentColor"/><circle cx="16" cy="16" r="9" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4 3"/><circle cx="16" cy="16" r="14" stroke="currentColor" stroke-width="2" stroke-opacity="0.6" stroke-dasharray="3 4"/>',
  freeze: '<path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13M12 5l4 4 4-4M12 27l4-4 4 4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function hazardIcon(kind: HazardKind): SVGSVGElement {
  const wrap = document.createElement("span");
  wrap.innerHTML = `<svg class="hz-icon" viewBox="0 0 32 32" fill="none" aria-hidden="true">${PATHS[kind]}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}
