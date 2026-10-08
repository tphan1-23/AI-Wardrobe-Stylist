import { describe, expect, it, vi } from "vitest";
import {
  MAX_HOUSEHOLD_NAME_LENGTH,
  MAX_LOCATION_LENGTH,
  createHousehold,
  friendlyHouseholdError,
  joinHousehold,
  leaveHousehold,
  loadOverview,
  normalizeInviteCode,
  onboardingStep,
  saveLocation,
  validateHouseholdName,
  validateInviteCode,
  validateLocation,
  type GatewayResult,
  type HouseholdGateway,
  type HouseholdRow,
  type MemberRow,
  type ProfileRow,
} from "../frontend/src/services/household.ts";
import { supabaseGateway, type SupabaseLike } from "../frontend/src/services/householdGateway.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string): GatewayResult<never> => ({ data: null, error: { message } });

function gateway(overrides: Partial<HouseholdGateway> = {}): HouseholdGateway {
  return {
    createHousehold: vi.fn(async () => ok("house-1")),
    joinHousehold: vi.fn(async () => ok("house-2")),
    leaveHousehold: vi.fn(async () => ok(null)),
    loadProfile: vi.fn(async () => ok<ProfileRow>(profile())),
    updateLocation: vi.fn(async () => ok(null)),
    loadHousehold: vi.fn(async () => ok<HouseholdRow>({ id: "house-1", name: "Home", invite_code: "3fa91c0b" })),
    loadMembers: vi.fn(async () => ok<MemberRow[]>([{ id: "user-1", name: "Ana" }, { id: "user-2", name: "Ben" }])),
    ...overrides,
  };
}

function profile(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return { id: "user-1", household_id: "house-1", name: "Ana", location: "Conway", ...overrides };
}

describe("validation", () => {
  it("validates household names", () => {
    expect(validateHouseholdName("The Smiths")).toBeNull();
    expect(validateHouseholdName("   ")).toContain("Enter a name");
    expect(validateHouseholdName("x".repeat(MAX_HOUSEHOLD_NAME_LENGTH))).toBeNull();
    expect(validateHouseholdName("x".repeat(MAX_HOUSEHOLD_NAME_LENGTH + 1))).toContain("at most");
  });

  it("normalizes and validates invite codes", () => {
    expect(normalizeInviteCode("  3FA91C0B ")).toBe("3fa91c0b");
    expect(validateInviteCode(" 3FA91C0B ")).toBeNull();
    expect(validateInviteCode("")).toContain("Enter the invite code");
    for (const bad of ["abc", "3fa91c0bb", "3fa91c0g", "3fa9 1c0b", "../etc/pw"]) {
      expect(validateInviteCode(bad)).toContain("8 letters and numbers");
    }
  });

  it("validates locations", () => {
    expect(validateLocation(" Conway, AR ")).toBeNull();
    expect(validateLocation("")).toContain("city or ZIP");
    expect(validateLocation("y".repeat(MAX_LOCATION_LENGTH + 1))).toContain("at most");
  });

  it("turns server messages into friendly ones and passes unknown ones through", () => {
    expect(friendlyHouseholdError("invalid invite code")).toContain("not found");
    expect(friendlyHouseholdError("already in a household")).toContain("Leave your current household");
    expect(friendlyHouseholdError("not in a household")).toBe("You are not in a household.");
    expect(friendlyHouseholdError("JWT expired")).toContain("sign in again");
    expect(friendlyHouseholdError("not authenticated")).toContain("sign in again");
    expect(friendlyHouseholdError("something odd")).toBe("something odd");
  });
});

describe("onboardingStep", () => {
  it("only asks for a location; a household is optional", () => {
    expect(onboardingStep({ location: null })).toBe("location");
    expect(onboardingStep({ location: "   " })).toBe("location");
    expect(onboardingStep({ location: "Conway" })).toBe("ready");
  });
});

