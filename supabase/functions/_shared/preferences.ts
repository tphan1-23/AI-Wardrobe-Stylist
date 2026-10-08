// Preference learning: quiz answers -> initial preference vector, and
// thumbs up/down -> weight updates. Pure functions, no I/O.
import { garmentTags } from "./scoring.ts";
import type { GarmentType } from "./tag-schema.ts";
import type { Garment, Occasion, PreferenceEntry, QuizAnswers, StyleVibe, FeedbackValue } from "./types.ts";

export const COLOR_WEIGHT = 0.6;
export const STYLE_WEIGHT = 0.4;
export const OCCASION_WEIGHT = 0.2;
// A thumbs-down teaches faster than a thumbs-up, and tags already earned by
// thumbs-ups resist a single thumbs-down (whole-outfit feedback blames innocent
// items too). Values chosen by simulation, see brain/AI Logic Ownership.md.
export const LEARNING_RATE_UP = 0.1;
export const LEARNING_RATE_DOWN = 0.2;
export const DOWN_RESISTANCE = 0.5;

// Garments carry no style/occasion tags, so quiz answers are expressed as
// affinity for the garment types that fit them (the tags scoring can match).
export const STYLE_TYPES: Record<StyleVibe, GarmentType[]> = {
  casual: ["t_shirt", "jeans", "sneakers", "hoodie"],
  smart_casual: ["shirt", "sweater", "trousers", "dress_shoes"],
  streetwear: ["hoodie", "t_shirt", "sweatpants", "sneakers"],
  sporty: ["tank_top", "shorts", "leggings", "sweatpants", "sneakers"],
  formal: ["shirt", "blouse", "trousers", "skirt", "dress_shoes"],
};

export const OCCASION_TYPES: Record<Occasion, GarmentType[]> = {
  school: ["t_shirt", "hoodie", "jeans", "sneakers"],
  work: ["shirt", "blouse", "sweater", "trousers", "skirt", "dress_shoes"],
  gym: ["tank_top", "shorts", "leggings", "sweatpants", "sneakers"],
  going_out: ["shirt", "blouse", "jeans", "skirt", "boots", "dress_shoes"],
  home: ["t_shirt", "hoodie", "sweatpants", "leggings"],
};

const clamp = (n: number) => Math.min(1, Math.max(-1, n));
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

// temp_comfort is not part of the vector: the edge function reads it from the
// profile's quiz_preferences and passes it to scoring.
export function quizToPreferences(quiz: QuizAnswers): PreferenceEntry[] {
  const weights = new Map<string, number>();
  const add = (tag: string, delta: number) => weights.set(tag, clamp((weights.get(tag) ?? 0) + delta));

  for (const vibe of new Set(quiz.style_vibes)) {
    for (const type of STYLE_TYPES[vibe]) add(`type:${type}`, STYLE_WEIGHT);
  }
  for (const occasion of new Set(quiz.occasions)) {
    for (const type of OCCASION_TYPES[occasion]) add(`type:${type}`, OCCASION_WEIGHT);
  }
  for (const color of new Set(quiz.favorite_colors)) add(`color:${color}`, COLOR_WEIGHT);
  // Avoiding a color beats liking it if the user picked both.
  for (const color of new Set(quiz.avoided_colors)) weights.set(`color:${color}`, -COLOR_WEIGHT);

  return [...weights]
    .filter(([, weight]) => weight !== 0)
    .map(([tag, weight]) => ({ tag, weight: round4(weight) }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

// Taste is learned on type and color only; season is a weather concern.
// Returns just the entries that changed, for the caller to upsert.
export function applyFeedback(
  current: PreferenceEntry[],
  suggested: Garment[],
  feedback: FeedbackValue,
): PreferenceEntry[] {
  const weights = new Map(current.map((p) => [p.tag, p.weight]));
  const tags = new Set(
    suggested.flatMap(garmentTags).filter((tag) => tag.startsWith("type:") || tag.startsWith("color:")),
  );
  return [...tags].sort().map((tag) => {
    const w = weights.get(tag) ?? 0;
    // Steps shrink near the bounds, so weights approach but never reach +/-1.
    const next =
      feedback === "up"
        ? w + LEARNING_RATE_UP * (1 - w)
        : w - LEARNING_RATE_DOWN * (1 + w) * (1 - DOWN_RESISTANCE * Math.max(0, w));
    return { tag, weight: round4(next) };
  });
}
