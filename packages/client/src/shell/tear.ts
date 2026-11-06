export const TEAR_MS = 420;
export const SWAP_AT = 0.4;
const BANDS = 7;
const MAX_SHIFT = 14;

export interface TearBand {
  top: number;
  height: number;
  shift: number;
  delay: number;
}

export function tearBands(rand: () => number, count = BANDS): TearBand[] {
  const slot = 100 / count;
  return Array.from({ length: count }, (_, i) => {
    const height = slot * (0.3 + rand() * 0.6);
    return {
      top: i * slot + rand() * (slot - height),
      height,
      shift: (rand() < 0.5 ? -1 : 1) * MAX_SHIFT * (0.3 + rand() * 0.7),
      delay: rand() * SWAP_AT * 0.5,
    };
  });
}
