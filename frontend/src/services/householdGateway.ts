// Adapter from the Supabase client to HouseholdGateway. Typed structurally so it
// can be tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { GatewayResult, HouseholdGateway, HouseholdRow, MemberRow, ProfileRow } from "./household.ts";

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;

interface Query {
  select(columns: string): Query;
  update(values: Record<string, unknown>): Query;
  upsert(values: Record<string, unknown>[], options: { onConflict: string }): Query;
  eq(column: string, value: string): Query;
  order(column: string): Query;
  maybeSingle(): Result;
  then: Result["then"];
}

export interface SupabaseLike {
  rpc(fn: string, args?: Record<string, unknown>): Result;
  from(table: string): Query;
  auth: { getUser(): PromiseLike<{ data: { user: { id: string } | null }; error: { message: string } | null }> };
}

const typed = <T>(res: { data: unknown; error: { message: string } | null }): GatewayResult<T> => ({
  data: res.error ? null : (res.data as T),
  error: res.error,
});

export function supabaseGateway(client: SupabaseLike): HouseholdGateway {
  async function currentUserId(): Promise<string | { message: string }> {
    const { data, error } = await client.auth.getUser();
    if (error) return { message: error.message };
    return data.user ? data.user.id : { message: "not authenticated" };
  }

  return {
    async createHousehold(name) {
      return typed<string>(await client.rpc("create_household", { p_name: name }));
    },
    async joinHousehold(inviteCode) {
      return typed<string>(await client.rpc("join_household", { p_code: inviteCode }));
    },
    async leaveHousehold() {
      return typed<unknown>(await client.rpc("leave_household"));
    },
    async loadProfile() {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<ProfileRow>(await client.from("users").select("id, household_id, name, location, quiz_preferences").eq("id", id).maybeSingle());
    },
    async ensureProfile() {
      return typed<unknown>(await client.rpc("ensure_profile"));
    },
    async updateLocation(location) {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<unknown>(await client.from("users").update({ location }).eq("id", id));
    },
    async saveQuiz(answers, preferences) {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      // The weights go first: the answers are what mark the quiz as finished, so a
      // failure in between lets the user simply finish the quiz again (the upsert repeats safely).
      if (preferences.length > 0) {
        const seeded = typed<unknown>(
          await client
            .from("preference_vector")
            .upsert(
              preferences.map((p) => ({ user_id: id, tag: p.tag, weight: p.weight })),
              { onConflict: "user_id,tag" },
            ),
        );
        if (seeded.error) return seeded;
      }
      return typed<unknown>(await client.from("users").update({ quiz_preferences: answers }).eq("id", id));
    },
    async loadHousehold(householdId) {
      return typed<HouseholdRow>(
        await client.from("households").select("id, name, invite_code").eq("id", householdId).maybeSingle(),
      );
    },
    async loadMembers(householdId) {
      return typed<MemberRow[]>(
        await client.from("users").select("id, name").eq("household_id", householdId).order("name"),
      );
    },
  };
}
