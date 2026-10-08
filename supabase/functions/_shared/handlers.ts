// Request handlers for the generate-outfit and update-preferences edge functions.
// All I/O is injected, so the logic is unit-tested without Deno or a database;
// the Deno entry files only wire real Supabase/OpenWeatherMap calls into Deps.
import { applyFeedback } from "./preferences.ts";
import { scoreOutfit } from "./scoring.ts";
import type {
  FeedbackValue,
  GenerateOutfitRequest,
  GenerateOutfitResponse,
  Garment,
  ISODate,
  PreferenceEntry,
  Suggestion,
  UpdatePreferencesRequest,
  UpdatePreferencesResponse,
  UserProfile,
  UUID,
  WeatherSnapshot,
} from "./types.ts";

export type HandlerStatus = 400 | 403 | 404 | 409 | 429 | 502;
export type HandlerResult<T> = { ok: true; body: T } | { ok: false; status: HandlerStatus; error: string };

export const fail = (status: HandlerStatus, error: string) => ({ ok: false, status, error }) as const;

export const MAX_EXCLUDED_SUGGESTIONS = 50;

function isRealDate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = new Date(`${value}T00:00:00Z`).getTime();
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(value);
}

const isUuidList = (v: unknown): v is UUID[] => Array.isArray(v) && v.every((x) => typeof x === "string");

// ---- generate-outfit --------------------------------------------------------

export interface GenerateOutfitDeps {
  getProfile(userId: UUID): Promise<UserProfile | null>;
  // The user's own closet only (D18): suggestions never use a housemate's clothes.
  getOwnGarments(userId: UUID): Promise<Garment[]>;
  getPreferences(userId: UUID): Promise<PreferenceEntry[]>;
  getWeather(location: string): Promise<WeatherSnapshot>;
  // Garment ids of earlier suggestions of this user (for re-roll exclusion).
  getSuggestionGarmentIds(userId: UUID, suggestionIds: UUID[]): Promise<UUID[][]>;
  saveSuggestion(row: { user_id: UUID; date: ISODate; garment_ids: UUID[] }): Promise<UUID>;
}

export async function handleGenerateOutfit(
  userId: UUID,
  request: GenerateOutfitRequest,
  deps: GenerateOutfitDeps,
): Promise<HandlerResult<GenerateOutfitResponse>> {
  if (!isRealDate(request?.date)) return fail(400, "date must be a valid YYYY-MM-DD");
  const exclude = request.exclude_suggestion_ids ?? [];
  if (!isUuidList(exclude) || exclude.length > MAX_EXCLUDED_SUGGESTIONS) {
    return fail(400, `exclude_suggestion_ids must be a list of at most ${MAX_EXCLUDED_SUGGESTIONS} ids`);
  }

  const profile = await deps.getProfile(userId);
  if (profile === null) return fail(404, "profile not found");
  if (!profile.location?.trim()) return fail(409, "set your location first");

  let weather: WeatherSnapshot;
  try {
    weather = await deps.getWeather(profile.location);
  } catch {
    return fail(502, "weather is unavailable right now");
  }

  const [garments, preferences, excludedOutfits] = await Promise.all([
    deps.getOwnGarments(userId),
    deps.getPreferences(userId),
    exclude.length > 0 ? deps.getSuggestionGarmentIds(userId, exclude) : Promise.resolve([]),
  ]);

  const result = scoreOutfit({
    garments,
    weather,
    preferences,
    tempComfort: profile.quiz_preferences?.temp_comfort ?? "neutral",
    date: request.date,
    excludedOutfits,
  });
  if (result.status !== "ok") return { ok: true, body: result };

  const suggestionId = await deps.saveSuggestion({
    user_id: userId,
    date: request.date,
    garment_ids: [result.outfit.top, result.outfit.bottom, result.outfit.shoes],
  });
  return { ok: true, body: { ...result, suggestion_id: suggestionId } };
}

// ---- update-preferences -----------------------------------------------------

export interface UpdatePreferencesDeps {
  // Must only return suggestions owned by userId.
  getSuggestion(userId: UUID, suggestionId: UUID): Promise<Suggestion | null>;
  // Only garments owned by userId; anything else is ignored.
  getOwnGarmentsByIds(userId: UUID, ids: UUID[]): Promise<Garment[]>;
  getPreferences(userId: UUID): Promise<PreferenceEntry[]>;
  upsertPreferences(userId: UUID, entries: PreferenceEntry[]): Promise<void>;
  // Atomically stores feedback only if none exists yet (UPDATE ... WHERE feedback IS NULL).
  // Returns false when another request already claimed it.
  claimFeedback(suggestionId: UUID, feedback: FeedbackValue): Promise<boolean>;
}

export async function handleUpdatePreferences(
  userId: UUID,
  request: UpdatePreferencesRequest,
  deps: UpdatePreferencesDeps,
): Promise<HandlerResult<UpdatePreferencesResponse>> {
  if (typeof request?.suggestion_id !== "string" || request.suggestion_id === "") {
    return fail(400, "suggestion_id is required");
  }
  if (request.feedback !== "up" && request.feedback !== "down") return fail(400, 'feedback must be "up" or "down"');

  const suggestion = await deps.getSuggestion(userId, request.suggestion_id);
  if (suggestion === null) return fail(404, "suggestion not found");
  // Claim first: if the weight update below fails we lose one lesson, but a retry or a second
  // submission can never count the same outfit twice.
  if (!(await deps.claimFeedback(suggestion.id, request.feedback))) {
    return fail(409, "feedback was already recorded for this suggestion");
  }

  const garments = await deps.getOwnGarmentsByIds(userId, suggestion.garment_ids);
  const current = await deps.getPreferences(userId);
  const updates = applyFeedback(current, garments, request.feedback);

  // Deleted garments simply contribute nothing; the feedback itself is still stored.
  if (updates.length > 0) await deps.upsertPreferences(userId, updates);
  return { ok: true, body: { suggestion_id: suggestion.id, updated_tags: updates.map((u) => u.tag) } };
}
