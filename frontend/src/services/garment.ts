// What a garment is, in words, and the draft a person edits when adding or editing one
// (Add review screen and Closet edit screen). Pure TypeScript, unit-tested (tests/garment.test.ts).
//
// The tag vocabulary itself (types, colors, seasons, warmth) lives in the AI core's
// tag-schema.ts and is never copied here; this file only gives each value a label.
import {
  COLORS,
  GARMENT_TYPES,
  SEASONS,
  WARMTH_MAX,
  WARMTH_MIN,
  slotForType,
  type Color,
  type GarmentType,
  type Season,
  type Warmth,
} from "../../../supabase/functions/_shared/tag-schema.ts";
import type { AnalyzeGarmentResponse, GarmentTags } from "../../../supabase/functions/_shared/types.ts";

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

export function garmentName(garment: { color: Color; type: GarmentType }): string {
  return `${colorLabel(garment.color)} ${TYPE_LABELS[garment.type]}`;
}

export function garmentDetail(garment: { season: Season; warmth: Warmth }): string {
  return `${SEASON_LABELS[garment.season]} · ${WARMTH_LABELS[garment.warmth]}`;
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
export const TAG_FIELDS: TagField[] = ["type", "color", "season", "warmth"];

export const FIELD_LABELS: Record<TagField, string> = {
  type: "Type",
  color: "Color",
  season: "Season",
  warmth: "Warmth",
};

// null means "not chosen yet" (the AI left it out, or the person has not picked one).
export interface GarmentDraft {
  type: GarmentType | null;
  color: Color | null;
  season: Season | null;
  warmth: Warmth | null;
}

export const emptyDraft = (): GarmentDraft => ({ type: null, color: null, season: null, warmth: null });

export function draftFromTags(tags: Partial<GarmentTags>): GarmentDraft {
  return {
    type: tags.type ?? null,
    color: tags.color ?? null,
    season: tags.season ?? null,
    warmth: tags.warmth ?? null,
  };
}

export function setField<F extends TagField>(draft: GarmentDraft, field: F, value: GarmentTags[F]): GarmentDraft {
  return { ...draft, [field]: value };
}

export function missingFields(draft: GarmentDraft): TagField[] {
  return TAG_FIELDS.filter((field) => draft[field] === null);
}

export function isComplete(draft: GarmentDraft): draft is GarmentTags {
  return missingFields(draft).length === 0;
}

// ---- Review: the person confirms what the AI suggested (decision D4) ---------

export interface ReviewState {
  draft: GarmentDraft;
  // Fields the AI left out or was unsure about: the person must settle each before saving.
  flagged: TagField[];
  // Flagged fields the person has settled, by choosing a value or confirming the suggestion.
  confirmed: TagField[];
}

export function startReview(analysis: Pick<AnalyzeGarmentResponse, "tags" | "needs_review">): ReviewState {
  const draft = draftFromTags(analysis.tags);
  const flagged = TAG_FIELDS.filter((f) => analysis.needs_review.includes(f) || draft[f] === null);
  return { draft, flagged, confirmed: [] };
}

// No suggestion at all (the AI was unavailable): every field is up to the person.
export function manualReview(): ReviewState {
  return { draft: emptyDraft(), flagged: [...TAG_FIELDS], confirmed: [] };
}

const settle = (confirmed: TagField[], field: TagField) => (confirmed.includes(field) ? confirmed : [...confirmed, field]);

// Choosing a value counts as checking that field.
export function chooseValue<F extends TagField>(state: ReviewState, field: F, value: GarmentTags[F]): ReviewState {
  return { ...state, draft: setField(state.draft, field, value), confirmed: settle(state.confirmed, field) };
}

// "Looks right": keeps the suggested value. A field with no value cannot be confirmed.
export function confirmField(state: ReviewState, field: TagField): ReviewState {
  if (state.draft[field] === null) return state;
  return { ...state, confirmed: settle(state.confirmed, field) };
}

export const needsAttention = (state: ReviewState): TagField[] =>
  state.flagged.filter((f) => !state.confirmed.includes(f));

export function reviewProblem(state: ReviewState): string | null {
  const missing = missingFields(state.draft);
  if (missing.length > 0) return `Choose ${missing.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")}.`;
  const unsettled = needsAttention(state);
  if (unsettled.length > 0) {
    return `Check ${unsettled.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")} before saving.`;
  }
  return null;
}
