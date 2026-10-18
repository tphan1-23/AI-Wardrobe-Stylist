// Adapter from the Supabase client to ClosetGateway. Typed structurally so it can be tested
// with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { ClosetGateway, ClosetRow } from "./closet.ts";
import type { GatewayResult } from "./household.ts";
import { GARMENT_BUCKET, signPhotoUrls } from "./storage.ts";

type Reply = { data: unknown; error: { message: string } | null };

interface Query {
  select(columns: string): Query;
  update(values: Record<string, unknown>): Query;
  delete(): Query;
  eq(column: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  then: PromiseLike<Reply>["then"];
}

export interface ClosetClientLike {
  from(table: string): Query;
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number,
      ): Promise<{
        data: { path: string | null; signedUrl: string; error: string | null }[] | null;
        error: { message: string } | null;
      }>;
      remove(paths: string[]): Promise<Reply>;
    };
  };
}

const typed = <T>(res: Reply): GatewayResult<T> => ({ data: res.error ? null : (res.data as T), error: res.error });

// An update or delete the database refused to apply (not the caller's row) succeeds with zero
// rows changed, so the changed rows are asked for and an empty answer is reported as a failure.
const changedOne = (res: Reply): GatewayResult<unknown> => {
  if (res.error) return { data: null, error: res.error };
  const rows = res.data;
  return Array.isArray(rows) && rows.length > 0
    ? { data: rows, error: null }
    : { data: null, error: { message: "garment not found or not yours" } };
};

export function supabaseClosetGateway(client: ClosetClientLike): ClosetGateway {
  return {
    async loadGarments() {
      return typed<ClosetRow[]>(
        await client
          .from("garments")
          .select("id, owner_id, type, color, season, warmth, status, image_path, created_at")
          .order("created_at", { ascending: false }),
      );
    },
    signPhotos(paths) {
      return signPhotoUrls(client, paths);
    },
    async updateGarment(id, changes) {
      return changedOne(await client.from("garments").update({ ...changes }).eq("id", id).select("id"));
    },
    async deleteGarment(id) {
      return changedOne(await client.from("garments").delete().eq("id", id).select("id"));
    },
    async removePhoto(path) {
      return typed<unknown>(await client.storage.from(GARMENT_BUCKET).remove([path]));
    },
  };
}
