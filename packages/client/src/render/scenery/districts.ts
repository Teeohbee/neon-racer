import type { WeatherConfig } from "../weather";

export type Floor = "street" | "water" | "yard" | "plain";

export type SignatureKind =
  | "containers"
  | "cranes"
  | "warehouses"
  | "glassTowers"
  | "helipadLights"
  | "logoBoards"
  | "plazas"
  | "lanternStrings"
  | "awnings"
  | "stallLanterns"
  | "domes"
  | "spires"
  | "courtyards"
  | "furnaces"
  | "smokestacks"
  | "conveyors"
  | "canopies"
  | "greenhouses"
  | "pond"
  | "stadium"
  | "floodlights";

export type FloorExtra = "ships" | "buoys" | "tiles" | "crowd" | "stalls" | "lava" | "paths" | "trees" | "kiosks" | "gardens";

export interface District {
  deck: { base: number; seam: number; tints: number[]; clutter: number };
  wall: { top: number; bottom: number; windows: number };
  floor: Floor;
  floorColor: number;
  accents: number[];
  lamp: number;
  blinker: number;
  ambient: number;
  roofLight: number;
  weather: WeatherConfig | null;
  edges?: readonly [number, number];
  roofLights?: number[];
  block?: { leaf: number; min: number; stop: number; inset: [number, number] };
  signatures?: SignatureKind[];
  extras?: FloorExtra[];
  props: {
    lampSpacing: number;
    billboards: number;
    clutter: number;
    helipads: number;
    blinkers: number;
    pylons: boolean;
    traffic: boolean;
    yards: number;
    bridges: boolean;
    crossCables: boolean;
    boats: boolean;
  };
}

