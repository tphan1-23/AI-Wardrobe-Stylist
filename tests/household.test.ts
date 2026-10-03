import { describe, expect, it, vi } from "vitest";
import {
  createHousehold,
  friendlyHouseholdError,
  getHousehold,
  getProfile,
  joinHousehold,
  normalizeInviteCode,
  updateProfile,
  validateHouseholdName,
  validateInviteCode,
  type HouseholdClient,
} from "../frontend/src/services/household.ts";

type Reply = { data?: unknown; error?: { message: string } | null };

// Fake client that records every call. `reply` is what the server answers.
function fakeClient(reply: Reply = {}) {
  const calls = { rpc: [] as unknown[], select: [] as unknown[], eq: [] as unknown[], update: [] as unknown[] };
  const result = { data: reply.data ?? null, error: reply.error ?? null };
  const client: HouseholdClient = {
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => {
      calls.rpc.push({ fn, args });
      return Promise.resolve(result);
    }),
    from: vi.fn((table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => {
          calls.select.push({ table, columns });
          calls.eq.push({ column, value });
          return { maybeSingle: () => Promise.resolve(result) };
        },
      }),
      update: (values: Record<string, unknown>) => ({
        eq: (column: string, value: string) => {
          calls.update.push({ table, values });
          calls.eq.push({ column, value });
          return Promise.resolve({ error: result.error });
        },
      }),
    })),
  };
  return { client, calls };
}

function throwingClient(): HouseholdClient {
  const boom = () => {
    throw new Error("offline");
  };
  return { rpc: boom, from: boom } as unknown as HouseholdClient;
}

const profileRow = { id: "u1", household_id: "h1", name: "Thanh", location: "Conway" };
const householdRow = { id: "h1", name: "Home", invite_code: "abcd1234" };

describe("validation helpers", () => {
  it("normalizes invite codes", () => {
    expect(normalizeInviteCode("  ABCD1234 ")).toBe("abcd1234");
  });

  it("validates household name and invite code", () => {
    expect(validateHouseholdName("  ")).toMatch(/name for your household/i);
    expect(validateHouseholdName("Home")).toBeNull();
    expect(validateInviteCode("   ")).toMatch(/invite code/i);
    expect(validateInviteCode("abcd1234")).toBeNull();
  });

  it("maps the invalid invite code error and passes others through", () => {
    expect(friendlyHouseholdError("invalid invite code")).toMatch(/doesn't match any household/i);
    expect(friendlyHouseholdError("boom")).toBe("boom");
  });
});

describe("getProfile", () => {
  it("loads the profile for the user id", async () => {
    const { client, calls } = fakeClient({ data: profileRow });
    expect(await getProfile(client, "u1")).toEqual({ ok: true, data: profileRow });
    expect(calls.select).toEqual([{ table: "users", columns: "id, household_id, name, location" }]);
    expect(calls.eq).toEqual([{ column: "id", value: "u1" }]);
  });

  it("reports a missing profile", async () => {
    const { client } = fakeClient({ data: null });
    expect(await getProfile(client, "u1")).toEqual({ ok: false, error: "Your profile could not be found." });
  });

  it("returns server errors", async () => {
    const { client } = fakeClient({ error: { message: "denied" } });
    expect(await getProfile(client, "u1")).toEqual({ ok: false, error: "denied" });
  });

  it("handles network failures", async () => {
    expect(await getProfile(throwingClient(), "u1")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/could not reach/i),
    });
  });
});

describe("getHousehold", () => {
  it("loads the household including its invite code", async () => {
    const { client, calls } = fakeClient({ data: householdRow });
    expect(await getHousehold(client, "h1")).toEqual({ ok: true, data: householdRow });
    expect(calls.select).toEqual([{ table: "households", columns: "id, name, invite_code" }]);
  });

  it("reports a missing household", async () => {
    const { client } = fakeClient({ data: null });
    expect(await getHousehold(client, "h1")).toEqual({ ok: false, error: "Your household could not be found." });
  });

  it("returns server errors", async () => {
    const { client } = fakeClient({ error: { message: "denied" } });
    expect(await getHousehold(client, "h1")).toEqual({ ok: false, error: "denied" });
  });

  it("handles network failures", async () => {
    expect((await getHousehold(throwingClient(), "h1")).ok).toBe(false);
  });
});

describe("createHousehold", () => {
  it("rejects an empty name without calling the server", async () => {
    const { client, calls } = fakeClient();
    expect((await createHousehold(client, "  ")).ok).toBe(false);
    expect(calls.rpc).toHaveLength(0);
  });

  it("calls create_household with the trimmed name and returns the id", async () => {
    const { client, calls } = fakeClient({ data: "h1" });
    expect(await createHousehold(client, "  Home ")).toEqual({ ok: true, data: "h1" });
    expect(calls.rpc).toEqual([{ fn: "create_household", args: { p_name: "Home" } }]);
  });

  it("returns server errors", async () => {
    const { client } = fakeClient({ error: { message: "boom" } });
    expect(await createHousehold(client, "Home")).toEqual({ ok: false, error: "boom" });
  });

  it("handles network failures", async () => {
    expect((await createHousehold(throwingClient(), "Home")).ok).toBe(false);
  });
});

describe("joinHousehold", () => {
  it("rejects an empty code without calling the server", async () => {
    const { client, calls } = fakeClient();
    expect((await joinHousehold(client, " ")).ok).toBe(false);
    expect(calls.rpc).toHaveLength(0);
  });

  it("calls join_household with a normalized code", async () => {
    const { client, calls } = fakeClient({ data: "h1" });
    expect(await joinHousehold(client, " ABCD1234 ")).toEqual({ ok: true, data: "h1" });
    expect(calls.rpc).toEqual([{ fn: "join_household", args: { p_code: "abcd1234" } }]);
  });

  it("shows a friendly message for a wrong code", async () => {
    const { client } = fakeClient({ error: { message: "invalid invite code" } });
    expect(await joinHousehold(client, "nope")).toEqual({
      ok: false,
      error: "That invite code doesn't match any household.",
    });
  });

  it("handles network failures", async () => {
    expect((await joinHousehold(throwingClient(), "abcd1234")).ok).toBe(false);
  });
});

describe("updateProfile", () => {
  it("rejects an empty name without calling the server", async () => {
    const { client, calls } = fakeClient();
    expect((await updateProfile(client, "u1", { name: " ", location: "x" })).ok).toBe(false);
    expect(calls.update).toHaveLength(0);
  });

  it("saves the trimmed name and location for the user", async () => {
    const { client, calls } = fakeClient();
    expect(await updateProfile(client, "u1", { name: " Thanh ", location: " Conway " })).toEqual({
      ok: true,
      data: null,
    });
    expect(calls.update).toEqual([{ table: "users", values: { name: "Thanh", location: "Conway" } }]);
    expect(calls.eq).toEqual([{ column: "id", value: "u1" }]);
  });

  it("stores an empty location as null", async () => {
    const { client, calls } = fakeClient();
    await updateProfile(client, "u1", { name: "Thanh", location: "  " });
    expect(calls.update).toEqual([{ table: "users", values: { name: "Thanh", location: null } }]);
  });

  it("returns server errors", async () => {
    const { client } = fakeClient({ error: { message: "denied" } });
    expect(await updateProfile(client, "u1", { name: "T", location: "" })).toEqual({ ok: false, error: "denied" });
  });

  it("handles network failures", async () => {
    expect((await updateProfile(throwingClient(), "u1", { name: "T", location: "" })).ok).toBe(false);
  });
});
