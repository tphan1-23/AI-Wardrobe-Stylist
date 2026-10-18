// Adding a garment: upload the photo, ask the AI for tags, let the person review and
// confirm them, then save (decisions D4 and D18). Pure TypeScript with an injected
// gateway so it is unit-tested without React Native or a network (see tests/add.test.ts).
//
// Proposing the tags is the AI core's job (`analyze-garment`, owned by Manuel + Claude);
// this file only sends the photo, shows what comes back and stores what the person confirms.
import type { AnalyzeGarmentResponse, UUID } from "../../../supabase/functions/_shared/types.ts";
import { NETWORK_ERROR } from "./edgeFunctions.ts";
import { isComplete, manualReview, reviewProblem, startReview, type GarmentDraft, type ReviewState } from "./garment.ts";
import type { GatewayError, GatewayResult, Result } from "./household.ts";

// analyze-garment refuses photos over about 5 MB.
export const MAX_PHOTO_BYTES = 5_000_000;

export interface NewGarment {
  owner_id: UUID;
  image_path: string;
  type: NonNullable<GarmentDraft["type"]>;
  color: NonNullable<GarmentDraft["color"]>;
  season: NonNullable<GarmentDraft["season"]>;
  warmth: NonNullable<GarmentDraft["warmth"]>;
}

export interface AddGateway {
  currentUserId(): Promise<GatewayResult<string>>;
  // `base64` is the JPEG as the image picker returns it.
  uploadPhoto(path: string, base64: string): Promise<GatewayResult<unknown>>;
  analyzePhoto(path: string): Promise<GatewayResult<AnalyzeGarmentResponse>>;
  saveGarment(row: NewGarment): Promise<GatewayResult<unknown>>;
  removePhoto(path: string): Promise<GatewayResult<unknown>>;
}

export interface UploadedPhoto {
  userId: UUID;
  path: string;
  review: ReviewState;
  // Something to tell the person above the form (the AI was unavailable, or it flagged the photo).
  notice: string | null;
}

// The photo's size in bytes, from its base64 text.
export function photoBytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// Photos live at "<owner user id>/<file>" in the private bucket (D18); the id keeps it in
// the person's own folder, which is the only place the storage rules let them write.
export function newPhotoPath(userId: UUID, now: number = Date.now(), random: () => number = Math.random): string {
  const suffix = Math.floor(random() * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  return `${userId}/${now}-${suffix}.jpg`;
}

export function friendlyAddError(error: GatewayError): string {
  const text = error.message.toLowerCase();
  if (error.status === 401) return "Your session expired. Please sign in again.";
  if (error.status === 400) return "That photo cannot be used. It may be too large or in an unsupported format.";
  if (error.status === 403 || error.status === 404) return "The photo could not be read. Please try again.";
  if (text.includes("exceeded the maximum allowed size")) return "That photo is too large. Try another one.";
  if (text.includes("row-level security")) return "You can only add photos to your own closet.";
  return error.message;
}

async function call<T>(run: () => Promise<GatewayResult<T>>): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, error: friendlyAddError(error) };
    if (data === null || data === undefined) {
      return { ok: false, error: "The server returned no data. Please try again." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

// Deleting a photo that will not be used is housekeeping: a failure here is not worth showing.
export async function discardPhoto(gateway: AddGateway, path: string): Promise<void> {
  try {
    await gateway.removePhoto(path);
  } catch {
    // the photo stays in the person's own folder; nothing else depends on it
  }
}

// When the AI cannot suggest tags the person can still add the garment by choosing them.
function manualFallback(error: GatewayError): string | null {
  if (error.status === 429) return "The AI has reached its limit for now. Choose the tags yourself.";
  if (error.status === 502) return "The AI service is unavailable right now. Choose the tags yourself.";
  if (error.status === undefined) return "Could not reach the AI. Choose the tags yourself.";
  return null;
}

export async function addPhoto(gateway: AddGateway, base64: string): Promise<Result<UploadedPhoto>> {
  if (base64 === "") return { ok: false, error: "Could not read that photo. Try another one." };
  if (photoBytes(base64) > MAX_PHOTO_BYTES) return { ok: false, error: "That photo is too large. Try another one." };

  const user = await call(() => gateway.currentUserId());
  if (!user.ok) return user;
  const path = newPhotoPath(user.value);

  const uploaded = await call(async () => {
    const res = await gateway.uploadPhoto(path, base64);
    return { data: res.error ? null : (true as const), error: res.error };
  });
  if (!uploaded.ok) return uploaded;

  let analysis: GatewayResult<AnalyzeGarmentResponse>;
  try {
    analysis = await gateway.analyzePhoto(path);
  } catch {
    analysis = { data: null, error: { message: NETWORK_ERROR } };
  }

  if (analysis.error || !analysis.data) {
    const error = analysis.error ?? { message: "The AI returned no suggestion." };
    const notice = manualFallback(error);
    if (notice === null) {
      // The photo itself is the problem; do not leave it in storage.
      await discardPhoto(gateway, path);
      return { ok: false, error: friendlyAddError(error) };
    }
    return { ok: true, value: { userId: user.value, path, review: manualReview(), notice } };
  }

  const warnings = analysis.data.warnings.join(" ");
  return {
    ok: true,
    value: { userId: user.value, path, review: startReview(analysis.data), notice: warnings === "" ? null : warnings },
  };
}

// Saves the garment once every tag is chosen and every flagged one has been checked.
export async function saveGarment(
  gateway: AddGateway,
  photo: Pick<UploadedPhoto, "userId" | "path">,
  review: ReviewState,
): Promise<Result<true>> {
  const problem = reviewProblem(review);
  if (problem) return { ok: false, error: problem };
  const { draft } = review;
  if (!isComplete(draft)) return { ok: false, error: "Choose every tag before saving." };

  return call(async () => {
    const res = await gateway.saveGarment({
      owner_id: photo.userId,
      image_path: photo.path,
      type: draft.type,
      color: draft.color,
      season: draft.season,
      warmth: draft.warmth,
    });
    return { data: res.error ? null : (true as const), error: res.error };
  });
}