export const DISTRICTS: Record<string, District> = {
  Lightning: {
    deck: { base: 0x2c3244, seam: 0x161a26, tints: [0x2c3244, 0x323a52, 0x22283a, 0x3a4262, 0x2a2f44, 0x30364c], clutter: 0x5a6890 },
    wall: { top: 0x1c2036, bottom: 0x05060c, windows: 0x5ab8ff },
    floor: "yard",
    floorColor: 0x0b0d16,
    accents: [0x5ab8ff, 0xb08cff, 0xe8f0ff],
    lamp: 0xcfe4ff,
    blinker: 0x8fd0ff,
    ambient: 0x38426a,
    roofLight: 0x6cb8ff,
    weather: null,
    edges: [0x4aa8ff, 0xa080ff],
    props: { lampSpacing: 260, billboards: 24, clutter: 90, helipads: 1, blinkers: 30, pylons: true, traffic: true, boats: false, yards: 12, bridges: false, crossCables: true },
  },
  Serpent: {
    deck: { base: 0x302c38, seam: 0x18161e, tints: [0x302c38, 0x3a3344, 0x242028, 0x2e3438, 0x40384a, 0x342e3a], clutter: 0x6a5a70 },
    wall: { top: 0x24202e, bottom: 0x040a0e, windows: 0xff4fa3 },
    floor: "water",
    floorColor: 0x03161c,
    accents: [0x2ee6d6, 0xff4fa3, 0xffb8e0],
    lamp: 0xffd8c8,
    blinker: 0xff3048,
    ambient: 0x40365a,
    roofLight: 0xff6fb4,
    weather: { rain: true, haze: 0x8a6aaa, hazeAlpha: 0.09 },
    edges: [0x2ee6d6, 0xff4fa3],
    props: { lampSpacing: 240, billboards: 26, clutter: 80, helipads: 2, blinkers: 18, pylons: false, traffic: false, boats: true, yards: 0, bridges: true, crossCables: false },
  },
  "Kidney Bean": {
    deck: { base: 0x26323a, seam: 0x141c20, tints: [0x26323a, 0x2c3a42, 0x222c32, 0x30383e, 0x2a3438, 0x343e44], clutter: 0x4c6470 },
    wall: { top: 0x1c2a30, bottom: 0x03080a, windows: 0xffa040 },
    floor: "water",
    floorColor: 0x041418,
    accents: [0x2ad8c8, 0xff8a2a, 0xffd0a0],
    lamp: 0xffa040,
    blinker: 0xff2020,
    ambient: 0x2e3c44,
    roofLight: 0xff9a40,
    weather: { haze: 0x9ab8c0, hazeAlpha: 0.13, hazeScale: 5, hazeDrift: 8 },
    edges: [0x30e0d0, 0x5a90ff],
    block: { leaf: 900, min: 380, stop: 0.5, inset: [16, 40] },
    signatures: ["containers", "cranes", "warehouses"],
    extras: ["ships", "buoys"],
    props: { lampSpacing: 260, billboards: 6, clutter: 50, helipads: 0, blinkers: 16, pylons: false, traffic: false, boats: true, yards: 0, bridges: false, crossCables: false },
  },
  Paperclip: {
    deck: { base: 0x2a2e3a, seam: 0x12141a, tints: [0x2a2e3a, 0x323848, 0x262a34, 0x3a4050, 0x2e3240, 0x363c4a], clutter: 0x6a7088 },
    wall: { top: 0x2a2e3c, bottom: 0x040508, windows: 0xfff0c8 },
    floor: "street",
    floorColor: 0x08090c,
    accents: [0xffffff, 0xffc84a, 0x9ad0ff],
    lamp: 0xf0f4ff,
    blinker: 0xff3030,
    ambient: 0x363c50,
    roofLight: 0xe8eeff,
    weather: null,
    edges: [0xf0f4ff, 0x60a0ff],
    block: { leaf: 760, min: 340, stop: 0.4, inset: [20, 46] },
    signatures: ["glassTowers", "helipadLights", "logoBoards"],
    props: { lampSpacing: 240, billboards: 6, clutter: 40, helipads: 7, blinkers: 30, pylons: false, traffic: true, boats: false, yards: 0, bridges: false, crossCables: false },
  },
  Dogbone: {
    deck: { base: 0x342a34, seam: 0x18121a, tints: [0x342a34, 0x3a2e3a, 0x2c242c, 0x403440, 0x362c30, 0x3c3038], clutter: 0x7a5a70 },
    wall: { top: 0x2e2030, bottom: 0x080408, windows: 0xffb040 },
    floor: "plain",
    floorColor: 0x140c14,
    accents: [0xff3fa0, 0xffb030, 0xffe0b0],
    lamp: 0xffc890,
    blinker: 0xff5090,
    ambient: 0x40324a,
    roofLight: 0xff6fb0,
    weather: { haze: 0xc06090, hazeAlpha: 0.05, hazeScale: 4 },
    edges: [0xff3fa0, 0xb070ff],
    signatures: ["plazas", "lanternStrings"],
    extras: ["tiles", "crowd"],
    props: { lampSpacing: 240, billboards: 10, clutter: 50, helipads: 0, blinkers: 14, pylons: false, traffic: false, boats: false, yards: 0, bridges: false, crossCables: false },
  },
  "Chicane Ring": {
    deck: { base: 0x342c28, seam: 0x16120e, tints: [0x342c28, 0x3a302a, 0x2c2622, 0x40342c, 0x2e2a26, 0x382e26], clutter: 0x7a6450 },
    wall: { top: 0x2c221c, bottom: 0x060403, windows: 0xffc060 },
    floor: "plain",
    floorColor: 0x120c08,
    accents: [0xff3a30, 0xffd030, 0x40e070],
    lamp: 0xffc070,
    blinker: 0xff4040,
    ambient: 0x40342c,
    roofLight: 0xffb050,
    weather: { haze: 0xe0d0c0, hazeAlpha: 0.07, hazeScale: 2.5, hazeDrift: 30 },
    edges: [0x40e070, 0x40c0ff],
    block: { leaf: 360, min: 180, stop: 0.5, inset: [6, 14] },
    signatures: ["awnings", "lanternStrings", "stallLanterns"],
    extras: ["stalls"],
    props: { lampSpacing: 220, billboards: 10, clutter: 150, helipads: 0, blinkers: 10, pylons: false, traffic: false, boats: false, yards: 0, bridges: false, crossCables: false },
  },
  Crown: {
    deck: { base: 0x2e2838, seam: 0x140f1a, tints: [0x2e2838, 0x362e42, 0x282232, 0x3c3448, 0x302a3a, 0x342c3e], clutter: 0x7a6a90 },
    wall: { top: 0x2a2038, bottom: 0x06040a, windows: 0xffd070 },
    floor: "water",
    floorColor: 0x0a0818,
    accents: [0xffc840, 0xa050ff, 0xfff0c0],
    lamp: 0xffe0a0,
    blinker: 0xffc840,
    ambient: 0x3a3250,
    roofLight: 0xffc040,
    weather: { haze: 0x5a3a8a, hazeAlpha: 0.04, fireworks: [0xffc840, 0xc070ff, 0xff5080, 0x60e0ff] },
    edges: [0xb070ff, 0x60e0ff],
    signatures: ["domes", "spires", "courtyards"],
    extras: ["gardens"],
    props: { lampSpacing: 260, billboards: 8, clutter: 50, helipads: 1, blinkers: 10, pylons: false, traffic: false, boats: false, yards: 0, bridges: true, crossCables: false },
  },
  Arrowhead: {
    deck: { base: 0x2e2826, seam: 0x120e0c, tints: [0x2e2826, 0x36302c, 0x262220, 0x3c3430, 0x2a2422, 0x322a26], clutter: 0x6a5448 },
    wall: { top: 0x2a1a14, bottom: 0x0a0302, windows: 0xff7020 },
    floor: "plain",
    floorColor: 0x1a0602,
    accents: [0xff6a10, 0xff2a10, 0xffd080],
    lamp: 0xffa060,
    blinker: 0xff3010,
    ambient: 0x40302a,
    roofLight: 0xff6020,
    weather: { haze: 0x5a3020, hazeAlpha: 0.08, particles: { kind: "embers", color: 0xff8a30 } },
    edges: [0x40e0ff, 0xd0d8ff],
    signatures: ["furnaces", "smokestacks", "conveyors"],
    extras: ["lava"],
    props: { lampSpacing: 280, billboards: 6, clutter: 60, helipads: 0, blinkers: 20, pylons: false, traffic: false, boats: false, yards: 0, bridges: false, crossCables: false },
  },
  Starfish: {
    deck: { base: 0x26302a, seam: 0x101612, tints: [0x26302a, 0x2c3830, 0x222a24, 0x323c34, 0x28302c, 0x2e3632], clutter: 0x5a7060 },
    wall: { top: 0x1c2a22, bottom: 0x030604, windows: 0xc0ff80 },
    floor: "plain",
    floorColor: 0x06120a,
    accents: [0x60f080, 0xc080ff, 0xf0ffd0],
    lamp: 0xe0ffc0,
    blinker: 0xc080ff,
    ambient: 0x2e3c34,
    roofLight: 0x80f0a0,
    weather: { haze: 0x406050, hazeAlpha: 0.05, particles: { kind: "fireflies", color: 0xd8ff70 } },
    edges: [0x60f080, 0xc080ff],
    signatures: ["canopies", "greenhouses", "pond"],
    extras: ["paths", "trees"],
    props: { lampSpacing: 260, billboards: 6, clutter: 40, helipads: 0, blinkers: 8, pylons: false, traffic: false, boats: false, yards: 0, bridges: false, crossCables: false },
  },
  Hook: {
    deck: { base: 0x2a2c34, seam: 0x101216, tints: [0x2a2c34, 0x30343e, 0x24262c, 0x383c46, 0x2c2e36, 0x32363e], clutter: 0x606878 },
    wall: { top: 0x262a34, bottom: 0x040506, windows: 0xffffff },
    floor: "plain",
    floorColor: 0x0c0e12,
    accents: [0xffffff, 0xff2a4a, 0x2a7aff],
    lamp: 0xf8fbff,
    blinker: 0xff2a4a,
    ambient: 0x343844,
    roofLight: 0xf0f4ff,
    weather: null,
    edges: [0x2a7aff, 0xf0f4ff],
    signatures: ["stadium", "floodlights"],
    roofLights: [0xff2a4a, 0x2a7aff, 0xf0f4ff],
    extras: ["crowd", "kiosks"],
    props: { lampSpacing: 240, billboards: 10, clutter: 60, helipads: 2, blinkers: 20, pylons: false, traffic: false, boats: false, yards: 0, bridges: false, crossCables: false },
  },
};

DISTRICTS.Interchange = { ...DISTRICTS["Kidney Bean"]!, edges: [0x2ad8c8, 0xffb020], roofLight: 0xffb020 };
DISTRICTS.Pretzel = { ...DISTRICTS.Lightning!, edges: [0x7cff6a, 0xff4fd8], accents: [0x7cff6a, 0xff4fd8, 0xe8fff0], roofLight: 0x7cff6a };

export const districtFor = (name: string | null | undefined): District | null => (name ? (DISTRICTS[name] ?? null) : null);
