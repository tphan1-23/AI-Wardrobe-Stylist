// After the AI tags a photo it may suggest a crop (see CropBox). The person decides: nothing is
// ever cropped automatically. When they accept a crop, the cropped file takes the place of the
// original in storage; this file does that swap. Pure TypeScript with the same injected gateway as
// services/add.ts, unit-tested in tests/cropSuggestion.test.ts.
import {
  contentTypeFor,
  friendlyAddError,
  photoPath,
  validatePhoto,
  type AddGateway,
  type PickedPhoto,
  type ReviewState,
} from "./add.ts";
import type { Result } from "./household.ts";
import type { UUID } from "../../../supabase/functions/_shared/types.ts";

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

// Uploads the cropped photo, then removes the original. The tags the person is reviewing stay as
// they are (the AI already read the photo). If the upload fails nothing changes and the original
// stays; if removing the original fails the new photo is still used (the leftover is in the
// person's own folder and harmless).
export async function replaceWithCrop(
  gateway: AddGateway,
  userId: UUID,
  review: ReviewState,
  cropped: PickedPhoto,
  newId: () => string,
): Promise<Result<ReviewState>> {
  const problem = validatePhoto(cropped);
  if (problem) return { ok: false, error: problem };

  const path = photoPath(userId, newId(), cropped.extension);
  try {
    const uploaded = await gateway.uploadPhoto(path, cropped.data, contentTypeFor(cropped.extension));
    if (uploaded.error) return { ok: false, error: friendlyAddError(uploaded.error.message, uploaded.error.status) };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }

  try {
    await gateway.removePhoto(review.photoPath);
  } catch {
    // Best effort, see above.
  }

  // The suggestion has been used, so it is not offered again.
  const { box: _used, ...rest } = review;
  return { ok: true, value: { ...rest, photoPath: path } };
}