describe("createHousehold / joinHousehold", () => {
  it("creates a household with a trimmed name", async () => {
    const g = gateway();
    expect(await createHousehold(g, "  The Smiths ")).toEqual({ ok: true, value: "house-1" });
    expect(g.createHousehold).toHaveBeenCalledWith("The Smiths");
  });

  it("does not call the server for invalid input", async () => {
    const g = gateway();
    expect(await createHousehold(g, " ")).toMatchObject({ ok: false });
    expect(await joinHousehold(g, "nope")).toMatchObject({ ok: false });
    expect(g.createHousehold).not.toHaveBeenCalled();
    expect(g.joinHousehold).not.toHaveBeenCalled();
  });

  it("joins with a normalized invite code", async () => {
    const g = gateway();
    expect(await joinHousehold(g, " 3FA91C0B ")).toEqual({ ok: true, value: "house-2" });
    expect(g.joinHousehold).toHaveBeenCalledWith("3fa91c0b");
  });

  it("shows a friendly message for an unknown invite code", async () => {
    const g = gateway({ joinHousehold: async () => err("invalid invite code") });
    const res = await joinHousehold(g, "3fa91c0b");
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining("not found") });
  });

  it("reports network failures and empty responses", async () => {
    const down = gateway({ createHousehold: async () => { throw new Error("offline"); }, joinHousehold: async () => { throw new Error("offline"); } });
    expect(await createHousehold(down, "Home")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    expect(await joinHousehold(down, "3fa91c0b")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    const empty = gateway({ createHousehold: async () => ({ data: null, error: null }) });
    expect(await createHousehold(empty, "Home")).toMatchObject({ ok: false, error: expect.stringContaining("no data") });
  });
});

