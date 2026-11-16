// Outfit scoring engine: pure, deterministic, no I/O. Imported by the
// generate-outfit edge function and tested directly with fixtures.
import { baseRole, isLightTop, isOverTop, showsLegs } from "./outfit.ts";
import { stylePenalty } from "./style.ts";
import type { Season } from "./tag-schema.ts";
import type {
  Garment,
  ISODate,
  Outfit,
  OutfitResult,
  PreferenceEntry,
  TempComfort,
  UUID,
  WeatherSnapshot,
} from "./types.ts";

export const WEIGHTS = { weather: 0.5, preference: 0.5, repeat: 0.25 } as const;
export const REPEAT_WINDOW_DAYS = 7;
export const MAX_CANDIDATES_PER_SLOT = 15;
const COMFORT_OFFSET_C: Record<TempComfort, number> = { runs_cold: -3, neutral: 0, runs_hot: 3 };
const WEATHER_SHARE = { warmth: 0.8, season: 0.2 } as const;
const SANDALS_IN_RAIN_PENALTY = 0.5;
// A layer (jacket, coat, or a hoodie/sweater over a lighter top) is added when the adjusted feels-like
// temperature is at or below this, or when it is raining.
export const LAYER_AT_OR_BELOW_C = 15;
// With a layer on, the top or dress underneath can be one step lighter.
const WARMTH_DROP_WITH_LAYER = 1;
// Tights go under a skirt, shorts or a dress when the adjusted feels-like temperature is at or below this.
export const TIGHTS_AT_OR_BELOW_C = 12;
// With tights on, the skirt, shorts or dress can be one step lighter.
const WARMTH_DROP_WITH_TIGHTS = 1;
const MAX_TIGHTS_CANDIDATES = 3;
// In the rain a jacket or coat is a better choice than a hoodie.
const RAIN_OUTERWEAR_BONUS = 0.2;

type OutfitSlot = "top" | "bottom" | "shoes";
const OUTFIT_SLOTS: OutfitSlot[] = ["top", "bottom", "shoes"];

export type LayerReason = "cool" | "wet" | "cool and wet";

// Whether the weather calls for a layer, and why. (runs_cold lowers the temperature we plan for, runs_hot raises it.)
export function layerReason(weather: WeatherSnapshot, comfort: TempComfort): LayerReason | null {
  const cool = weather.feels_like_c + COMFORT_OFFSET_C[comfort] <= LAYER_AT_OR_BELOW_C;
  if (cool && weather.is_precipitating) return "cool and wet";
  if (cool) return "cool";
  if (weather.is_precipitating) return "wet";
  return null;
}

// Whether it is cold enough for bare legs to need tights.
export function legsCold(weather: WeatherSnapshot, comfort: TempComfort): boolean {
  return weather.feels_like_c + COMFORT_OFFSET_C[comfort] <= TIGHTS_AT_OR_BELOW_C;
}

export interface OutfitInput {
  garments: Garment[];
  weather: WeatherSnapshot;
  preferences: PreferenceEntry[];
  tempComfort: TempComfort;
  date: ISODate;
  // Garment id sets of previously rejected suggestions (re-roll).
  excludedOutfits?: UUID[][];
  // Style Swipe ideas (purpose "explore") are only for training the AI, so laundry status is ignored.
  includeDirty?: boolean;
}

export function garmentTags(g: Pick<Garment, "type" | "colors" | "seasons">): string[] {
  return [`type:${g.type}`, ...g.colors.map((c) => `color:${c}`), ...g.seasons.map((s) => `season:${s}`)];
}

export function targetWarmth(weather: WeatherSnapshot, comfort: TempComfort): 1 | 2 | 3 | 4 | 5 {
  const t = weather.feels_like_c + COMFORT_OFFSET_C[comfort];
  if (t <= 0) return 5;
  if (t <= 8) return 4;
  if (t <= 16) return 3;
  if (t <= 24) return 2;
  return 1;
}

