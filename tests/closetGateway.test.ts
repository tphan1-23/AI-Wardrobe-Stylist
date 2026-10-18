import { describe, expect, it, vi } from "vitest";
import { supabaseClosetGateway, type ClosetClientLike } from "../frontend/src/services/closetGateway.ts";
import { GARMENT_BUCKET, PHOTO_LINK_SECONDS, SIGN_BATCH_SIZE, signPhotoUrls } from "../frontend/src/services/storage.ts";

type Reply = { data: unknown; error: { message: string } | null };

function fakeClient(reply: Reply = { data: [], error: null }, remove: Reply = { data: null, error: null }, sign?: ReturnType<typeof vi.fn>) {
  const ops: unknown[][] = [];
  const signed = sign ?? vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })), error: null }));
  const query = (): never => {
    const q = {
      select: (c: string) => (ops.push(["select", c]), q),
      update: (v: Record<string, unknown>) => (ops.push(["update", v]), q),
      delete: () => (ops.push(["delete"]), q),
      eq: (c: string, v: string) => (ops.push(["eq", c, v]), q),
      order: (c: string, o: { ascending: boolean }) => (ops.push(["order", c, o]), q),
      then: (res: (r: Reply) => unknown) => Promise.resolve(reply).then(res),
    };
    return q as never;
  };
  const client: ClosetClientLike = {
    from: (table) => (ops.push(["from", table]), query()),
    storage: {
      from: (bucket) => ({
        createSignedUrls: signed as never,
        remove: async (paths) => (ops.push(["remove", bucket, paths]), remove),
      }),
    },
  };
  return { client, ops, signed };
}

describe("loadGarments", () => {
  it("reads garments newest first (row-level security decides whose)", async () => {
    const rows = [{ id: "g-1" }];
    const { client, ops } = fakeClient({ data: rows, error: null });
    expect(await supabaseClosetGateway(client).loadGarments()).toEqual({ data: rows, error: null });
    expect(ops).toEqual([
      ["from", "garments"],
      ["select", "id, owner_id, type, color, season, warmth, status, favorite, image_path, created_at"],
      ["order", "created_at", { ascending: false }],
    ]);
  });

  it("drops data when the server returns an error", async () => {
    const { client } = fakeClient({ data: [{ id: "x" }], error: { message: "denied" } });
    expect(await supabaseClosetGateway(client).loadGarments()).toEqual({ data: null, error: { message: "denied" } });
  });
});

describe("updateGarment", () => {
  it("changes only the chosen garment and asks for the changed row back", async () => {
    const { client, ops } = fakeClient({ data: [{ id: "g-1" }], error: null });
    const changes = { type: "jeans", color: "blue", season: "all", warmth: 3, status: "dirty" } as const;
    const result = await supabaseClosetGateway(client).updateGarment("g-1", changes);
    expect(result.error).toBeNull();
    expect(ops).toEqual([["from", "garments"], ["update", changes], ["eq", "id", "g-1"], ["select", "id"]]);
  });

  it("reports a refused update (zero rows changed) as a failure, not a success", async () => {
    const { client } = fakeClient({ data: [], error: null });
    const changes = { type: "jeans", color: "blue", season: "all", warmth: 3, status: "clean" } as const;
    expect(await supabaseClosetGateway(client).updateGarment("someone-elses", changes)).toEqual({
      data: null,
      error: { message: "garment not found or not yours" },
    });
  });

  it("passes on a database error, and treats a non-list answer as a failure", async () => {
    const changes = { type: "jeans", color: "blue", season: "all", warmth: 3, status: "clean" } as const;
    const failing = fakeClient({ data: null, error: { message: "boom" } });
    expect(await supabaseClosetGateway(failing.client).updateGarment("g", changes)).toEqual({ data: null, error: { message: "boom" } });
    const odd = fakeClient({ data: null, error: null });
    expect((await supabaseClosetGateway(odd.client).updateGarment("g", changes)).error).not.toBeNull();
  });
});

