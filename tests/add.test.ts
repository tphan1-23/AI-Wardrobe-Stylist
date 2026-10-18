import { describe, expect, it, vi } from "vitest";
import {
  MAX_PHOTO_BYTES,
  addPhoto,
  discardPhoto,
  friendlyAddError,
  newPhotoPath,
  photoBytes,
  saveGarment,
  type AddGateway,
} from "../frontend/src/services/add.ts";
import { chooseValue, confirmField, startReview } from "../frontend/src/services/garment.ts";
import type { GatewayResult } from "../frontend/src/services/household.ts";
import type { AnalyzeGarmentResponse } from "../supabase/functions/_shared/types.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string, status?: number): GatewayResult<never> => ({ data: null, error: { message, status } });

const SMALL = "QUJD"; // "ABC"
const analysis = (overrides: Partial<AnalyzeGarmentResponse> = {}): AnalyzeGarmentResponse => ({
  tags: { type: "jeans", color: "blue", season: "all", warmth: 3 },
  confidence: { type: 0.95, color: 0.9, season: 0.8, warmth: 0.8 },
  needs_review: [],
  warnings: [],
  ...overrides,
});

function gateway(overrides: Partial<AddGateway> = {}): AddGateway {
  return {
    currentUserId: vi.fn(async () => ok("user-1")),
    uploadPhoto: vi.fn(async () => ok(null)),
    analyzePhoto: vi.fn(async () => ok(analysis())),
    saveGarment: vi.fn(async () => ok(null)),
    removePhoto: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

describe("photoBytes", () => {
  it("works out the size from the base64 text, counting padding", () => {
    expect(photoBytes("QUJD")).toBe(3);
    expect(photoBytes("QUI=")).toBe(2);
    expect(photoBytes("QQ==")).toBe(1);
    expect(photoBytes("")).toBe(0);
  });
});

describe("newPhotoPath", () => {
  it("puts the photo in the person's own folder as a jpg", () => {
    expect(newPhotoPath("user-1", 1760000000000, () => 0)).toBe("user-1/1760000000000-00000000.jpg");
    expect(newPhotoPath("user-1", 5, () => 0.5)).toMatch(/^user-1\/5-[0-9a-z]{8}\.jpg$/);
  });

  it("makes a different name for different random values", () => {
    expect(newPhotoPath("u", 1, () => 0.1)).not.toBe(newPhotoPath("u", 1, () => 0.2));
  });

  it("works without injected time and randomness", () => {
    expect(newPhotoPath("user-1")).toMatch(/^user-1\/\d+-[0-9a-z]{8}\.jpg$/);
  });
});

describe("friendlyAddError", () => {
  it.each([
    [{ message: "x", status: 401 }, /session expired/i],
    [{ message: "x", status: 400 }, /cannot be used/i],
    [{ message: "x", status: 403 }, /could not be read/i],
    [{ message: "x", status: 404 }, /could not be read/i],
    [{ message: "The object exceeded the maximum allowed size" }, /too large/i],
    [{ message: 'new row violates row-level security policy for table "objects"' }, /your own closet/i],
  ])("explains %j in plain words", (error, expected) => {
    expect(friendlyAddError(error)).toMatch(expected);
  });

  it("passes other messages through", () => {
    expect(friendlyAddError({ message: "Something odd", status: 500 })).toBe("Something odd");
  });
});

describe("addPhoto", () => {
  it("uploads to the person's folder, asks the AI about that same file, and starts the review", async () => {
    const g = gateway({
      analyzePhoto: vi.fn(async () => ok(analysis({ needs_review: ["season"], warnings: ["Two items in one photo."] }))),
    });
    const result = await addPhoto(g, SMALL);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { path } = result.value;
    expect(path).toMatch(/^user-1\/\d+-[0-9a-z]{8}\.jpg$/);
    expect(g.uploadPhoto).toHaveBeenCalledWith(path, SMALL);
    expect(g.analyzePhoto).toHaveBeenCalledWith(path);
    expect(result.value.userId).toBe("user-1");
    expect(result.value.review.flagged).toEqual(["season"]);
    expect(result.value.notice).toBe("Two items in one photo.");
  });

  it("has nothing to say when the AI has no warnings", async () => {
    const result = await addPhoto(gateway(), SMALL);
    expect(result).toMatchObject({ ok: true, value: { notice: null } });
  });

  it("refuses an empty or oversized photo before uploading anything", async () => {
    const g = gateway();
    expect(await addPhoto(g, "")).toMatchObject({ ok: false, error: expect.stringContaining("Could not read") });
    const huge = "A".repeat(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8);
    expect(await addPhoto(g, huge)).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
    expect(g.currentUserId).not.toHaveBeenCalled();
    expect(g.uploadPhoto).not.toHaveBeenCalled();
  });

  it("explains an empty answer from the server instead of failing silently", async () => {
    const g = gateway({ currentUserId: vi.fn(async () => ({ data: null, error: null })) });
    expect(await addPhoto(g, SMALL)).toEqual({ ok: false, error: "The server returned no data. Please try again." });
    expect(g.uploadPhoto).not.toHaveBeenCalled();
  });

  it("stops if the user cannot be identified, or the upload fails", async () => {
    const noUser = gateway({ currentUserId: vi.fn(async () => err("not authenticated")) });
    expect(await addPhoto(noUser, SMALL)).toEqual({ ok: false, error: "not authenticated" });
    expect(noUser.uploadPhoto).not.toHaveBeenCalled();

    const badUpload = gateway({ uploadPhoto: vi.fn(async () => err("The object exceeded the maximum allowed size")) });
    expect(await addPhoto(badUpload, SMALL)).toMatchObject({ ok: false, error: expect.stringMatching(/too large/i) });
    expect(badUpload.analyzePhoto).not.toHaveBeenCalled();
  });

  it.each([
    ["the AI limit was reached", err("rate", 429), /reached its limit/i],
    ["the AI service is down", err("down", 502), /unavailable/i],
    ["the request never reached the AI", err("offline"), /could not reach the ai/i],
  ])("lets the person choose the tags themselves when %s, and keeps the photo", async (_why, failure, expected) => {
    const g = gateway({ analyzePhoto: vi.fn(async () => failure) });
    const result = await addPhoto(g, SMALL);
    expect(result).toMatchObject({ ok: true, value: { notice: expect.stringMatching(expected) } });
    if (result.ok) expect(result.value.review.flagged).toHaveLength(4);
    expect(g.removePhoto).not.toHaveBeenCalled();
  });

  it("lets the person choose the tags when the analysis throws or returns nothing", async () => {
    for (const analyzePhoto of [vi.fn(async () => { throw new Error("offline"); }), vi.fn(async () => ({ data: null, error: null }))]) {
      const g = gateway({ analyzePhoto });
      expect(await addPhoto(g, SMALL)).toMatchObject({ ok: true, value: { review: { flagged: expect.any(Array) } } });
      expect(g.removePhoto).not.toHaveBeenCalled();
    }
  });

  it.each([
    [400, /cannot be used/i],
    [403, /could not be read/i],
    [404, /could not be read/i],
    [401, /session expired/i],
  ])("deletes the photo and explains when the AI refuses it with status %i", async (status, expected) => {
    const g = gateway({ analyzePhoto: vi.fn(async () => err("refused", status)) });
    const result = await addPhoto(g, SMALL);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(expected) });
    expect(g.removePhoto).toHaveBeenCalledTimes(1);
  });

  it("reports a network failure while uploading", async () => {
    const g = gateway({ uploadPhoto: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await addPhoto(g, SMALL)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("discardPhoto", () => {
  it("removes the photo, and never complains if that fails", async () => {
    const g = gateway();
    await discardPhoto(g, "user-1/a.jpg");
    expect(g.removePhoto).toHaveBeenCalledWith("user-1/a.jpg");
    await expect(discardPhoto(gateway({ removePhoto: vi.fn(async () => { throw new Error("x"); }) }), "p")).resolves.toBeUndefined();
  });
});

describe("saveGarment", () => {
  const photo = { userId: "user-1", path: "user-1/a.jpg" };
  const settled = () => {
    let review = startReview({ tags: { type: "jeans", color: "blue", season: "all", warmth: 3 }, needs_review: ["color"] });
    review = confirmField(review, "color");
    return review;
  };

  it("stores the confirmed tags on the person's own garment", async () => {
    const g = gateway();
    expect(await saveGarment(g, photo, settled())).toEqual({ ok: true, value: true });
    expect(g.saveGarment).toHaveBeenCalledWith({
      owner_id: "user-1",
      image_path: "user-1/a.jpg",
      type: "jeans",
      color: "blue",
      season: "all",
      warmth: 3,
    });
  });

  it("uses what the person changed, not what the AI first suggested", async () => {
    const g = gateway();
    await saveGarment(g, photo, chooseValue(settled(), "color", "red"));
    expect(g.saveGarment).toHaveBeenCalledWith(expect.objectContaining({ color: "red" }));
  });

  it("will not save with an unchecked or missing tag, and says why", async () => {
    const g = gateway();
    const unchecked = startReview({ tags: { type: "jeans", color: "blue", season: "all", warmth: 3 }, needs_review: ["season"] });
    expect(await saveGarment(g, photo, unchecked)).toEqual({ ok: false, error: "Check season before saving." });
    const missing = startReview({ tags: { type: "jeans" }, needs_review: [] });
    expect(await saveGarment(g, photo, missing)).toEqual({ ok: false, error: "Choose color, season, warmth." });
    expect(g.saveGarment).not.toHaveBeenCalled();
  });

  it("shows a server error and reports network failures", async () => {
    const denied = gateway({ saveGarment: vi.fn(async () => err("new row violates row-level security policy")) });
    expect(await saveGarment(denied, photo, settled())).toMatchObject({ ok: false, error: expect.stringMatching(/your own closet/i) });
    const down = gateway({ saveGarment: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await saveGarment(down, photo, settled())).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});
