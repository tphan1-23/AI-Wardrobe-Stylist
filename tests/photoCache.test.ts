import { describe, expect, it } from "vitest";
import { MAX_PHOTO_WIDTH, photoCacheKey, resizeWidth } from "../frontend/src/services/photoCache.ts";

describe("photoCacheKey", () => {
  it("is the same for two signed links to the same photo", () => {
    const a = "https://x.supabase.co/storage/v1/object/sign/garments/u1/p1.jpg?token=aaa";
    const b = "https://x.supabase.co/storage/v1/object/sign/garments/u1/p1.jpg?token=bbb";
    expect(photoCacheKey(a)).toBe(photoCacheKey(b));
    expect(photoCacheKey(a)).toBe("https://x.supabase.co/storage/v1/object/sign/garments/u1/p1.jpg");
  });

  it("differs for different photos, and leaves a link without a query alone", () => {
    expect(photoCacheKey("https://h/a.jpg?t=1")).not.toBe(photoCacheKey("https://h/b.jpg?t=1"));
    expect(photoCacheKey("https://h/a.jpg")).toBe("https://h/a.jpg");
  });
});

describe("resizeWidth", () => {
  it("shrinks big photos to the maximum width", () => {
    expect(resizeWidth(4032)).toBe(MAX_PHOTO_WIDTH);
    expect(resizeWidth(MAX_PHOTO_WIDTH + 1)).toBe(MAX_PHOTO_WIDTH);
  });

  it("leaves small photos alone, never scaling up", () => {
    expect(resizeWidth(MAX_PHOTO_WIDTH)).toBeNull();
    expect(resizeWidth(640)).toBeNull();
    expect(resizeWidth(0)).toBeNull();
  });
});
