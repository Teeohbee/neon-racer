import type { FeatureSpec, Point } from "./track";

export interface PresetTrack {
  name: string;
  points: Point[];
  features: FeatureSpec[];
}

const polar = (fn: (t: number) => number, rx: number, ry: number, n = 120): Point[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    const r = fn(t);
    return [3200 + Math.cos(t) * rx * r, 2000 + Math.sin(t) * ry * r];
  });

const curve = (fn: (t: number) => Point, n: number): Point[] =>
  Array.from({ length: n }, (_, i) => fn(Math.PI / 2 + (i / n) * Math.PI * 2));

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
    features: [{ kind: "boost", at: [2680, 580] }, { kind: "boost", at: [4200, 3380] }, { kind: "drop", at: [3290, 2670], span: 1000 }],
  },
  {
    name: "Serpent",
    points: [[600, 800], [1400, 500], [2200, 1100], [3000, 500], [3800, 1100], [4600, 500], [5600, 800], [5800, 2000], [5600, 3300], [4600, 3500], [3800, 2900], [3000, 3500], [2200, 2900], [1400, 3500], [600, 3200], [500, 2000]],
    features: [{ kind: "drop", at: [3100, 540], span: 1800 }, { kind: "boost", at: [5780, 1380] }, { kind: "drop", at: [2690, 3300], span: 1400 }, { kind: "boost", at: [500, 2150] }],
  },
  {
    name: "Paperclip",
    points: [[900, 700], [3200, 700], [5400, 700], [5850, 1100], [5400, 1500], [3700, 1500], [2200, 1500], [1800, 1950], [2200, 2400], [3700, 2400], [5400, 2400], [5850, 2850], [5400, 3300], [3200, 3300], [900, 3300], [550, 2000]],
    features: [{ kind: "boost", at: [4700, 670] }, { kind: "drop", at: [5810, 1230], span: 1000 }, { kind: "drop", at: [3900, 2400], span: 1600 }, { kind: "boost", at: [2780, 3320] }],
  },
  {
    name: "Dogbone",
    points: [[600, 2000], [900, 900], [2000, 700], [2700, 1500], [3700, 1500], [4400, 700], [5500, 900], [5800, 2000], [5500, 3100], [4400, 3300], [3700, 2500], [2700, 2500], [2000, 3300], [900, 3100]],
    features: [{ kind: "boost", at: [2160, 820] }, { kind: "drop", at: [3320, 1590], span: 1300 }, { kind: "boost", at: [4240, 3180] }, { kind: "drop", at: [2890, 2440], span: 1300 }],
  },
  {
    name: "Chicane Ring",
    points: [[1200, 800], [2200, 800], [2800, 1250], [3400, 800], [5200, 800], [5800, 2000], [5200, 3200], [4200, 3200], [3600, 2750], [3000, 3200], [1200, 3200], [600, 2000]],
    features: [{ kind: "drop", at: [2840, 1220], span: 900 }, { kind: "boost", at: [4270, 700] }, { kind: "boost", at: [4730, 3300] }, { kind: "drop", at: [3500, 2810], span: 900 }],
  },
  {
    name: "Crown",
    points: [[900, 3300], [3200, 3400], [5500, 3300], [5700, 2400], [5400, 800], [4300, 1900], [3200, 800], [2100, 1900], [1000, 800], [700, 2400]],
    features: [{ kind: "boost", at: [2910, 3400] }, { kind: "boost", at: [5700, 2410] }, { kind: "drop", at: [5500, 930], span: 800 }, { kind: "drop", at: [3020, 880], span: 800 }],
  },
  {
    name: "Arrowhead",
    points: [[3200, 500], [3900, 900], [5700, 3000], [5300, 3500], [4300, 3300], [3200, 2500], [2100, 3300], [1100, 3500], [700, 3000], [2500, 900]],
    features: [{ kind: "boost", at: [5480, 2680] }, { kind: "drop", at: [5200, 3510], span: 900 }, { kind: "drop", at: [3010, 2560], span: 900 }, { kind: "boost", at: [1290, 2220] }],
  },
  {
    name: "Lightning",
    points: [[2300, 400], [3400, 400], [4700, 450], [3900, 1450], [5100, 1450], [5550, 1500], [5750, 1720], [5450, 2000], [2300, 3550], [1700, 3500], [2800, 2400], [1300, 2350], [1000, 2100]],
    features: [{ kind: "drop", at: [4550, 710], span: 1000 }, { kind: "boost", at: [4640, 2420] }, { kind: "drop", at: [2300, 3550], span: 1600 }, { kind: "boost", at: [1340, 1550] }],
  },
  {
    name: "Starfish",
    points: polar((t) => 1 + 0.22 * Math.cos(5 * t + Math.PI / 2), 2300, 1450),
    features: [{ kind: "boost", at: [3180, 3140] }, { kind: "drop", at: [1640, 3460], span: 800 }, { kind: "boost", at: [2160, 1060] }, { kind: "drop", at: [3210, 240], span: 800 }],
  },
  {
    name: "Hook",
    points: [[800, 900], [2200, 500], [4600, 500], [5700, 1300], [5700, 2700], [4700, 3500], [2600, 3500], [1700, 2900], [2300, 2300], [3600, 2500], [4400, 2200], [4300, 1500], [3200, 1400], [1900, 1600], [1100, 2300], [600, 1700]],
    features: [{ kind: "boost", at: [3250, 430] }, { kind: "boost", at: [3430, 3580] }, { kind: "drop", at: [4290, 1510], span: 1000 }, { kind: "drop", at: [1090, 2280], span: 800 }],
  },
  {
    name: "Interchange",
    points: curve((t) => [3200 + 2600 * Math.sin(t), 2000 + 1500 * Math.sin(2 * t)], 240),
    features: [
      { kind: "bridge", at: [3392, 1779], span: 900 },
      { kind: "boost", at: [5251, 553] },
      { kind: "boost", at: [1130, 562] },
      { kind: "drop", at: [1135, 3440], span: 900 },
      { kind: "drop", at: [5246, 3449], span: 900 },
    ],
  },
  {
    name: "Pretzel",
    points: curve((t) => [3200 + 2700 * Math.sin(t), 2000 + 1100 * Math.sin(3 * t + 0.8)], 360),
    features: [
      { kind: "bridge", at: [4735, 2931], span: 900 },
      { kind: "bridge", at: [1664, 1069], span: 900 },
      { kind: "boost", at: [3467, 1472] },
      { kind: "boost", at: [2933, 2529] },
      { kind: "drop", at: [502, 2748], span: 900 },
      { kind: "drop", at: [5284, 1670], span: 900 },
    ],
  },
];

const DENSE = new Set(["Starfish", "Interchange", "Pretzel"]);

export const PRESET_TRACKS: PresetTrack[] = RAW_TRACKS.map((t) => ({ ...t, points: DENSE.has(t.name) ? t.points : spline(t.points) }));
