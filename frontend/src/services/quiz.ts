// Cold-start style quiz (D8): what the screen offers, how answers are combined, and
// saving them. Pure TypeScript with an injected gateway so it is unit-tested
// without React Native or a network (see tests/quiz.test.ts).
//
// Turning answers into starting weights is the AI core's job (quizToPreferences,
// owned by Manuel + Claude); this file only collects and stores them.
import { quizToPreferences } from "../../../supabase/functions/_shared/preferences.ts";
import type { Color } from "../../../supabase/functions/_shared/tag-schema.ts";
import type { Occasion, QuizAnswers, StyleVibe, TempComfort } from "../../../supabase/functions/_shared/types.ts";
import { done, type HouseholdGateway, type Result } from "./household.ts";

export const STYLE_OPTIONS: { value: StyleVibe; label: string }[] = [
  { value: "casual", label: "Casual" },
  { value: "smart_casual", label: "Smart casual" },
  { value: "streetwear", label: "Streetwear" },
  { value: "sporty", label: "Sporty" },
  { value: "formal", label: "Formal" },
];

export const OCCASION_OPTIONS: { value: Occasion; label: string }[] = [
  { value: "school", label: "School" },
  { value: "work", label: "Work" },
  { value: "gym", label: "Gym" },
  { value: "going_out", label: "Going out" },
  { value: "home", label: "At home" },
];

export const TEMP_OPTIONS: { value: TempComfort; label: string }[] = [
  { value: "runs_cold", label: "Cold" },
  { value: "neutral", label: "In between" },
  { value: "runs_hot", label: "Warm" },
];

export type ColorGroupId = "black_white" | "neutrals" | "earth" | "bright";

// The screen offers friendly color groups; the AI contract wants exact colors.
// The groups split the tag schema's colors with no overlap, so a color is never
// both liked and avoided through two different groups.
export const COLOR_GROUPS: { id: ColorGroupId; label: string; colors: Color[] }[] = [
  { id: "black_white", label: "Black and white", colors: ["black", "white"] },
  { id: "neutrals", label: "Neutrals", colors: ["gray", "beige", "navy"] },
  { id: "earth", label: "Earth tones", colors: ["brown", "green", "orange"] },
  { id: "bright", label: "Bright colors", colors: ["red", "pink", "yellow", "purple", "blue", "multicolor"] },
];

export interface QuizDraft {
  style_vibes: StyleVibe[];
  occasions: Occasion[];
  favorite_groups: ColorGroupId[];
  avoided_groups: ColorGroupId[];
  temp_comfort: TempComfort;
}

export function emptyQuizDraft(): QuizDraft {
  return { style_vibes: [], occasions: [], favorite_groups: [], avoided_groups: [], temp_comfort: "neutral" };
}

function toggle<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export const toggleStyle = (draft: QuizDraft, vibe: StyleVibe): QuizDraft => ({
  ...draft,
  style_vibes: toggle(draft.style_vibes, vibe),
});

export const toggleOccasion = (draft: QuizDraft, occasion: Occasion): QuizDraft => ({
  ...draft,
  occasions: toggle(draft.occasions, occasion),
});

export const setTempComfort = (draft: QuizDraft, temp_comfort: TempComfort): QuizDraft => ({ ...draft, temp_comfort });

// Choosing a group as liked takes it off the avoided list, and the other way round.
export function toggleFavoriteGroup(draft: QuizDraft, group: ColorGroupId): QuizDraft {
  const favorite_groups = toggle(draft.favorite_groups, group);
  const avoided_groups = favorite_groups.includes(group)
    ? draft.avoided_groups.filter((g) => g !== group)
    : draft.avoided_groups;
  return { ...draft, favorite_groups, avoided_groups };
}

export function toggleAvoidedGroup(draft: QuizDraft, group: ColorGroupId): QuizDraft {
  const avoided_groups = toggle(draft.avoided_groups, group);
  const favorite_groups = avoided_groups.includes(group)
    ? draft.favorite_groups.filter((g) => g !== group)
    : draft.favorite_groups;
  return { ...draft, favorite_groups, avoided_groups };
}

// Everything else is optional: a person may genuinely have no colors to avoid.
export function validateQuiz(draft: QuizDraft): string | null {
  if (draft.style_vibes.length === 0) return "Pick at least one style.";
  return null;
}

function colorsFor(groups: readonly ColorGroupId[]): Color[] {
  return COLOR_GROUPS.filter((g) => groups.includes(g.id)).flatMap((g) => g.colors);
}

export function draftToAnswers(draft: QuizDraft): QuizAnswers {
  return {
    style_vibes: [...draft.style_vibes],
    temp_comfort: draft.temp_comfort,
    occasions: [...draft.occasions],
    favorite_colors: colorsFor(draft.favorite_groups),
    avoided_colors: colorsFor(draft.avoided_groups),
  };
}

// Seeds the user's starting preferences and marks the quiz as finished.
// First-time use only: saving again would overwrite what thumbs up/down have since taught.
export async function saveQuiz(gateway: Pick<HouseholdGateway, "saveQuiz">, draft: QuizDraft): Promise<Result<QuizAnswers>> {
  const problem = validateQuiz(draft);
  if (problem) return { ok: false, error: problem };
  const answers = draftToAnswers(draft);
  const saved = await done(() => gateway.saveQuiz(answers, quizToPreferences(answers)));
  return saved.ok ? { ok: true, value: answers } : saved;
}
