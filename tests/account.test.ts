// The app's side of deleting an account: the confirmation word, the messages, and what happens on failure.
import { describe, expect, it, vi } from "vitest";
import {
  CONFIRM_WORD,
  DELETION_SUMMARY,
  deleteMyAccount,
  friendlyDeleteError,
  isDeletionConfirmed,
  type AccountGateway,
} from "../frontend/src/services/account.ts";
import { supabaseAccountGateway, type AccountClientLike } from "../frontend/src/services/accountGateway.ts";

function gateway(deleteResult: Awaited<ReturnType<AccountGateway["deleteAccount"]>>) {
  return { deleteAccount: async () => deleteResult, signOutLocally: vi.fn(async () => undefined) };
}

describe("confirmation", () => {
  it("needs the word typed, in any case, ignoring spaces around it", () => {
    expect(CONFIRM_WORD).toBe("DELETE");
    expect(isDeletionConfirmed("DELETE")).toBe(true);
    expect(isDeletionConfirmed("  delete ")).toBe(true);
    expect(isDeletionConfirmed("")).toBe(false);
    expect(isDeletionConfirmed("delet")).toBe(false);
    expect(isDeletionConfirmed("delete my account")).toBe(false);
  });

  it("tells the person everything that goes", () => {
    const text = DELETION_SUMMARY.join(" ");
    expect(text).toMatch(/account/i);
    expect(text).toMatch(/photo/i);
    expect(text).toMatch(/household/i);
  });
});

describe("deleteMyAccount", () => {
  it("signs out on this phone after the account is deleted", async () => {
    const g = gateway({ data: { deleted: true }, error: null });
    expect(await deleteMyAccount(g)).toEqual({ ok: true, value: true });
    expect(g.signOutLocally).toHaveBeenCalledOnce();
  });

  it("stays signed in and says why when the deletion fails, so the person can try again", async () => {
    const g = gateway({ data: null, error: { message: "internal error", status: 500 } });
    const result = await deleteMyAccount(g);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).not.toContain("internal error");
    expect(g.signOutLocally).not.toHaveBeenCalled();
  });

  it("explains a lost connection and an expired session in plain words", async () => {
    expect(friendlyDeleteError("fetch failed")).toContain("Could not reach the server");
    expect(friendlyDeleteError("bad token", 401)).toContain("session expired");
    const offline = {
      deleteAccount: async () => {
        throw new Error("network");
      },
      signOutLocally: vi.fn(),
    };
    const result = await deleteMyAccount(offline);
    expect(!result.ok && result.error).toContain("Could not reach");
    expect(offline.signOutLocally).not.toHaveBeenCalled();
  });

  it("still succeeds when clearing the local sign-in fails", async () => {
    const g = {
      deleteAccount: async () => ({ data: {}, error: null }),
      signOutLocally: async () => {
        throw new Error("storage");
      },
    };
    expect(await deleteMyAccount(g)).toEqual({ ok: true, value: true });
  });
});

describe("supabaseAccountGateway", () => {
  it("calls the delete-account function with confirm: true, and clears only the local session", async () => {
    const invoke = vi.fn(async () => ({ data: { deleted: true }, error: null }));
    const signOut = vi.fn(async () => ({}));
    const client: AccountClientLike = { functions: { invoke }, auth: { signOut } };
    const g = supabaseAccountGateway(client);
    expect(await g.deleteAccount()).toEqual({ data: { deleted: true }, error: null });
    expect(invoke).toHaveBeenCalledWith("delete-account", { body: { confirm: true } });
    await g.signOutLocally();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the HTTP status of a failed call", async () => {
    const error = { message: "x", context: { status: 401, json: async () => ({ error: "invalid or expired session" }) } };
    const client: AccountClientLike = { functions: { invoke: async () => ({ data: null, error }) }, auth: { signOut: async () => ({}) } };
    expect(await supabaseAccountGateway(client).deleteAccount()).toEqual({
      data: null,
      error: { message: "invalid or expired session", status: 401 },
    });
  });
});
