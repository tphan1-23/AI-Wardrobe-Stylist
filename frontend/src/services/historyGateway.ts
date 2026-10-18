// Adapter from the Supabase client to HistoryGateway. Typed structurally so it can be tested
// with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { GatewayError, GatewayResult } from "./household.ts";
import type { HistoryGateway, OutfitRow } from "./history.ts";
import { signPhotoUrls, type StorageClientLike } from "./storage.ts";
import type { GarmentRow } from "./today.ts";

type Reply = { data: unknown; error: { message: string } | null };

interface Query {
  select(columns: string): Query;
  update(values: Record<string, unknown>): Query;
  eq(column: string, value: string | boolean): Query;
  gte(column: string, value: string): Query;
  in(column: string, values: string[]): Query;
  order(column: string, options: { ascending: boolean }): Query;
  then: PromiseLike<Reply>["then"];
}

export interface HistoryClientLike extends StorageClientLike {
  from(table: string): Query;
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
}

const OUTFIT_COLUMNS = "id, date, garment_ids, favorite, created_at";

const typed = <T>(res: Reply): GatewayResult<T> => ({ data: res.error ? null : (res.data as T), error: res.error });

export function supabaseHistoryGateway(client: HistoryClientLike): HistoryGateway {
  async function currentUserId(): Promise<string | GatewayError> {
    const { data, error } = await client.auth.getUser();
    if (error) return { message: error.message };
    return data.user ? data.user.id : { message: "not authenticated" };
  }

  return {
    async loadWorn(since) {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<OutfitRow[]>(
        await client
          .from("suggestions")
          .select(OUTFIT_COLUMNS)
          .eq("user_id", id)
          .eq("accepted", true)
          .gte("date", since)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
      );
    },
    async loadFavoriteOutfits() {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<OutfitRow[]>(
        await client
          .from("suggestions")
          .select(OUTFIT_COLUMNS)
          .eq("user_id", id)
          .eq("favorite", true)
          .order("date", { ascending: false })
          .order("created_at", { ascending: false }),
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
    // A change the database refused (not the caller's row) succeeds with zero rows, so the
    // changed row is asked for back and an empty answer is reported as a failure.
    async setFavorite(id, favorite) {
      const res = await client.from("suggestions").update({ favorite }).eq("id", id).select("id");
      if (res.error) return { data: null, error: res.error };
      return Array.isArray(res.data) && res.data.length > 0
        ? { data: res.data, error: null }
        : { data: null, error: { message: "outfit not found or not yours" } };
    },
  };
}
