type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], "style">> & { style?: string; class?: string } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") el.className = String(value);
    else if (key === "style") el.setAttribute("style", String(value));
    else (el as unknown as Record<string, unknown>)[key] = value;
  }
  for (const child of children) if (child) el.append(child);
  return el;
}
