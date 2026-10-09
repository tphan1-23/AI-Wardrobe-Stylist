import { describe, expect, it, vi } from "vitest";
import {
  GARMENT_BUCKET,
  PHOTO_LINK_SECONDS,
  supabaseTodayGateway,
  type TodayClientLike,
} from "../frontend/src/services/todayGateway.ts";

type Reply = { data: unknown; error: { message: string } | null };
type Invoke = TodayClientLike["functions"]["invoke"];

function fakeClient(
  options: {
    reply?: Reply;
    user?: { id: string } | null;
    authError?: string | null;
    invoke?: Invoke;
    sign?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const { reply = { data: [], error: null }, user = { id: "user-1" }, authError = null } = options;
  const ops: unknown[][] = [];
  const rpcs: [string, Record<string, unknown>][] = [];
  const query = (): never => {
    const q = {
      select: (c: string) => (ops.push(["select", c]), q),
      eq: (c: string, v: string) => (ops.push(["eq", c, v]), q),
      in: (c: string, v: string[]) => (ops.push(["in", c, v]), q),
      order: (c: string, o: { ascending: boolean }) => (ops.push(["order", c, o]), q),
      then: (res: (r: Reply) => unknown) => Promise.resolve(reply).then(res),
    };
    return q as never;
  };
  const sign = options.sign ?? vi.fn(async () => ({ data: [], error: null }));
  const client: TodayClientLike = {
    from: (table) => (ops.push(["from", table]), query()),
    rpc: async (fn, args) => (rpcs.push([fn, args]), reply),
    functions: { invoke: options.invoke ?? vi.fn(async () => ({ data: null, error: null })) },
    storage: { from: (bucket) => (ops.push(["bucket", bucket]), { createSignedUrls: sign as never }) },
    auth: { getUser: async () => ({ data: { user }, error: authError ? { message: authError } : null }) },
  };
  return { client, ops, rpcs, sign };
}

const httpError = (status: unknown, body: () => Promise<unknown>) => ({
  message: "Edge Function returned a non-2xx status code",
  context: { status, json: body },
});

describe("loadSuggestions", () => {
  it("reads only the signed-in user's suggestions for that day, oldest first", async () => {
    const rows = [{ id: "s-1" }];
    const { client, ops } = fakeClient({ reply: { data: rows, error: null } });
    expect(await supabaseTodayGateway(client).loadSuggestions("2026-10-04")).toEqual({ data: rows, error: null });
    expect(ops).toEqual([
      ["from", "suggestions"],
      ["select", "id, date, garment_ids, feedback, accepted, created_at"],
      ["eq", "user_id", "user-1"],
      ["eq", "date", "2026-10-04"],
      ["order", "created_at", { ascending: true }],
    ]);
  });

  it("drops data when the server returns an error", async () => {
    const { client } = fakeClient({ reply: { data: [{ id: "x" }], error: { message: "denied" } } });
    expect(await supabaseTodayGateway(client).loadSuggestions("2026-10-04")).toEqual({
      data: null,
      error: { message: "denied" },
    });
  });

  it("reports an unauthenticated user instead of querying", async () => {
    const signedOut = fakeClient({ user: null });
    expect(await supabaseTodayGateway(signedOut.client).loadSuggestions("2026-10-04")).toEqual({
      data: null,
      error: { message: "not authenticated" },
    });
    expect(signedOut.ops).toEqual([]);
    const authFail = fakeClient({ user: null, authError: "network down" });
    expect(await supabaseTodayGateway(authFail.client).loadSuggestions("2026-10-04")).toEqual({
      data: null,
      error: { message: "network down" },
    });
  });
});

describe("loadGarments", () => {
  it("asks for exactly the garments of the outfit", async () => {
    const { client, ops } = fakeClient({ reply: { data: [{ id: "g-1" }], error: null } });
    expect((await supabaseTodayGateway(client).loadGarments(["g-1", "g-2"])).data).toEqual([{ id: "g-1" }]);
    expect(ops).toEqual([
      ["from", "garments"],
      ["select", "id, type, color, season, warmth, status, image_path"],
      ["in", "id", ["g-1", "g-2"]],
    ]);
  });
});

describe("signPhotos", () => {
  it(`makes ${PHOTO_LINK_SECONDS}-second links in the private ${GARMENT_BUCKET} bucket, keyed by path`, async () => {
    const sign = vi.fn(async () => ({
      data: [
        { path: "u/a.jpg", signedUrl: "https://signed/a", error: null },
        { path: "u/b.jpg", signedUrl: "", error: "not found" },
        { path: null, signedUrl: "https://signed/none", error: null },
      ],
      error: null,
    }));
    const { client, ops } = fakeClient({ sign });
    const result = await supabaseTodayGateway(client).signPhotos(["u/a.jpg", "u/b.jpg"]);
    expect(result).toEqual({ data: { "u/a.jpg": "https://signed/a" }, error: null });
    expect(ops).toContainEqual(["bucket", "garments"]);
    expect(sign).toHaveBeenCalledWith(["u/a.jpg", "u/b.jpg"], PHOTO_LINK_SECONDS);
  });

  it("passes on a storage error, and treats no data as no links", async () => {
    const failing = fakeClient({ sign: vi.fn(async () => ({ data: null, error: { message: "bucket missing" } })) });
    expect(await supabaseTodayGateway(failing.client).signPhotos(["x"])).toEqual({ data: null, error: { message: "bucket missing" } });
    const empty = fakeClient({ sign: vi.fn(async () => ({ data: null, error: null })) });
    expect(await supabaseTodayGateway(empty.client).signPhotos(["x"])).toEqual({ data: {}, error: null });
  });
});

describe("edge functions", () => {
  it("asks generate-outfit for a date, adding the rejected outfits only when there are some", async () => {
    const invoke = vi.fn(async () => ({ data: { status: "exhausted", reasoning: "r" }, error: null }));
    const { client } = fakeClient({ invoke });
    const g = supabaseTodayGateway(client);

    expect(await g.generateOutfit("2026-10-04", [])).toEqual({ data: { status: "exhausted", reasoning: "r" }, error: null });
    await g.generateOutfit("2026-10-04", ["s-1", "s-2"]);
    expect(invoke.mock.calls).toEqual([
      ["generate-outfit", { body: { date: "2026-10-04" } }],
      ["generate-outfit", { body: { date: "2026-10-04", exclude_suggestion_ids: ["s-1", "s-2"] } }],
    ]);
  });

  it("sends feedback to update-preferences with the argument names the function expects", async () => {
    const invoke = vi.fn(async () => ({ data: { suggestion_id: "s-1", updated_tags: [] }, error: null }));
    await supabaseTodayGateway(fakeClient({ invoke }).client).sendFeedback("s-1", "down");
    expect(invoke).toHaveBeenCalledWith("update-preferences", { body: { suggestion_id: "s-1", feedback: "down" } });
  });

  it("returns the status and the server's own message when a function answers with an error", async () => {
    const invoke = vi.fn(async () => ({
      data: null,
      error: httpError(409, async () => ({ error: "set your location first" })),
    }));
    expect(await supabaseTodayGateway(fakeClient({ invoke }).client).generateOutfit("2026-10-04", [])).toEqual({
      data: null,
      error: { message: "set your location first", status: 409 },
    });
  });

  it("keeps the generic message when the error body cannot be read", async () => {
    for (const body of [
      async () => { throw new Error("not json"); },
      async () => ({ error: 42 }),
      async () => null,
    ]) {
      const invoke = vi.fn(async () => ({ data: null, error: httpError(502, body) }));
      expect(await supabaseTodayGateway(fakeClient({ invoke }).client).generateOutfit("2026-10-04", [])).toEqual({
        data: null,
        error: { message: "Edge Function returned a non-2xx status code", status: 502 },
      });
    }
  });

  it("treats an error with no HTTP status as a network failure", async () => {
    for (const error of [
      { message: "Failed to send a request to the Edge Function" },
      httpError("500", async () => ({})),
      { message: "x", context: {} },
    ]) {
      const invoke = vi.fn(async () => ({ data: null, error }));
      const result = await supabaseTodayGateway(fakeClient({ invoke }).client).sendFeedback("s-1", "up");
      expect(result.data).toBeNull();
      expect(result.error?.message).toMatch(/could not reach the server/i);
      expect(result.error?.status).toBeUndefined();
    }
  });
});

describe("acceptSuggestion", () => {
  it("calls the accept_suggestion function with the argument name it expects", async () => {
    const { client, rpcs } = fakeClient({ reply: { data: null, error: null } });
    expect(await supabaseTodayGateway(client).acceptSuggestion("s-1")).toEqual({ data: null, error: null });
    expect(rpcs).toEqual([["accept_suggestion", { p_suggestion_id: "s-1" }]]);
  });

  it("passes on a server error", async () => {
    const { client } = fakeClient({ reply: { data: null, error: { message: "suggestion not found" } } });
    expect(await supabaseTodayGateway(client).acceptSuggestion("s-1")).toEqual({
      data: null,
      error: { message: "suggestion not found" },
    });
  });
});
