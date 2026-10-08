// Request handler for the analyze-garment edge function. I/O is injected (storage download, Gemini call),
// so it is unit-tested without Deno, Supabase or a network.
import { GeminiError } from "./gemini.ts";
import { fail, type HandlerResult } from "./handlers.ts";
import type { AnalyzeGarmentRequest, AnalyzeGarmentResponse, UUID } from "./types.ts";

export const MAX_PATH_LENGTH = 200;
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;

export interface AnalyzeDeps {
  // Returns null when the file does not exist or the caller may not read it.
  downloadImage(path: string): Promise<{ base64: string; mimeType: string } | null>;
  analyze(image: { base64: string; mimeType: string }): Promise<AnalyzeGarmentResponse>;
}

// Photos live under "<owner user id>/<file>" (D18). Only the owner may have their own photo tagged.
export function isOwnPhotoPath(userId: UUID, path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length <= MAX_PATH_LENGTH &&
    path.startsWith(`${userId}/`) &&
    !path.includes("..") &&
    !path.includes("//") &&
    !path.includes("\\") &&
    ALLOWED_EXTENSIONS.test(path)
  );
}

export async function handleAnalyzeGarment(
  userId: UUID,
  request: AnalyzeGarmentRequest,
  deps: AnalyzeDeps,
): Promise<HandlerResult<AnalyzeGarmentResponse>> {
  if (!isOwnPhotoPath(userId, request?.image_path)) {
    return fail(403, "image_path must be a photo in your own folder (<your user id>/<file>.jpg)");
  }
  const image = await deps.downloadImage(request.image_path);
  if (image === null) return fail(404, "photo not found");

  try {
    return { ok: true, body: await deps.analyze(image) };
  } catch (error) {
    if (!(error instanceof GeminiError)) throw error;
    if (error.kind === "bad_image") return fail(400, "this photo cannot be analyzed (unsupported type or too large)");
    if (error.kind === "quota_exhausted" || error.kind === "rate_limited") {
      return fail(429, "photo tagging is at its limit right now; fill in the tags yourself or try again later");
    }
    return fail(502, "photo tagging is unavailable right now; fill in the tags yourself");
  }
}
