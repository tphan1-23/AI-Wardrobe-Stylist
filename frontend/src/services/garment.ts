// What a garment is, in words, and the draft a person edits when adding or editing one
// (Add review screen and Closet edit screen). Pure TypeScript, unit-tested (tests/garment.test.ts).
//
// The tag vocabulary itself (types, colors, seasons, warmth) lives in the AI core's
// tag-schema.ts and is never copied here; this file only gives each value a label.
import {
  COLORS,
  GARMENT_TYPES,
  MAX_COLORS,
  SEASONS,
  WARMTH_MAX,
  WARMTH_MIN,
  normalizeSeasons,
  slotForType,
  type Color,
  type GarmentType,
  type Season,
  type Warmth,
} from "../../../supabase/functions/_shared/tag-schema.ts";
import type { GarmentTags } from "../../../supabase/functions/_shared/types.ts";

export const TYPE_LABELS: Record<GarmentType, string> = {
  t_shirt: "t-shirt",
  tank_top: "tank top",
  shirt: "shirt",
  blouse: "blouse",
  sweater: "sweater",
  hoodie: "hoodie",
  jeans: "jeans",
  trousers: "trousers",
  shorts: "shorts",
  skirt: "skirt",
  leggings: "leggings",
  sweatpants: "sweatpants",
  sneakers: "sneakers",
  boots: "boots",
  sandals: "sandals",
  dress_shoes: "dress shoes",
  dress: "dress",
  tights: "tights",
  jacket: "jacket",
  coat: "coat",
  accessory: "accessory",
};

export const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
  all: "All seasons",
};

export const WARMTH_LABELS: Record<Warmth, string> = {
  1: "Very light",
  2: "Light",
  3: "Medium",
  4: "Warm",
  5: "Very warm",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const colorLabel = (color: Color): string => capitalize(color);
export const typeLabel = (type: GarmentType): string => capitalize(TYPE_LABELS[type]);

// "Black", "Black and white", "Black, white and pink": the main color first.
export function colorsLabel(colors: readonly Color[]): string {
  const names = colors.map((c) => c.toLowerCase());
  const text = names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return capitalize(text);
}

export function seasonsLabel(seasons: readonly Season[]): string {
  return seasons.map((s) => SEASON_LABELS[s]).join(", ");
}

export function garmentName(garment: { colors: readonly Color[]; type: GarmentType }): string {
  return `${colorsLabel(garment.colors)} ${TYPE_LABELS[garment.type]}`;
}

export function garmentDetail(garment: { seasons: readonly Season[]; warmth: Warmth }): string {
  return `${seasonsLabel(garment.seasons)} · ${WARMTH_LABELS[garment.warmth]}`;
}

// ---- Picking several colors and seasons --------------------------------------

// Taps a color: adds it (up to MAX_COLORS, the first one picked is the main color) or removes it.
export function toggleColor(current: readonly Color[] | null, color: Color): Color[] {
  const colors = current ?? [];
  if (colors.includes(color)) return colors.filter((c) => c !== color);
  if (colors.length >= MAX_COLORS) return [...colors];
  return [...colors, color];
}

// Taps a season: "All seasons" stands alone, so picking it clears the others and picking a single season clears it.
// Choosing all four single seasons is the same thing as "All seasons".
export function toggleSeason(current: readonly Season[] | null, season: Season): Season[] {
  const seasons = current ?? [];
  if (season === "all") return seasons.includes("all") ? [] : ["all"];
  const without = seasons.filter((s) => s !== "all");
  return normalizeSeasons(without.includes(season) ? without.filter((s) => s !== season) : [...without, season]);
}

export const COLOR_OPTIONS: Color[] = [...COLORS];
export const SEASON_OPTIONS: Season[] = [...SEASONS];
export const WARMTH_OPTIONS: Warmth[] = Array.from(
  { length: WARMTH_MAX - WARMTH_MIN + 1 },
  (_, i) => (WARMTH_MIN + i) as Warmth,
);

// The 20 garment types, grouped the way the closet filter and the outfit slots group them.
export const TYPE_GROUPS: { label: string; types: GarmentType[] }[] = [
  { label: "Tops", types: GARMENT_TYPES.filter((t) => slotForType(t) === "top") },
  { label: "Bottoms", types: GARMENT_TYPES.filter((t) => slotForType(t) === "bottom") },
  { label: "Shoes", types: GARMENT_TYPES.filter((t) => slotForType(t) === "shoes") },
  { label: "Other", types: GARMENT_TYPES.filter((t) => slotForType(t) === "other") },
];

// ---- The draft a person edits ------------------------------------------------

export type TagField = keyof GarmentTags;
export const TAG_FIELDS: TagField[] = ["type", "colors", "seasons", "warmth"];

export const FIELD_LABELS: Record<TagField, string> = {
  type: "Type",
  colors: "Colors",
  seasons: "Seasons",
  warmth: "Warmth",
};

// null means "not chosen yet" (the AI left it out, or the person has not picked one).
export interface GarmentDraft {
  type: GarmentType | null;
  colors: Color[] | null;
  seasons: Season[] | null;
  warmth: Warmth | null;
}

export const emptyDraft = (): GarmentDraft => ({ type: null, colors: null, seasons: null, warmth: null });

export function draftFromTags(tags: Partial<GarmentTags>): GarmentDraft {
  return {
    type: tags.type ?? null,
    colors: tags.colors ?? null,
    seasons: tags.seasons ?? null,
    warmth: tags.warmth ?? null,
  };
}

export function setField<F extends TagField>(draft: GarmentDraft, field: F, value: GarmentTags[F]): GarmentDraft {
  // Taking away the last color or season leaves the field "not chosen", so it is asked for again.
  return { ...draft, [field]: Array.isArray(value) && value.length === 0 ? null : value };
}

export function missingFields(draft: GarmentDraft): TagField[] {
  return TAG_FIELDS.filter((field) => draft[field] === null);
}

export function isComplete(draft: GarmentDraft): draft is GarmentTags {
  return missingFields(draft).length === 0;
}