export function seasonOf(date: ISODate): Exclude<Season, "all"> {
  const month = Number(date.slice(5, 7)); // northern hemisphere
  if (month === 12 || month <= 2) return "winter";
  if (month <= 5) return "spring";
  if (month <= 8) return "summer";
  return "fall";
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = (d: ISODate) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return Math.round((ms(to) - ms(from)) / 86_400_000);
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function preferenceScore(g: Garment, weights: Map<string, number>): number {
  // The type and the colors count as two equal halves, so a garment with three colors is not
  // pulled around by its colors more than a one-color garment of the same type.
  const tags = garmentTags(g).filter((t) => !t.startsWith("season:"));
  const typeWeight = weights.get(`type:${g.type}`) ?? 0;
  const colorTags = tags.filter((t) => t.startsWith("color:"));
  const colorWeight = colorTags.reduce((acc, tag) => acc + (weights.get(tag) ?? 0), 0) / colorTags.length;
  return clamp((typeWeight + colorWeight) / 2, -1, 1);
}

function repeatPenalty(g: Garment, date: ISODate): number {
  if (g.last_worn_date === null) return 0;
  const days = daysBetween(g.last_worn_date, date);
  if (days <= 0) return 1;
  return clamp(1 - days / REPEAT_WINDOW_DAYS, 0, 1);
}

function weatherFit(g: Garment, target: number, season: Exclude<Season, "all">, weather: WeatherSnapshot): number {
  const warmthFit = 1 - Math.abs(g.warmth - target) / 4;
  const seasonFit = g.seasons.includes("all") || g.seasons.includes(season) ? 1 : 0.3;
  let fit = WEATHER_SHARE.warmth * warmthFit + WEATHER_SHARE.season * seasonFit;
  if (weather.is_precipitating && g.type === "sandals") fit -= SANDALS_IN_RAIN_PENALTY;
  return fit;
}

interface ScoredGarment {
  garment: Garment;
  // The score on its own, and the score when a layer is worn over it (a top or dress can then be lighter).
  score: number;
  scoreUnderLayer: number;
  // The score when tights are worn under it (a skirt, shorts or dress can then be lighter).
  scoreWithTights: number;
  preference: number;
  repeat: number;
}

const outfitKey = (ids: UUID[]) => [...ids].sort().join("|");

export function scoreOutfit(input: OutfitInput): OutfitResult {
  const { garments, weather, date } = input;
  const target = targetWarmth(weather, input.tempComfort);
  const targetUnderLayer = Math.max(1, target - WARMTH_DROP_WITH_LAYER);
  const targetWithTights = Math.max(1, target - WARMTH_DROP_WITH_TIGHTS);
  const season = seasonOf(date);
  const weights = new Map(input.preferences.map((p) => [p.tag, p.weight]));
  const reason = layerReason(weather, input.tempComfort);
  const coldLegs = legsCold(weather, input.tempComfort);

  const tops: ScoredGarment[] = [];
  const bottoms: ScoredGarment[] = [];
  const shoes: ScoredGarment[] = [];
  const dresses: ScoredGarment[] = [];
  const outerwear: ScoredGarment[] = [];
  const overTops: ScoredGarment[] = []; // hoodies and sweaters, as a layer over a lighter top
  const tights: ScoredGarment[] = [];

  const score = (garment: Garment, goal: number, bonus = 0): number => {
    const preference = preferenceScore(garment, weights);
    const repeat = repeatPenalty(garment, date);
    return (
      WEIGHTS.weather * (weatherFit(garment, goal, season, weather) + bonus) +
      WEIGHTS.preference * preference -
      WEIGHTS.repeat * repeat
    );
  };
  const scored = (garment: Garment, base: number, underLayer: number, withTights = base): ScoredGarment => ({
    garment,
    score: base,
    scoreUnderLayer: underLayer,
    scoreWithTights: withTights,
    preference: preferenceScore(garment, weights),
    repeat: repeatPenalty(garment, date),
  });

  for (const garment of garments) {
    if (garment.status !== "clean" && !input.includeDirty) continue;
    const role = baseRole(garment.type);
    if (role === null) continue; // accessories are not part of an outfit
    const plain = score(garment, target);
    const lighter = score(garment, targetUnderLayer);
    const withTights = showsLegs(garment.type) ? score(garment, targetWithTights) : plain;
    if (role === "top") {
      tops.push(scored(garment, plain, lighter));
      // A hoodie or sweater can also be the layer, but only when it is cool (not merely wet).
      if (isOverTop(garment.type) && (reason === "cool" || reason === "cool and wet")) {
        overTops.push(scored(garment, plain, plain));
      }
    } else if (role === "bottom") bottoms.push(scored(garment, plain, plain, withTights));
    else if (role === "shoes") shoes.push(scored(garment, plain, plain));
    // A dress stands in for the top AND the bottom, so it has to be as warm as both together: unlike a top it does not
    // get the lighter target under a layer (otherwise a dress beat a warm top and bottom on a freezing day).
    else if (role === "dress") dresses.push(scored(garment, plain, plain, withTights));
    else if (role === "tights") tights.push(scored(garment, plain, plain));
    else if (role === "layer") {
      const withBonus = score(garment, target, weather.is_precipitating ? RAIN_OUTERWEAR_BONUS : 0);
      outerwear.push(scored(garment, withBonus, withBonus));
    }
  }

  const hasSet = tops.length > 0 && bottoms.length > 0;
  const hasDress = dresses.length > 0;
  if (shoes.length === 0 || !(hasSet || hasDress)) {
    const missing = OUTFIT_SLOTS.filter((slot) => {
      if (slot === "shoes") return shoes.length === 0;
      if (hasDress) return false; // a dress stands in for the top and the bottom
      return (slot === "top" ? tops : bottoms).length === 0;
    });
    return {
      status: "incomplete",
      missing_slots: missing,
      reasoning: `No clean ${missing.join(", ")} available.`,
    };
  }

  const byBest = (a: ScoredGarment, b: ScoredGarment) =>
    Math.max(b.score, b.scoreUnderLayer) - Math.max(a.score, a.scoreUnderLayer) || a.garment.id.localeCompare(b.garment.id);
  const best15 = (list: ScoredGarment[]) => [...list].sort(byBest).slice(0, MAX_CANDIDATES_PER_SLOT);
  const topList = best15(tops);
  const bottomList = best15(bottoms);
  const shoeList = best15(shoes);
  const dressList = best15(dresses);
  const outerList = best15(outerwear);
  const overList = best15(overTops);
  // Tights only matter when it is cold enough for bare legs to need them, and only the best few are tried.
  const tightsList = coldLegs ? [...tights].sort(byBest).slice(0, MAX_TIGHTS_CANDIDATES) : [];

  const excluded = new Set((input.excludedOutfits ?? []).map(outfitKey));
  interface Candidate {
    outfit: Outfit;
    items: ScoredGarment[];
    layer: ScoredGarment | null;
    tights: ScoredGarment | null;
    score: number;
    key: string;
  }
  let bestPlain: Candidate | null = null;
  let bestLayered: Candidate | null = null;
  // `points` are the scores of the pieces (their mean is the outfit score); `top` is the garment under a layer, for the bulk rule.
  const offer = (
    outfit: Outfit,
    items: ScoredGarment[],
    layer: ScoredGarment | null,
    tightsPiece: ScoredGarment | null,
    points: number[],
    top?: ScoredGarment,
  ) => {
    const pieces = [...items, ...(layer ? [layer] : []), ...(tightsPiece ? [tightsPiece] : [])];
    const key = outfitKey(pieces.map((i) => i.garment.id));
    if (excluded.has(key)) return;
    const penalty = stylePenalty({
      pieces: pieces.map((p) => p.garment),
      top: top?.garment,
      layer: layer?.garment,
      targetWarmth: target,
    });
    const value = points.reduce((a, b) => a + b, 0) / points.length - penalty;
    const candidate: Candidate = { outfit, items, layer, tights: tightsPiece, score: value, key };
    const better = (current: Candidate | null) =>
      current === null || value > current.score || (value === current.score && key < current.key);
    if (layer === null) {
      if (better(bestPlain)) bestPlain = candidate;
    } else if (better(bestLayered)) bestLayered = candidate;
  };

  // Bare legs in the cold get tights when there are any: a skirt, shorts or dress is only offered with a pair. With no
  // tights in the closet nothing changes: they are offered on their own and the warmth score decides.
  const coldBareLegs = tightsList.length > 0;

  const layers = reason === null ? [] : [...outerList, ...overList];
  for (const shoe of shoeList) {
    // Top + bottom + shoes, with a layer when the weather calls for one, and tights under a skirt or shorts when it is cold.
    for (const t of topList) {
      for (const b of bottomList) {
        const bare = showsLegs(b.garment.type);
        const tightsOptions: (ScoredGarment | null)[] = bare && coldBareLegs ? tightsList : [null];
        for (const tp of tightsOptions) {
          // Tights make a skirt or shorts one step lighter; without them it is scored as it is.
          const bottomScore = tp ? b.scoreWithTights : b.score;
          const base: Outfit = { top: t.garment.id, bottom: b.garment.id, shoes: shoe.garment.id, ...(tp ? { tights: tp.garment.id } : {}) };
          const tightsPoints = tp ? [tp.score] : [];
          offer(base, [t, b, shoe], null, tp, [t.score, bottomScore, shoe.score, ...tightsPoints]);
          for (const l of layers) {
            // A hoodie or sweater goes over a lighter top, never over another hoodie or sweater (so never over itself).
            // Jackets and coats are not tops, so they cannot be the same garment as the top.
            if (isOverTop(l.garment.type) && !isLightTop(t.garment.type)) continue;
            offer({ ...base, layer: l.garment.id }, [t, b, shoe], l, tp, [t.scoreUnderLayer, bottomScore, shoe.score, l.score, ...tightsPoints], t);
          }
        }
      }
    }
    // Dress + shoes: a dress stands in for the top and the bottom. Only jackets and coats go over a dress.
    for (const d of dressList) {
      const tightsOptions: (ScoredGarment | null)[] = coldBareLegs ? tightsList : [null];
      for (const tp of tightsOptions) {
        const dressScore = tp ? d.scoreWithTights : d.score;
        const tightsPoints = tp ? [tp.score] : [];
        const base: Outfit = { dress: d.garment.id, shoes: shoe.garment.id, ...(tp ? { tights: tp.garment.id } : {}) };
        offer(base, [d, shoe], null, tp, [dressScore, shoe.score, ...tightsPoints]);
        if (reason === null) continue;
        for (const l of outerList) {
          offer({ ...base, layer: l.garment.id }, [d, shoe], l, tp, [dressScore, shoe.score, l.score, ...tightsPoints]);
        }
      }
    }
  }

  // When the weather calls for a layer and one fits, the outfit has it; otherwise it goes without.
  const winner = (bestLayered ?? bestPlain) as Candidate | null;
  if (winner === null) {
    return { status: "exhausted", reasoning: "Every available combination was already rejected." };
  }

  return {
    status: "ok",
    outfit: winner.outfit,
    score: Math.round(winner.score * 1000) / 1000,
    reasoning: explain(winner.items, weather, winner.layer && reason ? { piece: winner.layer, reason } : null, winner.tights, target),
  };
}

function explain(
  items: ScoredGarment[],
  weather: WeatherSnapshot,
  layer: { piece: ScoredGarment; reason: LayerReason } | null,
  tightsPiece: ScoredGarment | null,
  target: number,
): string {
  const shown = [...items, ...(layer ? [layer.piece] : []), ...(tightsPiece ? [tightsPiece] : [])];
  const parts = [
    `Feels like ${Math.round(weather.feels_like_c)}°C${weather.is_precipitating ? " and wet" : ""}, aiming for warmth ${target}.`,
    `Picked ${shown.map((i) => `${i.garment.colors[0]} ${i.garment.type.replace("_", " ")}`).join(", ")}.`,
  ];
  if (layer) {
    parts.push(`Added a ${layer.piece.garment.type.replace("_", " ")} because it is ${layer.reason}.`);
  }
  if (tightsPiece) parts.push("Added tights because it is cold for bare legs.");
  if (shown.some((i) => i.repeat === 0)) parts.push("Includes items not worn recently.");
  if (shown.reduce((acc, i) => acc + i.preference, 0) / shown.length > 0.05) {
    parts.push("Matches your style preferences.");
  }
  return parts.join(" ");
}
