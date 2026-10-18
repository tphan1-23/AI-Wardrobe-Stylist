// Adapter from the Supabase client to TodayGateway. Typed structurally so it can be
// tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { FeedbackValue, GenerateOutfitResponse } from "../../../supabase/functions/_shared/types.ts";
import { functionError, invokeFunction, type FunctionsClientLike } from "./edgeFunctions.ts";
import type { GatewayError, GatewayResult } from "./household.ts";
import { GARMENT_BUCKET, PHOTO_LINK_SECONDS, signPhotoUrls, type StorageClientLike } from "./storage.ts";

// Kept exported from here for the tests that already import them.
export { GARMENT_BUCKET, PHOTO_LINK_SECONDS };
import type { GarmentRow, SuggestionRow, TodayGateway } from "./today.ts";

type Reply = { data: unknown; error: { message: string } | null };

interface Query {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  order(column: string, options: { ascending: boolean }): Query;
  then: PromiseLike<Reply>["then"];
}

export interface TodayClientLike extends StorageClientLike {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Reply>;
  functions: FunctionsClientLike["functions"];
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
}

// Kept exported from here for addGateway.ts, which imports it from this file.
export { functionError };

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
    signPhotos(paths) {
      return signPhotoUrls(client, paths);
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
