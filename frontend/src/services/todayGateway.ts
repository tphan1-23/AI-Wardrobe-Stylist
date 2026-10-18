// Adapter from the Supabase client to TodayGateway. Typed structurally so it can be
// tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { FeedbackValue, GenerateOutfitResponse } from "../../../supabase/functions/_shared/types.ts";
import { functionError, invokeFunction, type FunctionsClientLike } from "./edgeFunctions.ts";
import type { GatewayError, GatewayResult } from "./household.ts";
import type { GarmentRow, SuggestionRow, TodayGateway } from "./today.ts";

type Reply = { data: unknown; error: { message: string } | null };

interface Query {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  order(column: string, options: { ascending: boolean }): Query;
  then: PromiseLike<Reply>["then"];
}

export interface TodayClientLike {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Reply>;
  functions: FunctionsClientLike["functions"];
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{
        data: { path: string | null; signedUrl: string; error: string | null }[] | null;
        error: { message: string } | null;
      }>;
    };
  };
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
}

// Kept exported from here for add.ts / addGateway.ts, which import it from this file.
export { functionError };

export const GARMENT_BUCKET = "garments";
// Long enough to stay open for a day's use, short enough that a leaked link expires.
export const PHOTO_LINK_SECONDS = 3600;

const typed = <T>(res: Reply): GatewayResult<T> => ({
  data: res.error ? null : (res.data as T),
  error: res.error,
});

export function supabaseTodayGateway(client: TodayClientLike): TodayGateway {
  async function currentUserId(): Promise<string | GatewayError> {
    const { data, error } = await client.auth.getUser();
    if (error) return { message: error.message };
    return data.user ? data.user.id : { message: "not authenticated" };
  }

  return {
    async loadSuggestions(date) {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<SuggestionRow[]>(
        await client
          .from("suggestions")
          .select("id, date, garment_ids, feedback, accepted, created_at")
          .eq("user_id", id)
          .eq("date", date)
          .order("created_at", { ascending: true }),
      );
    },
    async loadGarments(ids) {
      return typed<GarmentRow[]>(
        await client.from("garments").select("id, type, color, season, warmth, status, image_path").in("id", ids),
      );
    },
    async signPhotos(paths) {
      const { data, error } = await client.storage.from(GARMENT_BUCKET).createSignedUrls(paths, PHOTO_LINK_SECONDS);
      if (error) return { data: null, error };
      const urls: Record<string, string> = {};
      for (const entry of data ?? []) {
        if (entry.path && !entry.error) urls[entry.path] = entry.signedUrl;
      }
      return { data: urls, error: null };
    },
    generateOutfit(date, excludeSuggestionIds) {
      const body = excludeSuggestionIds.length > 0 ? { date, exclude_suggestion_ids: excludeSuggestionIds } : { date };
      return invokeFunction<GenerateOutfitResponse>(client, "generate-outfit", body);
    },
    sendFeedback(suggestionId: string, feedback: FeedbackValue) {
      return invokeFunction<unknown>(client, "update-preferences", { suggestion_id: suggestionId, feedback });
    },
    async acceptSuggestion(suggestionId) {
      return typed<unknown>(await client.rpc("accept_suggestion", { p_suggestion_id: suggestionId }));
    },
  };
}
