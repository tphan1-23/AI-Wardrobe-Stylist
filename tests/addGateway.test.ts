import { describe, expect, it, vi } from "vitest";
import { GARMENT_BUCKET, supabaseAddGateway, type AddClientLike } from "../frontend/src/services/addGateway.ts";

type Reply = { data: unknown; error: { message: string } | null };

function fakeClient(
  options: {
    user?: { id: string } | null;
    authError?: string | null;
    storage?: Reply;
    insert?: Reply;
    invoke?: AddClientLike["functions"]["invoke"];
  } = {},
) {
  const { user = { id: "user-1" }, authError = null, storage = { data: null, error: null }, insert = { data: null, error: null } } = options;
  const log: unknown[][] = [];
  const client: AddClientLike = {
    auth: { getUser: async () => ({ data: { user }, error: authError ? { message: authError } : null }) },
    from: (table) => ({ insert: (values) => (log.push(["insert", table, values]), Promise.resolve(insert)) }),
    storage: {
      from: (bucket) => ({
        upload: async (path, body, opts) => (log.push(["upload", bucket, path, body, opts]), storage),
        remove: async (paths) => (log.push(["remove", bucket, paths]), storage),
      }),
    },
    functions: { invoke: options.invoke ?? (async () => ({ data: null, error: null })) },
  };
  return { client, log };
}

const decode = (b64: string) => new TextEncoder().encode(`decoded:${b64}`).buffer as ArrayBuffer;

describe("currentUserId", () => {
  it("returns the signed-in user's id", async () => {
    expect(await supabaseAddGateway(fakeClient().client, decode).currentUserId()).toEqual({ data: "user-1", error: null });
  });

  it("reports an unauthenticated user and an auth failure", async () => {
    expect(await supabaseAddGateway(fakeClient({ user: null }).client, decode).currentUserId()).toEqual({
      data: null,
      error: { message: "not authenticated" },
    });
    expect(await supabaseAddGateway(fakeClient({ user: null, authError: "network down" }).client, decode).currentUserId()).toEqual({
      data: null,
      error: { message: "network down" },
    });
  });
});

describe("uploadPhoto", () => {
  it("sends the decoded photo to the private bucket as a jpeg, never overwriting", async () => {
    const { client, log } = fakeClient();
    const result = await supabaseAddGateway(client, decode).uploadPhoto("user-1/a.jpg", "QUJD");
    expect(result).toEqual({ data: null, error: null });
    expect(log).toEqual([["upload", GARMENT_BUCKET, "user-1/a.jpg", decode("QUJD"), { contentType: "image/jpeg", upsert: false }]]);
  });

  it("drops data and passes on a storage error", async () => {
    const { client } = fakeClient({ storage: { data: { path: "x" }, error: { message: "denied" } } });
    expect(await supabaseAddGateway(client, decode).uploadPhoto("p", "QUJD")).toEqual({ data: null, error: { message: "denied" } });
  });
});

describe("analyzePhoto", () => {
  it("asks analyze-garment about the uploaded file", async () => {
    const invoke = vi.fn(async () => ({ data: { tags: {}, needs_review: [], warnings: [], confidence: {} }, error: null }));
    const result = await supabaseAddGateway(fakeClient({ invoke }).client, decode).analyzePhoto("user-1/a.jpg");
    expect(invoke).toHaveBeenCalledWith("analyze-garment", { body: { image_path: "user-1/a.jpg" } });
    expect(result.error).toBeNull();
  });

  it("keeps the HTTP status and the server's message when the function refuses", async () => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: { message: "non-2xx", context: { status: 429, json: async () => ({ error: "AI limit reached" }) } },
    }));
    expect(await supabaseAddGateway(fakeClient({ invoke }).client, decode).analyzePhoto("p")).toEqual({
      data: null,
      error: { message: "AI limit reached", status: 429 },
    });
  });
});

describe("saveGarment", () => {
  it("inserts a copy of the row into garments", async () => {
    const { client, log } = fakeClient();
    const row = { owner_id: "user-1", image_path: "user-1/a.jpg", type: "jeans", color: "blue", season: "all", warmth: 3 } as const;
    expect(await supabaseAddGateway(client, decode).saveGarment(row)).toEqual({ data: null, error: null });
    expect(log).toEqual([["insert", "garments", row]]);
    expect((log[0] as unknown[])[2]).not.toBe(row);
  });

  it("passes on a database error", async () => {
    const { client } = fakeClient({ insert: { data: null, error: { message: "violates row-level security" } } });
    const row = { owner_id: "other", image_path: "p", type: "jeans", color: "blue", season: "all", warmth: 3 } as const;
    expect(await supabaseAddGateway(client, decode).saveGarment(row)).toEqual({
      data: null,
      error: { message: "violates row-level security" },
    });
  });
});

describe("removePhoto", () => {
  it("removes exactly that file from the bucket", async () => {
    const { client, log } = fakeClient();
    await supabaseAddGateway(client, decode).removePhoto("user-1/a.jpg");
    expect(log).toEqual([["remove", GARMENT_BUCKET, ["user-1/a.jpg"]]]);
  });
});
