// Garment photos live in one private bucket at "<owner user id>/<file>" (D18). The app
// never holds a public link to a photo: it asks for short-lived signed ones.
// Typed structurally so it can be tested with a fake client (tests/todayGateway.test.ts).
import type { GatewayResult } from "./household.ts";

export const GARMENT_BUCKET = "garments";
// Long enough to stay open for a day's use, short enough that a leaked link expires.
export const PHOTO_LINK_SECONDS = 3600;
// Signed links are requested in batches so a big closet does not make one huge request.
export const SIGN_BATCH_SIZE = 100;

export interface StorageClientLike {
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
}

// Links keyed by storage path. A photo that cannot be signed is left out, not an error.
export async function signPhotoUrls(client: StorageClientLike, paths: string[]): Promise<GatewayResult<Record<string, string>>> {
  const urls: Record<string, string> = {};
  for (let start = 0; start < paths.length; start += SIGN_BATCH_SIZE) {
    const batch = paths.slice(start, start + SIGN_BATCH_SIZE);
    const { data, error } = await client.storage.from(GARMENT_BUCKET).createSignedUrls(batch, PHOTO_LINK_SECONDS);
    if (error) return { data: null, error };
    for (const entry of data ?? []) {
      if (entry.path && !entry.error) urls[entry.path] = entry.signedUrl;
    }
  }
  return { data: urls, error: null };
}
