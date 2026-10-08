// Turns the handler dependencies into real Supabase queries. Typed against a small structural
// interface (like frontend/src/services/householdGateway.ts) so the query shapes are unit-tested with a fake.
// Every query runs as the signed-in user, so row-level security applies; the .eq owner filters are belt and braces.
import type { AnalyzeDeps } from "./analyze-handler.ts";
import type { GenerateOutfitDeps, UpdatePreferencesDeps } from "./handlers.ts";
import type { Garment, ISODate, PreferenceEntry, Suggestion, UserProfile, UUID, WeatherSnapshot } from "./types.ts";

type Reply = { data: unknown; error: { message: string } | null };

export interface Query extends PromiseLike<Reply> {
  select(columns?: string): Query;
  insert(values: unknown): Query;
  upsert(values: unknown, options?: { onConflict?: string }): Query;
  update(values: unknown): Query;
  eq(column: string, value: unknown): Query;
  in(column: string, values: unknown[]): Query;
  is(column: string, value: null): Query;
  maybeSingle(): Query;
  single(): Query;
}

export interface Db {
  from(table: string): Query;
  storage: { from(bucket: string): { download(path: string): PromiseLike<{ data: Blob | null; error: { message: string } | null }> } };
}

export const PHOTO_BUCKET = "garments";

async function rows<T>(query: Query): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

async function one<T>(query: Query): Promise<T | null> {
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as T | null;
}

const GARMENT_COLUMNS = "id, owner_id, image_path, type, color, season, warmth, status, last_worn_date";

export function generateOutfitDeps(db: Db, getWeather: (location: string) => Promise<WeatherSnapshot>): GenerateOutfitDeps {
  return {
    getProfile: (userId) => one<UserProfile>(db.from("users").select("id, household_id, name, location, quiz_preferences").eq("id", userId)),
    getOwnGarments: (userId) => rows<Garment>(db.from("garments").select(GARMENT_COLUMNS).eq("owner_id", userId)),
    getPreferences: (userId) => rows<PreferenceEntry>(db.from("preference_vector").select("tag, weight").eq("user_id", userId)),
    getWeather,
    async getSuggestionGarmentIds(userId, suggestionIds) {
      const found = await rows<{ garment_ids: UUID[] }>(
        db.from("suggestions").select("garment_ids").eq("user_id", userId).in("id", suggestionIds),
      );
      return found.map((s) => s.garment_ids);
    },
    async saveSuggestion(row: { user_id: UUID; date: ISODate; garment_ids: UUID[] }) {
      const { data, error } = await db.from("suggestions").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      return (data as { id: UUID }).id;
    },
  };
}

export function updatePreferencesDeps(db: Db): UpdatePreferencesDeps {
  return {
    getSuggestion: (userId, suggestionId) =>
      one<Suggestion>(db.from("suggestions").select("id, user_id, date, garment_ids, feedback, accepted").eq("id", suggestionId).eq("user_id", userId)),
    getOwnGarmentsByIds: (userId, ids) =>
      ids.length === 0 ? Promise.resolve([]) : rows<Garment>(db.from("garments").select(GARMENT_COLUMNS).eq("owner_id", userId).in("id", ids)),
    getPreferences: (userId) => rows<PreferenceEntry>(db.from("preference_vector").select("tag, weight").eq("user_id", userId)),
    async upsertPreferences(userId, entries) {
      const { error } = await db
        .from("preference_vector")
        .upsert(entries.map((e) => ({ user_id: userId, tag: e.tag, weight: e.weight })), { onConflict: "user_id,tag" });
      if (error) throw new Error(error.message);
    },
    // UPDATE ... WHERE feedback IS NULL RETURNING id: only the first request gets a row back.
    async claimFeedback(suggestionId, feedback) {
      const claimed = await rows<{ id: UUID }>(
        db.from("suggestions").update({ feedback }).eq("id", suggestionId).is("feedback", null).select("id"),
      );
      return claimed.length > 0;
    },
  };
}

const EXTENSION_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export function analyzeDeps(db: Db, analyze: AnalyzeDeps["analyze"]): AnalyzeDeps {
  return {
    async downloadImage(path) {
      const { data, error } = await db.storage.from(PHOTO_BUCKET).download(path);
      if (error || !data) return null;
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      const mimeType = EXTENSION_TYPES[extension] ?? data.type;
      return { base64: bytesToBase64(new Uint8Array(await data.arrayBuffer())), mimeType };
    },
    analyze,
  };
}
