// Fixed vocabulary for garment tags. The vision model must answer from these
// lists only; anything else is rejected/normalized by tag validation.

export const SLOTS = ["top", "bottom", "shoes", "other"] as const;
export type Slot = (typeof SLOTS)[number];

// Slot for every garment type. "other" items are stored and shown in the
// closet but are not used by the MVP outfit (top + bottom + shoes).
export const TYPE_TO_SLOT = {
  t_shirt: "top",
  tank_top: "top",
  shirt: "top",
  blouse: "top",
  sweater: "top",
  hoodie: "top",
  jeans: "bottom",
  trousers: "bottom",
  shorts: "bottom",
  skirt: "bottom",
  leggings: "bottom",
  sweatpants: "bottom",
  sneakers: "shoes",
  boots: "shoes",
  sandals: "shoes",
  dress_shoes: "shoes",
  dress: "other",
  jacket: "other",
  coat: "other",
  accessory: "other",
} as const satisfies Record<string, Slot>;

export type GarmentType = keyof typeof TYPE_TO_SLOT;
export const GARMENT_TYPES = Object.keys(TYPE_TO_SLOT) as GarmentType[];

export const COLORS = [
  "black", "white", "gray", "navy", "blue", "green", "red", "pink",
  "yellow", "orange", "purple", "brown", "beige", "multicolor",
] as const;
export type Color = (typeof COLORS)[number];

export const SEASONS = ["spring", "summer", "fall", "winter", "all"] as const;
export type Season = (typeof SEASONS)[number];

// 1 = very light (tank top, sandals) ... 5 = very warm (heavy sweater, boots)
export const WARMTH_MIN = 1;
export const WARMTH_MAX = 5;
export type Warmth = 1 | 2 | 3 | 4 | 5;

export function slotForType(type: GarmentType): Slot {
  return TYPE_TO_SLOT[type];
}

export function isGarmentType(value: unknown): value is GarmentType {
  return typeof value === "string" && Object.hasOwn(TYPE_TO_SLOT, value);
}

export function isColor(value: unknown): value is Color {
  return typeof value === "string" && (COLORS as readonly string[]).includes(value);
}

export function isSeason(value: unknown): value is Season {
  return typeof value === "string" && (SEASONS as readonly string[]).includes(value);
}

export function isWarmth(value: unknown): value is Warmth {
  return Number.isInteger(value) && (value as number) >= WARMTH_MIN && (value as number) <= WARMTH_MAX;
}
