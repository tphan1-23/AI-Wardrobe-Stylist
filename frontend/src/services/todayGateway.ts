// Adapter from the Supabase client to TodayGateway. Typed structurally so it can be
// tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { FeedbackValue, GenerateOutfitResponse } from "../../../supabase/functions/_shared/types.ts";
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

// What supabase-js returns when an edge function answers with an error status:
// `context` is the HTTP response (FunctionsHttpError), absent when the request never got through.
interface FunctionsError {
  message: string;
  context?: { status?: unknown; json?: () => Promise<unknown> };
}

export interface TodayClientLike {
  from(table: string): Query;
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<Reply>;
  functions: { invoke(name: string, options: { body: unknown }): Promise<{ data: unknown; error: FunctionsError | null }> };
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

export const GARMENT_BUCKET = "garments";
// Long enough to stay open for a day's use, short enough that a leaked link expires.
export const PHOTO_LINK_SECONDS = 3600;

const typed = <T>(res: Reply): GatewayResult<T> => ({
  data: res.error ? null : (res.data as T),
  error: res.error,
});

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

// Reads the status and the server's own message out of a failed function call.
async function functionError(error: FunctionsError): Promise<GatewayError> {
  const status = typeof error.context?.status === "number" ? error.context.status : undefined;
  // No status means the request never reached the function (offline, DNS, timeout).
  if (status === undefined) return { message: NETWORK_ERROR };
  let message = error.message;
  try {
    const body = await error.context?.json?.();
    const text = (body as { error?: unknown } | null)?.error;
    if (typeof text === "string") message = text;
  } catch {
    // keep the generic message
  }
  return { message, status };
}

async function invoke<T>(client: TodayClientLike, name: string, body: unknown): Promise<GatewayResult<T>> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) return { data: null, error: await functionError(error) };
  return { data: data as T, error: null };
}

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
      return invoke<GenerateOutfitResponse>(client, "generate-outfit", body);
    },
    sendFeedback(suggestionId: string, feedback: FeedbackValue) {
      return invoke<unknown>(client, "update-preferences", { suggestion_id: suggestionId, feedback });
    },
    async acceptSuggestion(suggestionId) {
      return typed<unknown>(await client.rpc("accept_suggestion", { p_suggestion_id: suggestionId }));
    },
  };
}
