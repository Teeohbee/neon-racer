export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function formatScore(score: number): string {
  if (Number.isInteger(score)) return String(score);
  return `${Math.floor(score) || ""}½`;
}
