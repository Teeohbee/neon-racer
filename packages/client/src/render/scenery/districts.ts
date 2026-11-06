export type Floor = "street" | "water" | "yard";

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
    deck: { base: 0x2c3244, seam: 0x161a26, tints: [0x2c3244, 0x323a52, 0x262c3c, 0x343a56, 0x2a2f44], clutter: 0x5a6890 },
    wall: { top: 0x1c2036, bottom: 0x05060c, windows: 0x5ab8ff },
    floor: "yard",
    floorColor: 0x0b0d16,
    accents: [0x5ab8ff, 0xb08cff, 0xe8f0ff],
    lamp: 0xcfe4ff,
    blinker: 0x8fd0ff,
    ambient: 0x2e3656,
    roofLight: 0x6cb8ff,
    props: { lampSpacing: 260, billboards: 16, clutter: 90, helipads: 1, blinkers: 30, pylons: true, traffic: true, boats: false, yards: 12, bridges: false, crossCables: true },
  },
  Serpent: {
    deck: { base: 0x302c38, seam: 0x18161e, tints: [0x302c38, 0x36303e, 0x2a2832, 0x2e3438, 0x342e3a], clutter: 0x6a5a70 },
    wall: { top: 0x24202e, bottom: 0x040a0e, windows: 0xff4fa3 },
    floor: "water",
    floorColor: 0x03161c,
    accents: [0x2ee6d6, 0xff4fa3, 0xffb8e0],
    lamp: 0xffd8c8,
    blinker: 0xff3048,
    ambient: 0x342c46,
    roofLight: 0xff6fb4,
    props: { lampSpacing: 240, billboards: 18, clutter: 80, helipads: 2, blinkers: 18, pylons: false, traffic: false, boats: true, yards: 0, bridges: true, crossCables: false },
  },
};

export const districtFor = (name: string | null | undefined): District | null => (name ? (DISTRICTS[name] ?? null) : null);
