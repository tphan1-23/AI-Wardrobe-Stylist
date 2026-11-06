// Turns untrusted vision-model output into the fixed tag schema. Never throws;
// anything it cannot map is left out and flagged for the review screen.
import { isColor, isGarmentType, isSeason, isWarmth } from "./tag-schema.ts";
import type { AnalyzeGarmentResponse, CropBox, GarmentTags } from "./types.ts";

export const LOW_CONFIDENCE = 0.6;
export const DEFAULT_CONFIDENCE = 0.5; // used when the model reports none

const TYPE_SYNONYMS: Record<string, string> = {
  tshirt: "t_shirt", tee: "t_shirt", tee_shirt: "t_shirt", teeshirt: "t_shirt",
  tank: "tank_top", camisole: "tank_top", cami: "tank_top", sleeveless_top: "tank_top",
  button_up: "shirt", button_down: "shirt", dress_shirt: "shirt", polo: "shirt", polo_shirt: "shirt", top: "shirt",
  jumper: "sweater", pullover: "sweater", cardigan: "sweater", knit: "sweater", sweatshirt: "hoodie", hoody: "hoodie",
  denim: "jeans", pants: "trousers", slacks: "trousers", chinos: "trousers", dress_pants: "trousers",
  short: "shorts", tights: "leggings", joggers: "sweatpants", track_pants: "sweatpants",
  sneaker: "sneakers", trainers: "sneakers", running_shoes: "sneakers", athletic_shoes: "sneakers",
  boot: "boots", sandal: "sandals", flip_flops: "sandals", loafers: "dress_shoes", oxfords: "dress_shoes",
  heels: "dress_shoes", dress_shoe: "dress_shoes", gown: "dress", blazer: "jacket", parka: "coat", overcoat: "coat",
  hat: "accessory", scarf: "accessory", belt: "accessory", bag: "accessory", cap: "accessory",
};

const COLOR_SYNONYMS: Record<string, string> = {
  grey: "gray", charcoal: "gray", silver: "gray", tan: "beige", cream: "beige", khaki: "beige", ivory: "beige",
  navy_blue: "navy", dark_blue: "navy", light_blue: "blue", sky_blue: "blue", maroon: "red", burgundy: "red",
  olive: "green", teal: "green", violet: "purple", lavender: "purple", gold: "yellow", mustard: "yellow",
  multi: "multicolor", multi_color: "multicolor", patterned: "multicolor", colorful: "multicolor",
};

const SEASON_SYNONYMS: Record<string, string> = {
  autumn: "fall", all_season: "all", all_seasons: "all", year_round: "all", any: "all", every_season: "all",
};

function normalizeToken(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const token = value.toLowerCase().trim().replace(/[\s-]+/g, "_").replace(/[^a-z_]/g, "");
  return token.length > 0 ? token : undefined;
}

function resolve(value: unknown, synonyms: Record<string, string>, isValid: (v: unknown) => boolean): string | undefined {
  const token = normalizeToken(value);
  if (token === undefined) return undefined;
  for (const candidate of [token, token.replace(/s$/, "")]) {
    const mapped = Object.hasOwn(synonyms, candidate) ? synonyms[candidate]! : candidate;
    if (isValid(mapped)) return mapped;
  }
  return undefined;
}