describe("saveLocation", () => {
  it("saves the trimmed location and returns it", async () => {
    const g = gateway();
    expect(await saveLocation(g, " Conway, AR ")).toEqual({ ok: true, value: "Conway, AR" });
    expect(g.updateLocation).toHaveBeenCalledWith("Conway, AR");
  });

  it("rejects invalid input without calling the server", async () => {
    const g = gateway();
    expect(await saveLocation(g, "  ")).toMatchObject({ ok: false });
    expect(g.updateLocation).not.toHaveBeenCalled();
  });

  it("surfaces server and network errors", async () => {
    expect(await saveLocation(gateway({ updateLocation: async () => err("permission denied") }), "Conway")).toEqual({ ok: false, error: "permission denied" });
    expect(await saveLocation(gateway({ updateLocation: async () => { throw new Error("x"); } }), "Conway")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("leaveHousehold", () => {
  it("calls the server and reports success", async () => {
    const g = gateway();
    expect(await leaveHousehold(g)).toEqual({ ok: true, value: true });
    expect(g.leaveHousehold).toHaveBeenCalledTimes(1);
  });

  it("shows a friendly message when the user is not in a household", async () => {
    const g = gateway({ leaveHousehold: async () => err("not in a household") });
    expect(await leaveHousehold(g)).toEqual({ ok: false, error: "You are not in a household." });
  });

  it("reports network failures", async () => {
    const g = gateway({ leaveHousehold: async () => { throw new Error("offline"); } });
    expect(await leaveHousehold(g)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("loadOverview", () => {
  it("returns profile, household, members and the ready step", async () => {
    const g = gateway();
    const res = await loadOverview(g);
    expect(res).toMatchObject({
      ok: true,
      value: {
        step: "ready",
        household: { invite_code: "3fa91c0b" },
        members: [{ id: "user-1", name: "Ana" }, { id: "user-2", name: "Ben" }],
      },
    });
    expect(g.loadMembers).toHaveBeenCalledWith("house-1");
  });

  it("lets a user without a household use the app with their own closet", async () => {
    const g = gateway({ loadProfile: async () => ok(profile({ household_id: null })) });
    const res = await loadOverview(g);
    expect(res).toMatchObject({ ok: true, value: { step: "ready", household: null, members: [] } });
    expect(g.loadHousehold).not.toHaveBeenCalled();
    expect(g.loadMembers).not.toHaveBeenCalled();
  });

  it("asks for a location when it is missing, with or without a household", async () => {
    for (const household_id of ["house-1", null]) {
      const g = gateway({ loadProfile: async () => ok(profile({ household_id, location: null })) });
      expect(await loadOverview(g)).toMatchObject({ ok: true, value: { step: "location" } });
    }
  });

  it("fails cleanly if any lookup fails", async () => {
    expect(await loadOverview(gateway({ loadProfile: async () => err("boom") }))).toEqual({ ok: false, error: "boom" });
    expect(await loadOverview(gateway({ loadHousehold: async () => err("denied") }))).toEqual({ ok: false, error: "denied" });
    expect(await loadOverview(gateway({ loadMembers: async () => err("nope") }))).toEqual({ ok: false, error: "nope" });
  });

  it("explains a missing profile or household instead of showing a raw database error", async () => {
    const noProfile = await loadOverview(gateway({ loadProfile: async () => ({ data: null, error: null }) }));
    expect(noProfile).toEqual({ ok: false, error: "Your profile could not be found. Log out and sign in again." });
    const noHousehold = await loadOverview(gateway({ loadHousehold: async () => ({ data: null, error: null }) }));
    expect(noHousehold).toEqual({ ok: false, error: "Your household could not be found." });
  });
});

describe("supabaseGateway adapter", () => {
  type Reply = { data: unknown; error: { message: string } | null };
  function fakeClient(reply: Reply, user: { id: string } | null = { id: "user-1" }, authError: string | null = null) {
    const calls: { rpc: [string, Record<string, unknown> | undefined][]; ops: unknown[][] } = { rpc: [], ops: [] };
    const query = (): never => {
      const q = {
        select: (c: string) => (calls.ops.push(["select", c]), q),
        update: (v: Record<string, unknown>) => (calls.ops.push(["update", v]), q),
        eq: (c: string, v: string) => (calls.ops.push(["eq", c, v]), q),
        order: (c: string) => (calls.ops.push(["order", c]), q),
        maybeSingle: async () => reply,
        then: (res: (r: Reply) => unknown) => Promise.resolve(reply).then(res),
      };
      return q as never;
    };
    const client: SupabaseLike = {
      rpc: async (fn, args) => (calls.rpc.push([fn, args]), reply),
      from: (table) => (calls.ops.push(["from", table]), query()),
      auth: { getUser: async () => ({ data: { user }, error: authError ? { message: authError } : null }) },
    };
    return { client, calls };
  }

  it("calls the create/join RPCs with the right argument names", async () => {
    const { client, calls } = fakeClient({ data: "house-9", error: null });
    const g = supabaseGateway(client);
    expect(await g.createHousehold("Home")).toEqual({ data: "house-9", error: null });
    expect(await g.joinHousehold("3fa91c0b")).toEqual({ data: "house-9", error: null });
    expect(calls.rpc).toEqual([["create_household", { p_name: "Home" }], ["join_household", { p_code: "3fa91c0b" }]]);
  });

  it("calls the leave RPC with no arguments", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    expect(await supabaseGateway(client).leaveHousehold()).toEqual({ data: null, error: null });
    expect(calls.rpc).toEqual([["leave_household", undefined]]);
  });

  it("lists household members by name", async () => {
    const members = [{ id: "user-1", name: "Ana" }];
    const { client, calls } = fakeClient({ data: members, error: null });
    expect((await supabaseGateway(client).loadMembers("h")).data).toEqual(members);
    expect(calls.ops).toEqual([["from", "users"], ["select", "id, name"], ["eq", "household_id", "h"], ["order", "name"]]);
  });

  it("drops data when the server returns an error", async () => {
    const { client } = fakeClient({ data: "ignored", error: { message: "invalid invite code" } });
    expect(await supabaseGateway(client).joinHousehold("3fa91c0b")).toEqual({ data: null, error: { message: "invalid invite code" } });
  });

  it("reads only the signed-in user's own row", async () => {
    const { client, calls } = fakeClient({ data: profile({ household_id: null, location: null }), error: null });
    expect((await supabaseGateway(client).loadProfile()).data).toMatchObject({ id: "user-1", name: "Ana" });
    expect(calls.ops).toEqual([["from", "users"], ["select", "id, household_id, name, location"], ["eq", "id", "user-1"]]);
  });

  it("updates only the signed-in user's own row, and only the location", async () => {
    const { client, calls } = fakeClient({ data: null, error: null });
    await supabaseGateway(client).updateLocation("Conway");
    expect(calls.ops).toEqual([["from", "users"], ["update", { location: "Conway" }], ["eq", "id", "user-1"]]);
  });

  it("loads the household by id", async () => {
    const { client, calls } = fakeClient({ data: { id: "h", name: "Home", invite_code: "3fa91c0b" }, error: null });
    expect((await supabaseGateway(client).loadHousehold("h")).data).toMatchObject({ invite_code: "3fa91c0b" });
    expect(calls.ops).toContainEqual(["from", "households"]);
    expect(calls.ops).toContainEqual(["eq", "id", "h"]);
  });

  it("reports an unauthenticated user instead of querying", async () => {
    const signedOut = fakeClient({ data: null, error: null }, null);
    const g = supabaseGateway(signedOut.client);
    expect(await g.loadProfile()).toEqual({ data: null, error: { message: "not authenticated" } });
    expect(await g.updateLocation("x")).toEqual({ data: null, error: { message: "not authenticated" } });
    expect(signedOut.calls.ops).toEqual([]);
    const authFail = fakeClient({ data: null, error: null }, null, "network down");
    expect(await supabaseGateway(authFail.client).loadProfile()).toEqual({ data: null, error: { message: "network down" } });
  });
});
