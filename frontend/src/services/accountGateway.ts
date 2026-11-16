// Adapter from the Supabase client to AccountGateway. Typed structurally so it can be tested with a fake client;
// frontend/src/services/supabase.ts supplies the real one.
import type { AccountGateway } from "./account.ts";
import { invokeFunction, type FunctionsClientLike } from "./edgeFunctions.ts";

export interface AccountClientLike extends FunctionsClientLike {
  auth: { signOut(options: { scope: "local" }): PromiseLike<unknown> };
}

export function supabaseAccountGateway(client: AccountClientLike): AccountGateway {
  return {
    deleteAccount: () => invokeFunction<unknown>(client, "delete-account", { confirm: true }),
    // "local" clears this phone's session without asking the server, which no longer knows the account.
    signOutLocally: async () => client.auth.signOut({ scope: "local" }),
  };
}
