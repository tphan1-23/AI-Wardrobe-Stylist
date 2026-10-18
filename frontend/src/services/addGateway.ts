// Adapter from the Supabase client to AddGateway. Typed structurally so it can be tested
// with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { AnalyzeGarmentResponse } from "../../../supabase/functions/_shared/types.ts";
import type { AddGateway } from "./add.ts";
import { invokeFunction, type FunctionsClientLike } from "./edgeFunctions.ts";
import type { GatewayError, GatewayResult } from "./household.ts";

type Reply = { data: unknown; error: { message: string } | null };

export interface AddClientLike extends FunctionsClientLike {
  from(table: string): { insert(values: Record<string, unknown>): PromiseLike<Reply> };
  storage: {
    from(bucket: string): {
      upload(path: string, body: ArrayBuffer, options: { contentType: string; upsert: boolean }): Promise<Reply>;
      remove(paths: string[]): Promise<Reply>;
    };
  };
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
}

export const GARMENT_BUCKET = "garments";

const typed = <T>(res: Reply): GatewayResult<T> => ({ data: res.error ? null : (res.data as T), error: res.error });

export function supabaseAddGateway(client: AddClientLike, decodeBase64: (base64: string) => ArrayBuffer): AddGateway {
  return {
    async currentUserId() {
      const { data, error } = await client.auth.getUser();
      if (error) return { data: null, error: { message: error.message } as GatewayError };
      return data.user ? { data: data.user.id, error: null } : { data: null, error: { message: "not authenticated" } };
    },
    async uploadPhoto(path, base64) {
      // upsert is off: a path that already exists is an error, never an overwrite of someone's photo.
      return typed<unknown>(
        await client.storage.from(GARMENT_BUCKET).upload(path, decodeBase64(base64), { contentType: "image/jpeg", upsert: false }),
      );
    },
    analyzePhoto(path) {
      return invokeFunction<AnalyzeGarmentResponse>(client, "analyze-garment", { image_path: path });
    },
    async saveGarment(row) {
      return typed<unknown>(await client.from("garments").insert({ ...row }));
    },
    async removePhoto(path) {
      return typed<unknown>(await client.storage.from(GARMENT_BUCKET).remove([path]));
    },
  };
}
