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
  tights: "other", // worn under a skirt, shorts or a dress when it is cold; see outfit.ts
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

// A garment can have several colors (the first is the main one) and several seasons. "all" stands alone:
// a garment that suits every season is ["all"], never "all" plus others.
export const MAX_COLORS = 3;
export const SINGLE_SEASONS = ["spring", "summer", "fall", "winter"] as const satisfies readonly Season[];

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

// A valid color list: 1 to MAX_COLORS different colors. The first is the main color.
export function isColorList(value: unknown): value is Color[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= MAX_COLORS &&
    value.every(isColor) &&
    new Set(value).size === value.length
  );
}

// A valid season list: ["all"], or 1 to 3 different single seasons (all four is written as "all").
export function isSeasonList(value: unknown): value is Season[] {
  if (!Array.isArray(value) || value.length < 1 || !value.every(isSeason) || new Set(value).size !== value.length) return false;
  if (value.includes("all")) return value.length === 1;
  return value.length < SINGLE_SEASONS.length;
}

// Makes any list of seasons canonical: "all" (or all four seasons) becomes ["all"]; otherwise calendar order, no repeats.
export function normalizeSeasons(seasons: readonly Season[]): Season[] {
  const set = new Set(seasons);
  if (set.has("all") || SINGLE_SEASONS.every((s) => set.has(s))) return ["all"];
  return SINGLE_SEASONS.filter((s) => set.has(s));
}

export function isWarmth(value: unknown): value is Warmth {
  return Number.isInteger(value) && (value as number) >= WARMTH_MIN && (value as number) <= WARMTH_MAX;
}
