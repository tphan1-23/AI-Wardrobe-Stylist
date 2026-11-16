// Deleting your account and all of your data (decision D10). Pure TypeScript with an injected gateway so it is
// unit-tested without React Native or a network (see tests/account.test.ts).
//
// The work is done by the `delete-account` edge function (it removes the photos, the sign-in account and, through
// the database, the profile, garments, preferences and suggestions). This file asks for it, after the person has
// typed the confirmation word, and then clears the sign-in on this phone.
import { unexpectedError } from "./errors.ts";
import type { GatewayResult, Result } from "./household.ts";

export interface AccountGateway {
  // Deletes the signed-in person's photos, account and data.
  deleteAccount(): Promise<GatewayResult<unknown>>;
  // Clears the sign-in on this phone (the account is already gone, so this never needs the network).
  signOutLocally(): Promise<unknown>;
}

// What the person types to confirm: a tap alone is too easy to do by accident for something that cannot be undone.
export const CONFIRM_WORD = "DELETE";

export function isDeletionConfirmed(typed: string): boolean {
  return typed.trim().toUpperCase() === CONFIRM_WORD;
}

// Everything that goes, in the words the screen shows. Keep in step with supabase/functions/_shared/delete-account.ts.
export const DELETION_SUMMARY: readonly string[] = [
  "Your account and login",
  "Every garment and its photo",
  "Your style quiz answers and what the app learned from your thumbs up and down",
  "Your outfit history and favorites",
  "Your household, if you are its last member (otherwise you just leave it)",
];

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again. Nothing was deleted yet if this keeps failing.";

export function friendlyDeleteError(message: string, status?: number): string {
  if (status === undefined) return NETWORK_ERROR;
  if (status === 401) return "Your session expired. Log in again, then delete your account.";
  return unexpectedError("account", message);
}

// Deletes the account, then signs out on this phone. If the deletion fails nothing is signed out, so the person can
// try again. A failure to clear the local sign-in is ignored: the account is gone and the session is useless anyway.
export async function deleteMyAccount(gateway: AccountGateway): Promise<Result<true>> {
  let result: GatewayResult<unknown>;
  try {
    result = await gateway.deleteAccount();
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
  if (result.error) return { ok: false, error: friendlyDeleteError(result.error.message, result.error.status) };
  try {
    await gateway.signOutLocally();
  } catch {
    // nothing left to protect
  }
  return { ok: true, value: true };
}
