export function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function hash01(seed: number, ...parts: number[]): number {
  let h = seed >>> 0;
  for (const p of parts) {
    h = Math.imul(h ^ (p >>> 0), 0x9e3779b1);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pick<T>(items: readonly T[], seed: number, ...parts: number[]): T {
  return items[Math.floor(hash01(seed, ...parts) * items.length)]!;
}
