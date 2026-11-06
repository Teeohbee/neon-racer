export const DANGER_RANGE = 700;

export function dangerLevel(gap: number | null, range = DANGER_RANGE): number {
  if (gap === null || !Number.isFinite(gap)) return 0;
  const v = Math.min(1, Math.max(0, 1 - gap / range));
  return v * v;
}
