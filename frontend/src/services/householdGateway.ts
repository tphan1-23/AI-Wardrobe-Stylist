// Adapter from the Supabase client to HouseholdGateway. Typed structurally so it
// can be tested with a fake client; frontend/src/services/supabase.ts supplies the real one.
import type { GatewayResult, HouseholdGateway, HouseholdRow, ProfileRow } from "./household.ts";

type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;

interface Query {
  select(columns: string): Query;
  update(values: Record<string, unknown>): Query;
  eq(column: string, value: string): Query;
  single(): Result;
  then: Result["then"];
}

export interface SupabaseLike {
  rpc(fn: string, args: Record<string, unknown>): Result;
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
    async loadProfile() {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<ProfileRow>(await client.from("users").select("household_id, name, location").eq("id", id).single());
    },
    async updateLocation(location) {
      const id = await currentUserId();
      if (typeof id !== "string") return { data: null, error: id };
      return typed<unknown>(await client.from("users").update({ location }).eq("id", id));
    },
    async loadHousehold(householdId) {
      return typed<HouseholdRow>(
        await client.from("households").select("id, name, invite_code").eq("id", householdId).single(),
      );
    },
  };
}
