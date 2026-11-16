// Deleting an account and all of its data (decision D10: users can delete their garments, photos and account).
// All I/O is injected, so the order of the steps and the failure handling are unit-tested without Deno or a
// database (tests/deleteAccount.test.ts); the Deno entry file only wires real Supabase calls into the deps.
//
// What goes, in this order:
//   1. every photo of the user in storage (the ones their garments point to AND any other file in their folder,
//      such as a photo that was uploaded but never saved as a garment),
//   2. the sign-in account. The database removes the rest on its own (cascade): the profile, garments, preferences and
//      suggestions. Photos are not covered by the cascade, which is why they go first.
//   3. the household, if this person was its last member (it would be an orphan nobody can open or join).
//
// If a step fails the later ones do not run, and the person can simply try again: nothing is half-hidden, and
// a retry finds whatever is left.
import { fail, type HandlerResult } from "./handlers.ts";
import type { UUID } from "./types.ts";

export interface DeleteAccountRequest {
  // Must be exactly true: the app asks the person to confirm before sending this.
  confirm: boolean;
}

export interface DeleteAccountResponse {
  deleted: true;
  photos_removed: number;
}

export interface DeleteAccountDeps {
  // The household the person belongs to, or null.
  getHouseholdId(userId: UUID): Promise<UUID | null>;
  // Every storage path that belongs to the person: their garments' photos plus anything in their own folder.
  listPhotoPaths(userId: UUID): Promise<string[]>;
  removePhotos(paths: string[]): Promise<void>;
  // Deletes the sign-in account; the database cascade deletes everything else of theirs.
  deleteAuthUser(userId: UUID): Promise<void>;
  // Deletes the household when nobody is left in it.
  deleteHouseholdIfEmpty(householdId: UUID): Promise<void>;
}

export async function handleDeleteAccount(
  userId: UUID,
  request: DeleteAccountRequest,
  deps: DeleteAccountDeps,
): Promise<HandlerResult<DeleteAccountResponse>> {
  if (request?.confirm !== true) return fail(400, "confirm must be true to delete the account");

  const householdId = await deps.getHouseholdId(userId);
  const paths = [...new Set(await deps.listPhotoPaths(userId))];
  if (paths.length > 0) await deps.removePhotos(paths);

  await deps.deleteAuthUser(userId);
  // The account is already gone here, so a problem with the household must not report the whole deletion as failed.
  if (householdId !== null) {
    try {
      await deps.deleteHouseholdIfEmpty(householdId);
    } catch (e) {
      console.error("household cleanup failed:", e instanceof Error ? e.message : "unknown error");
    }
  }
  return { ok: true, body: { deleted: true, photos_removed: paths.length } };
}
