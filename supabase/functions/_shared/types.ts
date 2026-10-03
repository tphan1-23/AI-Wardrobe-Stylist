// Shared contracts between the React app, the Supabase edge functions and the
// AI core. Change these only via a reviewed PR and update docs/api_endpoints.md.
import type { Color, GarmentType, Season, Slot, Warmth } from "./tag-schema.ts";

export type ISODate = string; // YYYY-MM-DD
export type UUID = string;

// ---- Data model (mirrors supabase/migrations once written) -----------------

export type GarmentStatus = "clean" | "dirty";

export interface GarmentTags {
  type: GarmentType;
  color: Color;
  season: Season;
  warmth: Warmth;
}

// Garments belong to the household (shared closet); added_by is informational.
export interface Garment extends GarmentTags {
  id: UUID;
  household_id: UUID;
  added_by: UUID;
  image_path: string; // private storage path, served via signed URL
  status: GarmentStatus;
  last_worn_date: ISODate | null;
}

export interface UserProfile {
  id: UUID;
  household_id: UUID;
  name: string;
  location: string | null; // per-user weather location (city / ZIP)
  quiz_preferences: QuizAnswers | null;
}

// Preference tags are namespaced strings: "style:casual", "color:black",
// "type:jeans", "occasion:work", "warmth:high".
export type PreferenceTag = string;

export interface PreferenceEntry {
  tag: PreferenceTag;
  weight: number;
}

export type FeedbackValue = "up" | "down";

export type Outfit = Record<Exclude<Slot, "other">, UUID>; // top, bottom, shoes

export interface Suggestion {
  id: UUID;
  user_id: UUID;
  date: ISODate;
  garment_ids: UUID[];
  feedback: FeedbackValue | null;
  accepted: boolean;
}

// ---- Cold-start quiz --------------------------------------------------------

export const STYLE_VIBES = ["casual", "smart_casual", "streetwear", "sporty", "formal"] as const;
export type StyleVibe = (typeof STYLE_VIBES)[number];

export const OCCASIONS = ["school", "work", "gym", "going_out", "home"] as const;
export type Occasion = (typeof OCCASIONS)[number];

export type TempComfort = "runs_cold" | "neutral" | "runs_hot";

export interface QuizAnswers {
  style_vibes: StyleVibe[];
  temp_comfort: TempComfort;
  occasions: Occasion[];
  favorite_colors: Color[];
  avoided_colors: Color[];
}

// ---- Weather ---------------------------------------------------------------

export interface WeatherSnapshot {
  temp_c: number;
  feels_like_c: number;
  is_precipitating: boolean;
}

// ---- Edge function: analyze-garment ---------------------------------------
// Proposes tags only. The client shows them in the review/edit screen and
// saves the garment row after the user confirms (D4).

export interface AnalyzeGarmentRequest {
  image_path: string;
}

// Fields the model got wrong, left out or was unsure about are absent from
// `tags` or listed in `needs_review`; the review screen must make the user
// fill/confirm them before the garment is saved.
export interface AnalyzeGarmentResponse {
  tags: Partial<GarmentTags>;
  confidence: Partial<Record<keyof GarmentTags, number>>; // 0..1 per field
  needs_review: (keyof GarmentTags)[];
  warnings: string[];
}

// ---- Edge function: generate-outfit ---------------------------------------
// User and location come from the authenticated profile (D5), not the body.

export interface GenerateOutfitRequest {
  date: ISODate;
  exclude_suggestion_ids?: UUID[]; // re-roll after thumbs down (D9)
}

// Pure result of the scoring engine (no persistence).
export type OutfitResult =
  | { status: "ok"; outfit: Outfit; score: number; reasoning: string }
  | { status: "incomplete"; missing_slots: Exclude<Slot, "other">[]; reasoning: string }
  // Every valid combination was already rejected (re-roll ran out of options).
  | { status: "exhausted"; reasoning: string };

// The edge function persists an "ok" result and adds the suggestion id.
export type GenerateOutfitResponse =
  | (Extract<OutfitResult, { status: "ok" }> & { suggestion_id: UUID })
  | Exclude<OutfitResult, { status: "ok" }>;

// ---- Accepting a suggestion (marks items worn, D3) --------------------------

export interface AcceptSuggestionRequest {
  suggestion_id: UUID;
}

// ---- Edge function: update-preferences --------------------------------------

export interface UpdatePreferencesRequest {
  suggestion_id: UUID;
  feedback: FeedbackValue;
}

export interface UpdatePreferencesResponse {
  suggestion_id: UUID;
  updated_tags: PreferenceTag[];
}
