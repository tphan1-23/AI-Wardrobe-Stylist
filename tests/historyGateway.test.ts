import { describe, expect, it } from "vitest";
import { supabaseHistoryGateway, type HistoryClientLike } from "../frontend/src/services/historyGateway.ts";

type Reply = { data: unknown; error: { message: string } | null };

function fakeClient(reply: Reply = { data: [], error: null }, user: { id: string } | null = { id: "user-1" }, authError: string | null = null) {
  const ops: unknown[][] = [];
  const query = (): never => {
    const q = {
      select: (c: string) => (ops.push(["select", c]), q),
      update: (v: Record<string, unknown>) => (ops.push(["update", v]), q),
      eq: (c: string, v: unknown) => (ops.push(["eq", c, v]), q),
      gte: (c: string, v: string) => (ops.push(["gte", c, v]), q),
      in: (c: string, v: string[]) => (ops.push(["in", c, v]), q),
      order: (c: string, o: { ascending: boolean }) => (ops.push(["order", c, o]), q),
      then: (res: (r: Reply) => unknown) => Promise.resolve(reply).then(res),
    };
    return q as never;
  };
  const client: HistoryClientLike = {
    from: (table) => (ops.push(["from", table]), query()),
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })), error: null }),
      }),
    },
    auth: { getUser: async () => ({ data: { user }, error: authError ? { message: authError } : null }) },
  };
  return { client, ops };
}

const COLUMNS = "id, date, garment_ids, favorite, created_at";

describe("loadWorn", () => {
  it("reads only the signed-in person's accepted outfits from that day on, newest first", async () => {
    const rows = [{ id: "s-1" }];
    const { client, ops } = fakeClient({ data: rows, error: null });
    expect(await supabaseHistoryGateway(client).loadWorn("2026-10-12")).toEqual({ data: rows, error: null });
    expect(ops).toEqual([
      ["from", "suggestions"],
      ["select", COLUMNS],
      ["eq", "user_id", "user-1"],
      ["eq", "kind", "today"],
      ["eq", "accepted", true],
      ["gte", "date", "2026-10-12"],
      ["order", "date", { ascending: false }],
      ["order", "created_at", { ascending: false }],
    ]);
  });

  it("drops data on a server error, and reports an unauthenticated person without querying", async () => {
    const failing = fakeClient({ data: [{ id: "x" }], error: { message: "denied" } });
    expect(await supabaseHistoryGateway(failing.client).loadWorn("2026-10-12")).toEqual({ data: null, error: { message: "denied" } });
    const signedOut = fakeClient(undefined, null);
    expect(await supabaseHistoryGateway(signedOut.client).loadWorn("2026-10-12")).toEqual({ data: null, error: { message: "not authenticated" } });
    expect(signedOut.ops).toEqual([]);
    const authFail = fakeClient(undefined, null, "network down");
    expect(await supabaseHistoryGateway(authFail.client).loadWorn("2026-10-12")).toEqual({ data: null, error: { message: "network down" } });
  });
});

describe("loadFavoriteOutfits", () => {
  it("reads only the person's favorite outfits, newest first", async () => {
    const { client, ops } = fakeClient();
    await supabaseHistoryGateway(client).loadFavoriteOutfits();
    expect(ops).toEqual([
      ["from", "suggestions"],
      ["select", COLUMNS],
      ["eq", "user_id", "user-1"],
      ["eq", "kind", "today"],
      ["eq", "favorite", true],
      ["order", "date", { ascending: false }],
      ["order", "created_at", { ascending: false }],
    ]);
  });

  it("reports an unauthenticated person without querying", async () => {
    const signedOut = fakeClient(undefined, null);
    expect(await supabaseHistoryGateway(signedOut.client).loadFavoriteOutfits()).toEqual({ data: null, error: { message: "not authenticated" } });
    expect(signedOut.ops).toEqual([]);
  });
});

describe("garments and photos", () => {
  it("asks for exactly the garments of the outfits", async () => {
    const { client, ops } = fakeClient({ data: [{ id: "g-1" }], error: null });
    expect((await supabaseHistoryGateway(client).loadGarments(["g-1", "g-2"])).data).toEqual([{ id: "g-1" }]);
    expect(ops).toEqual([["from", "garments"], ["select", "id, type, color, season, warmth, status, image_path"], ["in", "id", ["g-1", "g-2"]]]);
  });

  it("signs photo links through the shared helper", async () => {
    expect(await supabaseHistoryGateway(fakeClient().client).signPhotos(["a.jpg"])).toEqual({ data: { "a.jpg": "https://signed/a.jpg" }, error: null });
  });
});

describe("setFavorite", () => {
  it("changes only the favorite flag of the chosen outfit and asks for the changed row back", async () => {
    const { client, ops } = fakeClient({ data: [{ id: "s-1" }], error: null });
    expect((await supabaseHistoryGateway(client).setFavorite("s-1", true)).error).toBeNull();
    expect(ops).toEqual([["from", "suggestions"], ["update", { favorite: true }], ["eq", "id", "s-1"], ["select", "id"]]);
  });

  it("reports a refused change (zero rows, not the person's outfit) as a failure", async () => {
    expect(await supabaseHistoryGateway(fakeClient({ data: [], error: null }).client).setFavorite("someone-elses", true)).toEqual({
      data: null,
      error: { message: "outfit not found or not yours" },
    });
  });

  it("passes on a database error, and treats a non-list answer as a failure", async () => {
    expect(await supabaseHistoryGateway(fakeClient({ data: null, error: { message: "boom" } }).client).setFavorite("s", false)).toEqual({
      data: null,
      error: { message: "boom" },
    });
    expect((await supabaseHistoryGateway(fakeClient({ data: null, error: null }).client).setFavorite("s", false)).error).not.toBeNull();
  });
});
