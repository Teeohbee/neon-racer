export type Floor = "street" | "water" | "yard";

export interface District {
  deck: { base: number; seam: number; tints: number[]; clutter: number };
  wall: { top: number; bottom: number; windows: number };
  floor: Floor;
  floorColor: number;
  accents: number[];
  lamp: number;
  blinker: number;
  props: {
    lampSpacing: number;
    billboards: number;
    clutter: number;
    helipads: number;
    blinkers: number;
    pylons: boolean;
    traffic: boolean;
    boats: boolean;
  };
}

export const DISTRICTS: Record<string, District> = {
  Lightning: {
    deck: { base: 0x2b2e3c, seam: 0x1a1c27, tints: [0x2b2e3c, 0x30344a, 0x272a36, 0x2e3044], clutter: 0x4a5070 },
    wall: { top: 0x1c2036, bottom: 0x05060c, windows: 0x5ab8ff },
    floor: "yard",
    floorColor: 0x0b0d16,
    accents: [0x5ab8ff, 0xb08cff, 0xe8f0ff],
    lamp: 0xcfe4ff,
    blinker: 0x8fd0ff,
    props: { lampSpacing: 340, billboards: 12, clutter: 90, helipads: 1, blinkers: 26, pylons: true, traffic: true, boats: false },
  },
  Serpent: {
    deck: { base: 0x2e2b33, seam: 0x1b1920, tints: [0x2e2b33, 0x332f38, 0x2a2830, 0x302c36], clutter: 0x5a5060 },
    wall: { top: 0x24202e, bottom: 0x040a0e, windows: 0xff4fa3 },
    floor: "water",
    floorColor: 0x03161c,
    accents: [0x2ee6d6, 0xff4fa3, 0xffb8e0],
    lamp: 0xffd8c8,
    blinker: 0xff3048,
    props: { lampSpacing: 300, billboards: 14, clutter: 80, helipads: 2, blinkers: 18, pylons: false, traffic: false, boats: true },
  },
};

export const districtFor = (name: string | null | undefined): District | null => (name ? (DISTRICTS[name] ?? null) : null);
