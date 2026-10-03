// Outfit scoring engine: pure, deterministic, no I/O. Imported by the
// generate-outfit edge function and tested directly with fixtures.
import { slotForType, type Season } from "./tag-schema.ts";
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

export const WEIGHTS = { weather: 0.5, preference: 0.3, repeat: 0.4 } as const;
export const REPEAT_WINDOW_DAYS = 7;
export const MAX_CANDIDATES_PER_SLOT = 15;
const COMFORT_OFFSET_C: Record<TempComfort, number> = { runs_cold: -3, neutral: 0, runs_hot: 3 };
const WEATHER_SHARE = { warmth: 0.8, season: 0.2 } as const;
const SANDALS_IN_RAIN_PENALTY = 0.5;

type OutfitSlot = "top" | "bottom" | "shoes";
const OUTFIT_SLOTS: OutfitSlot[] = ["top", "bottom", "shoes"];

export interface OutfitInput {
  garments: Garment[];
  weather: WeatherSnapshot;
  preferences: PreferenceEntry[];
  tempComfort: TempComfort;
  date: ISODate;
  // Garment id sets of previously rejected suggestions (re-roll).
  excludedOutfits?: UUID[][];
}

export function garmentTags(g: Pick<Garment, "type" | "color" | "season">): string[] {
  return [`type:${g.type}`, `color:${g.color}`, `season:${g.season}`];
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
  const tags = garmentTags(g);
  const sum = tags.reduce((acc, tag) => acc + (weights.get(tag) ?? 0), 0);
  return clamp(sum / tags.length, -1, 1);
}

function repeatPenalty(g: Garment, date: ISODate): number {
  if (g.last_worn_date === null) return 0;
  const days = daysBetween(g.last_worn_date, date);
  if (days <= 0) return 1;
  return clamp(1 - days / REPEAT_WINDOW_DAYS, 0, 1);
}

function weatherFit(g: Garment, target: number, season: Exclude<Season, "all">, weather: WeatherSnapshot): number {
  const warmthFit = 1 - Math.abs(g.warmth - target) / 4;
  const seasonFit = g.season === "all" || g.season === season ? 1 : 0.3;
  let fit = WEATHER_SHARE.warmth * warmthFit + WEATHER_SHARE.season * seasonFit;
  if (weather.is_precipitating && g.type === "sandals") fit -= SANDALS_IN_RAIN_PENALTY;
  return fit;
}

interface ScoredGarment {
  garment: Garment;
  score: number;
  preference: number;
  repeat: number;
}

const outfitKey = (ids: UUID[]) => [...ids].sort().join("|");

export function scoreOutfit(input: OutfitInput): OutfitResult {
  const { garments, weather, date } = input;
  const target = targetWarmth(weather, input.tempComfort);
  const season = seasonOf(date);
  const weights = new Map(input.preferences.map((p) => [p.tag, p.weight]));

  const bySlot: Record<OutfitSlot, ScoredGarment[]> = { top: [], bottom: [], shoes: [] };
  for (const garment of garments) {
    if (garment.status !== "clean") continue;
    const slot = slotForType(garment.type);
    if (slot === "other") continue;
    const preference = preferenceScore(garment, weights);
    const repeat = repeatPenalty(garment, date);
    const score =
      WEIGHTS.weather * weatherFit(garment, target, season, weather) +
      WEIGHTS.preference * preference -
      WEIGHTS.repeat * repeat;
    bySlot[slot].push({ garment, score, preference, repeat });
  }

  const missing = OUTFIT_SLOTS.filter((s) => bySlot[s].length === 0);
  if (missing.length > 0) {
    return {
      status: "incomplete",
      missing_slots: missing,
      reasoning: `No clean ${missing.join(", ")} available.`,
    };
  }

  const byBest = (a: ScoredGarment, b: ScoredGarment) =>
    b.score - a.score || a.garment.id.localeCompare(b.garment.id);
  const [tops, bottoms, shoes] = OUTFIT_SLOTS.map((s) =>
    bySlot[s].sort(byBest).slice(0, MAX_CANDIDATES_PER_SLOT),
  ) as [ScoredGarment[], ScoredGarment[], ScoredGarment[]];

  const excluded = new Set((input.excludedOutfits ?? []).map(outfitKey));
  let best: { items: [ScoredGarment, ScoredGarment, ScoredGarment]; score: number; key: string } | null = null;
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const key = outfitKey([top.garment.id, bottom.garment.id, shoe.garment.id]);
        if (excluded.has(key)) continue;
        const score = (top.score + bottom.score + shoe.score) / 3;
        if (best === null || score > best.score || (score === best.score && key < best.key)) {
          best = { items: [top, bottom, shoe], score, key };
        }
      }
    }
  }

  if (best === null) {
    return { status: "exhausted", reasoning: "Every available combination was already rejected." };
  }

  const [top, bottom, shoe] = best.items;
  const outfit: Outfit = { top: top.garment.id, bottom: bottom.garment.id, shoes: shoe.garment.id };
  return {
    status: "ok",
    outfit,
    score: Math.round(best.score * 1000) / 1000,
    reasoning: explain(best.items, weather, target),
  };
}

function explain(items: ScoredGarment[], weather: WeatherSnapshot, target: number): string {
  const parts = [
    `Feels like ${Math.round(weather.feels_like_c)}°C${weather.is_precipitating ? " and wet" : ""}, aiming for warmth ${target}.`,
    `Picked ${items.map((i) => `${i.garment.color} ${i.garment.type.replace("_", " ")}`).join(", ")}.`,
  ];
  if (items.some((i) => i.repeat === 0)) parts.push("Includes items not worn recently.");
  if (items.reduce((acc, i) => acc + i.preference, 0) / items.length > 0.05) {
    parts.push("Matches your style preferences.");
  }
  return parts.join(" ");
}
