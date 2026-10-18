import { describe, expect, it, vi } from "vitest";
import {
  COLOR_CHOICES,
  MAX_PHOTO_BYTES,
  SEASON_CHOICES,
  TYPE_CHOICES,
  WARMTH_CHOICES,
  addPhoto,
  confirmTag,
  contentTypeFor,
  discardPhoto,
  friendlyAddError,
  manualReview,
  normalizeExtension,
  photoPath,
  reviewFromAnalysis,
  saveGarment,
  setTag,
  unconfirmedFields,
  validatePhoto,
  validateReview,
  type AddGateway,
  type ReviewState,
} from "../frontend/src/services/add.ts";
import { supabaseAddGateway, type AddClientLike } from "../frontend/src/services/addGateway.ts";
import { COLORS, GARMENT_TYPES, SEASONS } from "../supabase/functions/_shared/tag-schema.ts";
import type { AnalyzeGarmentResponse } from "../supabase/functions/_shared/types.ts";

const bytes = (n: number) => new ArrayBuffer(n);
const photo = { data: bytes(10), extension: "JPG" };
const analysis = (over: Partial<AnalyzeGarmentResponse> = {}): AnalyzeGarmentResponse => ({
  tags: { type: "jeans", color: "blue", season: "all", warmth: 3 },
  confidence: {},
  needs_review: [],
  warnings: [],
  ...over,
});

function fakeGateway(over: Partial<AddGateway> = {}) {
  const gateway = {
    uploadPhoto: vi.fn(async () => ({ data: {}, error: null })),
    removePhoto: vi.fn(async () => ({ data: {}, error: null })),
    analyze: vi.fn(async () => ({ data: analysis(), error: null })),
    insertGarment: vi.fn(async () => ({ data: {}, error: null })),
    ...over,
  };
  return gateway as typeof gateway & AddGateway;
}

