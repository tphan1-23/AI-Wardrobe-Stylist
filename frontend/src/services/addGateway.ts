// Adapter from the Supabase client to AddGateway. Typed structurally so it can be
// tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { AnalyzeGarmentResponse } from "../../../supabase/functions/_shared/types.ts";
import type { AddGateway } from "./add.ts";
import type { GatewayResult } from "./household.ts";
import { functionError, GARMENT_BUCKET } from "./todayGateway.ts";

type Reply = { data: unknown; error: { message: string } | null };

export interface AddClientLike {
  from(table: string): { insert(values: Record<string, unknown>): PromiseLike<Reply> };
  functions: {
    invoke(
      name: string,
      options: { body: unknown },
    ): Promise<{ data: unknown; error: { message: string; context?: { status?: unknown; json?: () => Promise<unknown> } } | null }>;
  };
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        data: ArrayBuffer,
        options: { contentType: string; upsert: boolean },
      ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
      remove(paths: string[]): PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

const typed = <T>(res: Reply): GatewayResult<T> => ({ data: res.error ? null : (res.data as T), error: res.error });

export function supabaseAddGateway(client: AddClientLike): AddGateway {
  return {
    async uploadPhoto(path, data, contentType) {
      // upsert: false, so a path clash fails instead of replacing someone's photo.
      return typed<unknown>(await client.storage.from(GARMENT_BUCKET).upload(path, data, { contentType, upsert: false }));
    },
    async removePhoto(path) {
      return typed<unknown>(await client.storage.from(GARMENT_BUCKET).remove([path]));
    },
    async analyze(path) {
      const { data, error } = await client.functions.invoke("analyze-garment", { body: { image_path: path } });
      if (error) return { data: null, error: await functionError(error) };
      return { data: data as AnalyzeGarmentResponse, error: null };
    },
    async insertGarment(row) {
      return typed<unknown>(await client.from("garments").insert({ ...row }));
    },
  };
}
