// Household + profile logic (create/join a household, load and edit the profile).
// Pure TypeScript with an injected client so it can be unit-tested without a
// network (see tests/household.test.ts). The RPCs live in supabase/migrations/0001_init.sql.
import type { UserProfile } from "../../../supabase/functions/_shared/types.ts";

export type Profile = Pick<UserProfile, "id" | "household_id" | "name" | "location">;

export interface Household {
  id: string;
  name: string;
  invite_code: string;
}

interface DbError {
  message: string;
}

// The slice of the Supabase client that this module uses.
export interface HouseholdClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError | null }>;
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        maybeSingle(): PromiseLike<{ data: unknown; error: DbError | null }>;
      };
    };
    update(values: Record<string, unknown>): {
      eq(column: string, value: string): PromiseLike<{ error: DbError | null }>;
    };
  };
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const PROFILE_COLUMNS = "id, household_id, name, location";
const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

export function normalizeInviteCode(code: string): string {
  return code.trim().toLowerCase();
}

export function validateHouseholdName(name: string): string | null {
  return name.trim() === "" ? "Enter a name for your household." : null;
}

export function validateInviteCode(code: string): string | null {
  return normalizeInviteCode(code) === "" ? "Enter the invite code." : null;
}

export function friendlyHouseholdError(message: string): string {
  if (message.toLowerCase().includes("invalid invite code")) {
    return "That invite code doesn't match any household.";
  }
  return message;
}

export async function getProfile(client: HouseholdClient, userId: string): Promise<Result<Profile>> {
  try {
    const { data, error } = await client.from("users").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Your profile could not be found." };
    return { ok: true, data: data as Profile };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function getHousehold(
  client: HouseholdClient,
  householdId: string,
): Promise<Result<Household>> {
  try {
    const { data, error } = await client
      .from("households")
      .select("id, name, invite_code")
      .eq("id", householdId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Your household could not be found." };
    return { ok: true, data: data as Household };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function createHousehold(client: HouseholdClient, name: string): Promise<Result<string>> {
  const problem = validateHouseholdName(name);
  if (problem) return { ok: false, error: problem };
  try {
    const { data, error } = await client.rpc("create_household", { p_name: name.trim() });
    if (error) return { ok: false, error: friendlyHouseholdError(error.message) };
    return { ok: true, data: data as string };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function joinHousehold(client: HouseholdClient, code: string): Promise<Result<string>> {
  const problem = validateInviteCode(code);
  if (problem) return { ok: false, error: problem };
  try {
    const { data, error } = await client.rpc("join_household", { p_code: normalizeInviteCode(code) });
    if (error) return { ok: false, error: friendlyHouseholdError(error.message) };
    return { ok: true, data: data as string };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function updateProfile(
  client: HouseholdClient,
  userId: string,
  changes: { name: string; location: string },
): Promise<Result<null>> {
  if (changes.name.trim() === "") return { ok: false, error: "Enter your name." };
  try {
    const location = changes.location.trim();
    const { error } = await client
      .from("users")
      .update({ name: changes.name.trim(), location: location === "" ? null : location })
      .eq("id", userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: null };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
