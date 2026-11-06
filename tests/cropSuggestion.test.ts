import { describe, expect, it, vi } from "vitest";
import { type AddGateway, type ReviewState } from "../frontend/src/services/add.ts";
import { fitImage, regionToFrame, toImageRegion } from "../frontend/src/services/crop.ts";
import { replaceWithCrop } from "../frontend/src/services/cropSuggestion.ts";

const USER = "user-1";
const review = (extra: Partial<ReviewState> = {}): ReviewState => ({
  photoPath: `${USER}/original.jpg`,
  tags: { type: "t_shirt", color: "blue", season: "all", warmth: 2 },
  needsReview: [],
  confirmed: [],
  manual: false,
  warnings: [],
  box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
  ...extra,
});
const photo = (bytes = 10, extension = "jpg") => ({ data: new ArrayBuffer(bytes), extension });

function gateway(over: Partial<AddGateway> = {}) {
  const calls: string[] = [];
  const g: AddGateway = {
    uploadPhoto: vi.fn(async (path: string) => (calls.push(`upload ${path}`), { data: {}, error: null })),
    removePhoto: vi.fn(async (path: string) => (calls.push(`remove ${path}`), { data: {}, error: null })),
    analyze: vi.fn(),
    insertGarment: vi.fn(),
    ...over,
  };
  return { g, calls };
}

describe("replaceWithCrop", () => {
  it("uploads the cropped photo first, then removes the original, and keeps the tags", async () => {
    const { g, calls } = gateway();
    const result = await replaceWithCrop(g, USER, review({ confirmed: ["type"] }), photo(), () => "new");
    expect(calls).toEqual([`upload ${USER}/new.jpg`, `remove ${USER}/original.jpg`]);
    expect(result).toEqual({
      ok: true,
      value: {
        photoPath: `${USER}/new.jpg`,
        tags: { type: "t_shirt", color: "blue", season: "all", warmth: 2 },
        needsReview: [],
        confirmed: ["type"],
        manual: false,
        warnings: [],
      },
    });
  });

  it("does not offer the suggestion again once it has been used", async () => {
    const result = await replaceWithCrop(gateway().g, USER, review(), photo(), () => "new");
    expect(result.ok && "box" in result.value).toBe(false);
  });

  it("keeps the original untouched when the upload fails", async () => {
    const { g } = gateway({ uploadPhoto: vi.fn(async () => ({ data: null, error: { message: "denied" } })) });
    const result = await replaceWithCrop(g, USER, review(), photo(), () => "new");
    expect(result).toEqual({ ok: false, error: "denied" });
    expect(g.removePhoto).not.toHaveBeenCalled();
  });

  it("keeps the original untouched when the network is down", async () => {
    const { g } = gateway({
      uploadPhoto: vi.fn(async () => {
        throw new Error("offline");
      }),
    });
    expect(await replaceWithCrop(g, USER, review(), photo(), () => "new")).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
    });
    expect(g.removePhoto).not.toHaveBeenCalled();
  });

  it("still uses the new photo when the old one cannot be removed", async () => {
    for (const removePhoto of [
      vi.fn(async () => ({ data: null, error: { message: "nope" } })),
      vi.fn(async () => {
        throw new Error("offline");
      }),
    ]) {
      const result = await replaceWithCrop(gateway({ removePhoto }).g, USER, review(), photo(), () => "new");
      expect(result).toMatchObject({ ok: true, value: { photoPath: `${USER}/new.jpg` } });
    }
  });

  it("refuses an empty or unsupported file before uploading anything", async () => {
    const { g } = gateway();
    expect(await replaceWithCrop(g, USER, review(), photo(0), () => "new")).toMatchObject({ ok: false });
    expect(await replaceWithCrop(g, USER, review(), photo(5, "gif"), () => "new")).toMatchObject({ ok: false });
    expect(g.uploadPhoto).not.toHaveBeenCalled();
  });
});

describe("regionToFrame", () => {
  const image = { width: 3000, height: 4000 };
  const shown = fitImage(image, { width: 300, height: 400 });

  it("puts a region of the picture where it appears on screen", () => {
    expect(regionToFrame({ originX: 500, originY: 1000, width: 1000, height: 1200 }, shown, image)).toEqual({
      x: 50,
      y: 100,
      width: 100,
      height: 120,
    });
  });

  it("accounts for the bars around a photo that does not fill the box", () => {
    const wide = { width: 4000, height: 2000 };
    const bars = fitImage(wide, { width: 300, height: 400 });
    expect(regionToFrame({ originX: 1000, originY: 0, width: 2000, height: 2000 }, bars, wide)).toEqual({
      x: 75,
      y: 125,
      width: 150,
      height: 150,
    });
  });

  it("is the opposite of toImageRegion", () => {
    const frame = { x: 50, y: 100, width: 100, height: 120 };
    expect(regionToFrame(toImageRegion(frame, shown, image), shown, image)).toEqual(frame);
  });

  it("never leaves the photo, and falls back to the whole photo when nothing is known", () => {
    expect(regionToFrame({ originX: 2500, originY: 3500, width: 2000, height: 2000 }, shown, image)).toEqual({
      x: 250,
      y: 350,
      width: 50,
      height: 50,
    });
    expect(regionToFrame({ originX: 0, originY: 0, width: 10, height: 10 }, shown, { width: 0, height: 0 })).toEqual(shown);
  });
});