describe("setFavorite", () => {
  it("changes only the favorite flag of the chosen garment and asks for the changed row back", async () => {
    const { client, ops } = fakeClient({ data: [{ id: "g-1" }], error: null });
    expect((await supabaseClosetGateway(client).setFavorite("g-1", true)).error).toBeNull();
    expect(ops).toEqual([["from", "garments"], ["update", { favorite: true }], ["eq", "id", "g-1"], ["select", "id"]]);
  });

  it("reports a refused change (not the person's garment, zero rows) as a failure", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await supabaseClosetGateway(client).setFavorite("someone-elses", true)).toEqual({
      data: null,
      error: { message: "garment not found or not yours" },
    });
  });

  it("passes on a database error", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    expect(await supabaseClosetGateway(client).setFavorite("g", false)).toEqual({ data: null, error: { message: "boom" } });
  });
});

describe("deleteGarment", () => {
  it("deletes only the chosen garment and asks for the deleted row back", async () => {
    const { client, ops } = fakeClient({ data: [{ id: "g-1" }], error: null });
    expect((await supabaseClosetGateway(client).deleteGarment("g-1")).error).toBeNull();
    expect(ops).toEqual([["from", "garments"], ["delete"], ["eq", "id", "g-1"], ["select", "id"]]);
  });

  it("reports a refused delete (zero rows) as a failure", async () => {
    const { client } = fakeClient({ data: [], error: null });
    expect(await supabaseClosetGateway(client).deleteGarment("someone-elses")).toEqual({
      data: null,
      error: { message: "garment not found or not yours" },
    });
  });
});

describe("photos", () => {
  it("removes exactly that file from the private bucket", async () => {
    const { client, ops } = fakeClient();
    await supabaseClosetGateway(client).removePhoto("user-1/a.jpg");
    expect(ops).toEqual([["remove", GARMENT_BUCKET, ["user-1/a.jpg"]]]);
  });

  it("signs photo links through the shared helper", async () => {
    const { client } = fakeClient();
    expect(await supabaseClosetGateway(client).signPhotos(["a.jpg"])).toEqual({ data: { "a.jpg": "https://signed/a.jpg" }, error: null });
  });
});

describe("signPhotoUrls", () => {
  it("asks for the links in batches so a big closet is not one huge request", async () => {
    const { client, signed } = fakeClient();
    const paths = Array.from({ length: SIGN_BATCH_SIZE * 2 + 5 }, (_, i) => `u/${i}.jpg`);
    const result = await signPhotoUrls(client, paths);
    expect(signed).toHaveBeenCalledTimes(3);
    expect(signed.mock.calls.map((c) => (c[0] as string[]).length)).toEqual([SIGN_BATCH_SIZE, SIGN_BATCH_SIZE, 5]);
    expect(signed.mock.calls[0]![1]).toBe(PHOTO_LINK_SECONDS);
    expect(Object.keys(result.data ?? {})).toHaveLength(paths.length);
  });

  it("asks for nothing when there are no photos", async () => {
    const { client, signed } = fakeClient();
    expect(await signPhotoUrls(client, [])).toEqual({ data: {}, error: null });
    expect(signed).not.toHaveBeenCalled();
  });

  it("stops at a storage error, and skips entries that failed or have no path", async () => {
    const failing = fakeClient(undefined, undefined, vi.fn(async () => ({ data: null, error: { message: "bucket missing" } })));
    expect(await signPhotoUrls(failing.client, ["a"])).toEqual({ data: null, error: { message: "bucket missing" } });
    const partial = fakeClient(undefined, undefined, vi.fn(async () => ({
      data: [
        { path: "a", signedUrl: "https://s/a", error: null },
        { path: "b", signedUrl: "", error: "not found" },
        { path: null, signedUrl: "https://s/x", error: null },
      ],
      error: null,
    })));
    expect(await signPhotoUrls(partial.client, ["a", "b"])).toEqual({ data: { a: "https://s/a" }, error: null });
    const nothing = fakeClient(undefined, undefined, vi.fn(async () => ({ data: null, error: null })));
    expect(await signPhotoUrls(nothing.client, ["a"])).toEqual({ data: {}, error: null });
  });
});