describe("photo helpers", () => {
  it("normalizes extensions and picks a content type", () => {
    expect(normalizeExtension(" .JPEG ")).toBe("jpg");
    expect(normalizeExtension("HEIC")).toBe("heic");
    expect(contentTypeFor("jpg")).toBe("image/jpeg");
    expect(contentTypeFor(".PNG")).toBe("image/png");
    expect(contentTypeFor("webp")).toBe("image/webp");
    expect(contentTypeFor("heic")).toBe("image/heic");
    expect(contentTypeFor("heif")).toBe("image/heif");
    expect(contentTypeFor("weird")).toBe("image/jpeg");
  });

  it("puts the photo in the person's own folder", () => {
    expect(photoPath("u-1", "abc", ".JPEG")).toBe("u-1/abc.jpg");
  });

  it("rejects unsupported, empty and oversized photos", () => {
    expect(validatePhoto(photo)).toBeNull();
    expect(validatePhoto({ data: bytes(5), extension: "gif" })).toContain("not supported");
    expect(validatePhoto({ data: bytes(0), extension: "jpg" })).toContain("empty");
    expect(validatePhoto({ data: bytes(MAX_PHOTO_BYTES + 1), extension: "jpg" })).toContain("too large");
    expect(validatePhoto({ data: bytes(MAX_PHOTO_BYTES), extension: "png" })).toBeNull();
  });

  it("offers exactly the tag schema's choices", () => {
    expect(TYPE_CHOICES).toEqual(GARMENT_TYPES);
    expect(COLOR_CHOICES).toEqual(COLORS);
    expect(SEASON_CHOICES).toEqual(SEASONS);
    expect(WARMTH_CHOICES).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("reviewFromAnalysis", () => {
  it("keeps valid tags and lists what the AI flagged", () => {
    const state = reviewFromAnalysis("u/p.jpg", analysis({ needs_review: ["season"], warnings: ["blurry"] }));
    expect(state).toMatchObject({ photoPath: "u/p.jpg", needsReview: ["season"], confirmed: [], manual: false, warnings: ["blurry"] });
    expect(state.tags).toEqual({ type: "jeans", color: "blue", season: "all", warmth: 3 });
  });

  it("drops invalid values and flags them even when the AI did not", () => {
    const bad = analysis({ tags: { type: "spaceship", color: "blue", season: "monsoon", warmth: 9 } as never });
    const state = reviewFromAnalysis("u/p.jpg", bad);
    expect(state.tags).toEqual({ color: "blue" });
    expect(state.needsReview).toEqual(["type", "season", "warmth"]);
  });

  it("ignores unknown flagged field names and tolerates missing arrays", () => {
    const odd = { tags: {}, confidence: {}, needs_review: ["mood"] } as unknown as AnalyzeGarmentResponse;
    const state = reviewFromAnalysis("u/p.jpg", odd);
    expect(state.needsReview).toEqual(["type", "color", "season", "warmth"]);
    expect(state.warnings).toEqual([]);
    const noTags = { confidence: {} } as unknown as AnalyzeGarmentResponse;
    expect(reviewFromAnalysis("u/p.jpg", noTags).tags).toEqual({});
  });
});

describe("review editing", () => {
  const flagged = () => reviewFromAnalysis("u/p.jpg", analysis({ needs_review: ["season", "color"] }));

  it("requires every flagged field to be confirmed before saving", () => {
    let state = flagged();
    expect(unconfirmedFields(state)).toEqual(["color", "season"]);
    expect(validateReview(state)).toContain("Check the color, season");
    state = confirmTag(state, "color");
    expect(validateReview(state)).toContain("Check the season");
    state = setTag(state, "season", "winter"); // editing counts as confirming
    expect(state.tags.season).toBe("winter");
    expect(validateReview(state)).toBeNull();
  });

  it("does not need confirmation for fields the AI was sure about", () => {
    const state = reviewFromAnalysis("u/p.jpg", analysis());
    expect(validateReview(state)).toBeNull();
  });

  it("cannot confirm a field that has no value, and a repeated confirm changes nothing", () => {
    const empty = manualReview("u/p.jpg", "AI down");
    expect(confirmTag(empty, "type")).toBe(empty);
    const state = confirmTag(flagged(), "color");
    expect(confirmTag(state, "color")).toBe(state);
  });

  it("ignores values outside the tag schema", () => {
    const state = flagged();
    expect(setTag(state, "color", "chartreuse" as never)).toBe(state);
    expect(setTag(state, "warmth", 0 as never)).toBe(state);
  });

  it("reports missing fields before unconfirmed ones", () => {
    const manual = manualReview("u/p.jpg", "AI down");
    expect(validateReview(manual)).toBe("Choose the type, color, season, warmth.");
    expect(manual.manual).toBe(true);
    expect(manual.warnings).toEqual(["AI down"]);
  });

  it("a manual review is saveable once every field is chosen", () => {
    let state = manualReview("u/p.jpg", "AI down");
    state = setTag(state, "type", "hoodie");
    state = setTag(state, "color", "gray");
    state = setTag(state, "season", "fall");
    state = setTag(state, "warmth", 4);
    expect(validateReview(state)).toBeNull();
  });
});

describe("addPhoto", () => {
  const newId = () => "id-1";

  it("uploads to the person's folder, asks the AI and returns the review", async () => {
    const gateway = fakeGateway();
    const result = await addPhoto(gateway, "u-1", photo, newId);
    expect(gateway.uploadPhoto).toHaveBeenCalledWith("u-1/id-1.jpg", photo.data, "image/jpeg");
    expect(gateway.analyze).toHaveBeenCalledWith("u-1/id-1.jpg");
    expect(result).toMatchObject({ ok: true, value: { photoPath: "u-1/id-1.jpg", manual: false } });
  });

  it("rejects a bad photo without uploading", async () => {
    const gateway = fakeGateway();
    const result = await addPhoto(gateway, "u-1", { data: bytes(1), extension: "gif" }, newId);
    expect(result).toMatchObject({ ok: false });
    expect(gateway.uploadPhoto).not.toHaveBeenCalled();
  });

  it("stops when the upload fails", async () => {
    const gateway = fakeGateway({ uploadPhoto: vi.fn(async () => ({ data: null, error: { message: "The resource already exists" } })) });
    const result = await addPhoto(gateway, "u-1", photo, newId);
    expect(result).toEqual({ ok: false, error: "That photo was already added. Please try again." });
    expect(gateway.analyze).not.toHaveBeenCalled();
  });

  it("falls back to typing the tags when the AI is out of quota (429) or down (502)", async () => {
    for (const status of [429, 502]) {
      const gateway = fakeGateway({ analyze: vi.fn(async () => ({ data: null, error: { message: "x", status } })) });
      const result = await addPhoto(gateway, "u-1", photo, newId);
      expect(result).toMatchObject({ ok: true, value: { manual: true, tags: {} } });
      expect(gateway.removePhoto).not.toHaveBeenCalled();
    }
  });

  it("falls back to typing the tags when the request never reached the AI", async () => {
    const gateway = fakeGateway({ analyze: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await addPhoto(gateway, "u-1", photo, newId)).toMatchObject({ ok: true, value: { manual: true } });
  });

  it("removes the photo again when the server says the photo is unusable", async () => {
    for (const [status, text] of [[400, "could not be used"], [404, "did not upload"], [403, "forbidden"]] as const) {
      const gateway = fakeGateway({ analyze: vi.fn(async () => ({ data: null, error: { message: "forbidden", status } })) });
      const result = await addPhoto(gateway, "u-1", photo, newId);
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining(text) });
      expect(gateway.removePhoto).toHaveBeenCalledWith("u-1/id-1.jpg");
    }
  });

  it("lets the person type the tags when the AI answers with nothing", async () => {
    const gateway = fakeGateway({ analyze: vi.fn(async () => ({ data: null, error: null })) });
    expect(await addPhoto(gateway, "u-1", photo, newId)).toMatchObject({ ok: true, value: { manual: true } });
    expect(gateway.removePhoto).not.toHaveBeenCalled();
  });
});

describe("saveGarment", () => {
  const ready = (): ReviewState => reviewFromAnalysis("u-1/p.jpg", analysis());

  it("inserts the garment for the signed-in user", async () => {
    const gateway = fakeGateway();
    expect(await saveGarment(gateway, "u-1", ready())).toEqual({ ok: true, value: true });
    expect(gateway.insertGarment).toHaveBeenCalledWith({
      owner_id: "u-1", image_path: "u-1/p.jpg", type: "jeans", color: "blue", season: "all", warmth: 3,
    });
  });

  it("refuses to save until the review is complete", async () => {
    const gateway = fakeGateway();
    const flagged = reviewFromAnalysis("u-1/p.jpg", analysis({ needs_review: ["color"] }));
    expect(await saveGarment(gateway, "u-1", flagged)).toMatchObject({ ok: false, error: expect.stringContaining("color") });
    expect(gateway.insertGarment).not.toHaveBeenCalled();
  });

  it("maps a save failure and keeps the photo so the person can retry", async () => {
    const gateway = fakeGateway({ insertGarment: vi.fn(async () => ({ data: null, error: { message: "row-level security", status: 401 } })) });
    expect(await saveGarment(gateway, "u-1", ready())).toEqual({ ok: false, error: "Your session expired. Please sign in again." });
    expect(gateway.removePhoto).not.toHaveBeenCalled();
  });

  it("handles a network failure while saving", async () => {
    const gateway = fakeGateway({ insertGarment: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await saveGarment(gateway, "u-1", ready())).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("discardPhoto and errors", () => {
  it("removes the photo, and never throws", async () => {
    const gateway = fakeGateway();
    await discardPhoto(gateway, { photoPath: "u-1/p.jpg" });
    expect(gateway.removePhoto).toHaveBeenCalledWith("u-1/p.jpg");
    const failing = fakeGateway({ removePhoto: vi.fn(async () => { throw new Error("offline"); }) });
    await expect(discardPhoto(failing, { photoPath: "x" })).resolves.toBeUndefined();
  });

  it("explains common failures", () => {
    expect(friendlyAddError("Payload too large")).toContain("too large");
    expect(friendlyAddError("duplicate key")).toContain("already added");
    expect(friendlyAddError("Network request failed")).toContain("Could not reach");
    expect(friendlyAddError("something odd")).toBe("something odd");
    expect(friendlyAddError("")).toContain("Could not reach");
  });
});

describe("supabaseAddGateway", () => {
  function fakeClient(over: { upload?: unknown; remove?: unknown; invoke?: unknown; insert?: unknown } = {}) {
    const calls: unknown[][] = [];
    const client = {
      from: (table: string) => ({ insert: async (v: Record<string, unknown>) => (calls.push(["insert", table, v]), over.insert ?? { data: null, error: null }) }),
      functions: { invoke: (over.invoke as AddClientLike["functions"]["invoke"]) ?? (async (name: string, o: { body: unknown }) => (calls.push(["invoke", name, o.body]), { data: analysis(), error: null })) },
      storage: {
        from: (bucket: string) => ({
          upload: async (p: string, d: ArrayBuffer, o: unknown) => (calls.push(["upload", bucket, p, o]), over.upload ?? { data: {}, error: null }),
          remove: async (p: string[]) => (calls.push(["remove", bucket, p]), over.remove ?? { data: {}, error: null }),
        }),
      },
    } as unknown as AddClientLike;
    return { client, calls };
  }

  it("uploads without replacing, removes, inserts and analyzes", async () => {
    const { client, calls } = fakeClient();
    const g = supabaseAddGateway(client);
    expect((await g.uploadPhoto("u/p.jpg", bytes(1), "image/jpeg")).error).toBeNull();
    expect((await g.removePhoto("u/p.jpg")).error).toBeNull();
    expect((await g.analyze("u/p.jpg")).data?.tags.type).toBe("jeans");
    expect((await g.insertGarment({ owner_id: "u", image_path: "u/p.jpg", type: "jeans", color: "blue", season: "all", warmth: 3 })).error).toBeNull();
    expect(calls).toEqual([
      ["upload", "garments", "u/p.jpg", { contentType: "image/jpeg", upsert: false }],
      ["remove", "garments", ["u/p.jpg"]],
      ["invoke", "analyze-garment", { image_path: "u/p.jpg" }],
      ["insert", "garments", { owner_id: "u", image_path: "u/p.jpg", type: "jeans", color: "blue", season: "all", warmth: 3 }],
    ]);
  });

  it("passes storage and table errors through", async () => {
    const { client } = fakeClient({ upload: { data: null, error: { message: "nope" } }, insert: { data: null, error: { message: "denied" } } });
    const g = supabaseAddGateway(client);
    expect((await g.uploadPhoto("p", bytes(1), "image/png")).error).toEqual({ message: "nope" });
    expect((await g.insertGarment({ owner_id: "u", image_path: "p", type: "jeans", color: "blue", season: "all", warmth: 3 })).error).toEqual({ message: "denied" });
  });

  it("keeps the HTTP status when the function fails", async () => {
    const invoke = async () => ({ data: null, error: { message: "non-2xx", context: { status: 429, json: async () => ({ error: "limit" }) } } });
    const g = supabaseAddGateway(fakeClient({ invoke }).client);
    expect((await g.analyze("u/p.jpg")).error).toEqual({ message: "limit", status: 429 });
  });
});
