// Deleting an account (D10): the order of the steps and what happens when one fails.
import { describe, expect, it, vi } from "vitest";
import { handleDeleteAccount, type DeleteAccountDeps } from "../supabase/functions/_shared/delete-account.ts";

const USER = "user-1";

function fakeDeps(overrides: Partial<DeleteAccountDeps> = {}) {
  const calls: string[] = [];
  const deps: DeleteAccountDeps = {
    getHouseholdId: async () => (calls.push("household"), "h-1"),
    listPhotoPaths: async () => (calls.push("list"), ["user-1/a.jpg", "user-1/b.jpg", "user-1/a.jpg"]),
    removePhotos: async (paths) => void calls.push(`remove:${paths.length}`),
    deleteAuthUser: async () => void calls.push("auth"),
    deleteHouseholdIfEmpty: async () => void calls.push("household-cleanup"),
    ...overrides,
  };
  return { deps, calls };
}

describe("handleDeleteAccount", () => {
  it("refuses unless confirm is exactly true, and touches nothing", async () => {
    for (const request of [{ confirm: false }, {} as never, { confirm: "true" } as never, null as never]) {
      const { deps, calls } = fakeDeps();
      expect(await handleDeleteAccount(USER, request, deps)).toMatchObject({ ok: false, status: 400 });
      expect(calls).toEqual([]);
    }
  });

  it("removes the photos first, then the account, then an empty household", async () => {
    const { deps, calls } = fakeDeps();
    const result = await handleDeleteAccount(USER, { confirm: true }, deps);
    expect(result).toEqual({ ok: true, body: { deleted: true, photos_removed: 2 } }); // the repeated path counts once
    expect(calls).toEqual(["household", "list", "remove:2", "auth", "household-cleanup"]);
  });

  it("skips the photo step when there are none and the household step when there is no household", async () => {
    const { deps, calls } = fakeDeps({ listPhotoPaths: async () => [], getHouseholdId: async () => null });
    expect(await handleDeleteAccount(USER, { confirm: true }, deps)).toEqual({ ok: true, body: { deleted: true, photos_removed: 0 } });
    expect(calls).toEqual(["auth"]);
  });

  it("does not delete the account when the photos could not be removed, so a retry finds everything", async () => {
    const { deps, calls } = fakeDeps({
      removePhotos: async () => {
        throw new Error("storage down");
      },
    });
    await expect(handleDeleteAccount(USER, { confirm: true }, deps)).rejects.toThrow("storage down");
    expect(calls).not.toContain("auth");
  });

  it("does not touch the household when the account could not be deleted", async () => {
    const { deps, calls } = fakeDeps({
      deleteAuthUser: async () => {
        throw new Error("auth down");
      },
    });
    await expect(handleDeleteAccount(USER, { confirm: true }, deps)).rejects.toThrow("auth down");
    expect(calls).not.toContain("household-cleanup");
  });

  it("still reports success when only the household cleanup fails (the account is already gone)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps } = fakeDeps({
      deleteHouseholdIfEmpty: async () => {
        throw new Error("rls");
      },
    });
    expect(await handleDeleteAccount(USER, { confirm: true }, deps)).toMatchObject({ ok: true });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