// Pulls the first JSON value out of model text (handles ```json fences and chatter).
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "");
  const start = stripped.search(/[{[]/);
  if (start === -1) return undefined;
  const open = stripped[start]!;
  const close = open === "{" ? "}" : "]";
  const end = stripped.lastIndexOf(close);
  if (end <= start) return undefined;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function resolveSeason(value: unknown, warnings: string[]): string | undefined {
  if (!Array.isArray(value)) return resolve(value, SEASON_SYNONYMS, isSeason);
  const seasons = [...new Set(value.map((v) => resolve(v, SEASON_SYNONYMS, isSeason)).filter((v): v is string => !!v))];
  if (seasons.length === 0) return undefined;
  if (seasons.length >= 3 || seasons.includes("all")) return "all";
  if (seasons.length > 1) warnings.push(`multiple seasons (${seasons.join(", ")}); using ${seasons[0]}`);
  return seasons[0];
}

function resolveWarmth(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return isWarmth(rounded) ? rounded : undefined;
}

function confidenceOf(raw: unknown, field: keyof GarmentTags): number {
  const c = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>)[field] : undefined;
  return typeof c === "number" && Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : DEFAULT_CONFIDENCE;
}

// Boxes smaller than this share of the photo are not believable as "the garment".
export const MIN_BOX_AREA = 0.05;
// If the padded box covers this much of the photo, cropping would change nothing worth showing.
export const MAX_BOX_AREA = 0.9;
// Padding added on every side so the item's edges are not clipped.
export const BOX_PADDING = 0.05;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

// The model answers [ymin, xmin, ymax, xmax] on a 0..1000 scale (Gemini's own convention).
// Anything that is not four sensible numbers in order is dropped: the box is a suggestion only.
export function validateBox(raw: unknown): CropBox | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  if (!raw.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1000)) return undefined;
  const [ymin, xmin, ymax, xmax] = (raw as number[]).map((v) => v / 1000) as [number, number, number, number];
  if (ymax <= ymin || xmax <= xmin) return undefined;
  if ((ymax - ymin) * (xmax - xmin) < MIN_BOX_AREA) return undefined;

  const left = Math.max(0, xmin - BOX_PADDING);
  const top = Math.max(0, ymin - BOX_PADDING);
  const right = Math.min(1, xmax + BOX_PADDING);
  const bottom = Math.min(1, ymax + BOX_PADDING);
  const box = { x: round4(left), y: round4(top), width: round4(right - left), height: round4(bottom - top) };
  return box.width * box.height > MAX_BOX_AREA ? undefined : box;
}

export function validateTags(input: unknown): AnalyzeGarmentResponse {
  const warnings: string[] = [];
  let raw = input;
  if (Array.isArray(raw)) {
    if (raw.length > 1) warnings.push("multiple garments detected; using the first");
    raw = raw[0];
  }
  const obj = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : undefined;
  if (obj === undefined) warnings.push("model output was not a JSON object");

  const tags: Partial<GarmentTags> = {};
  const type = resolve(obj?.type, TYPE_SYNONYMS, isGarmentType);
  if (type !== undefined) tags.type = type as GarmentTags["type"];
  const color = resolve(obj?.color, COLOR_SYNONYMS, isColor);
  if (color !== undefined) tags.color = color as GarmentTags["color"];
  const season = resolveSeason(obj?.season, warnings);
  if (season !== undefined) tags.season = season as GarmentTags["season"];
  const warmth = resolveWarmth(obj?.warmth);
  if (warmth !== undefined) tags.warmth = warmth as GarmentTags["warmth"];

  const confidence: AnalyzeGarmentResponse["confidence"] = {};
  const needsReview: (keyof GarmentTags)[] = [];
  for (const field of ["type", "color", "season", "warmth"] as const) {
    if (tags[field] === undefined) {
      if (obj !== undefined && obj[field] !== undefined) warnings.push(`unrecognized ${field}: ${JSON.stringify(obj[field])}`);
      needsReview.push(field);
      continue;
    }
    confidence[field] = confidenceOf(obj?.confidence, field);
    if (confidence[field]! < LOW_CONFIDENCE) needsReview.push(field);
  }
  const box = validateBox(obj?.box);
  return { tags, confidence, needs_review: needsReview, warnings, ...(box ? { box } : {}) };
}

export function parseModelOutput(text: string): AnalyzeGarmentResponse {
  const json = extractJson(text);
  if (json === undefined) {
    const result = validateTags(undefined);
    result.warnings = ["no JSON found in model output"];
    return result;
  }
  return validateTags(json);
}
