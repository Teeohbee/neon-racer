import type { Point } from "./track";

export interface PresetTrack {
  name: string;
  points: Point[];
}

const polar = (fn: (t: number) => number, rx: number, ry: number, n = 120): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = fn(t);
    return [3200 + Math.cos(t) * rx * r, 2000 + Math.sin(t) * ry * r];
  });

const spline = (points: Point[], samples = 16): Point[] =>
  points.flatMap((_, i) => {
    const at = (k: number) => points[(i + k + points.length) % points.length]!;
    const [p0, p1, p2, p3] = [at(-1), at(0), at(1), at(2)];
    return Array.from({ length: samples }, (_, j) => {
      const t = j / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])] as Point;
    });
  });

const RAW_TRACKS: PresetTrack[] = [
  {
    name: "Kidney Bean",
    points: [[1000, 1200], [2500, 600], [4200, 700], [5500, 1300], [5600, 2600], [4800, 3400], [3700, 3200], [3200, 2600], [2700, 3200], [1400, 3400], [700, 2500]],
  },
  {
    name: "Serpent",
    points: [[600, 800], [1400, 500], [2200, 1100], [3000, 500], [3800, 1100], [4600, 500], [5600, 800], [5800, 2000], [5600, 3300], [4600, 3500], [3800, 2900], [3000, 3500], [2200, 2900], [1400, 3500], [600, 3200], [500, 2000]],
  },
  {
    name: "Paperclip",
    points: [[900, 700], [3200, 700], [5400, 700], [5850, 1100], [5400, 1500], [3700, 1500], [2200, 1500], [1800, 1950], [2200, 2400], [3700, 2400], [5400, 2400], [5850, 2850], [5400, 3300], [3200, 3300], [900, 3300], [550, 2000]],
  },
  {
    name: "Dogbone",
    points: [[600, 2000], [900, 900], [2000, 700], [2700, 1500], [3700, 1500], [4400, 700], [5500, 900], [5800, 2000], [5500, 3100], [4400, 3300], [3700, 2500], [2700, 2500], [2000, 3300], [900, 3100]],
  },
  {
    name: "Chicane Ring",
    points: [[1200, 800], [2200, 800], [2800, 1250], [3400, 800], [5200, 800], [5800, 2000], [5200, 3200], [4200, 3200], [3600, 2750], [3000, 3200], [1200, 3200], [600, 2000]],
  },
  {
    name: "Crown",
    points: [[900, 3300], [3200, 3400], [5500, 3300], [5700, 2400], [5400, 800], [4300, 1900], [3200, 800], [2100, 1900], [1000, 800], [700, 2400]],
  },
  {
    name: "Arrowhead",
    points: [[3200, 500], [3900, 900], [5700, 3000], [5300, 3500], [4300, 3300], [3200, 2500], [2100, 3300], [1100, 3500], [700, 3000], [2500, 900]],
  },
  {
    name: "Clover",
    points: polar((t) => 1 + 0.32 * Math.cos(3 * t), 2200, 1350),
  },
  {
    name: "Starfish",
    points: polar((t) => 1 + 0.22 * Math.cos(5 * t + Math.PI / 2), 2300, 1450),
  },
  {
    name: "Hook",
    points: [[800, 900], [2200, 500], [4600, 500], [5700, 1300], [5700, 2700], [4700, 3500], [2600, 3500], [1700, 2900], [2300, 2300], [3600, 2500], [4400, 2200], [4300, 1500], [3200, 1400], [1900, 1600], [1100, 2300], [600, 1700]],
  },
];

export const PRESET_TRACKS: PresetTrack[] = RAW_TRACKS.map((t) => ({ ...t, points: t.name === "Clover" || t.name === "Starfish" ? t.points : spline(t.points) }));
