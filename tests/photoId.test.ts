import { describe, expect, it } from "vitest";
import { newPhotoId } from "../frontend/src/services/photoId.ts";

describe("newPhotoId", () => {
  it("is the time and eight random characters, safe to use in a file name", () => {
    expect(newPhotoId(0, () => 0)).toBe("0-00000000");
    expect(newPhotoId(1760000000000, () => 0.5)).toMatch(/^[0-9a-z]+-[0-9a-z]{8}$/);
  });

  it("differs when the time or the random value differs", () => {
    expect(newPhotoId(1, () => 0.1)).not.toBe(newPhotoId(1, () => 0.2));
    expect(newPhotoId(1, () => 0.1)).not.toBe(newPhotoId(2, () => 0.1));
  });

  it("works with the real clock and randomness", () => {
    expect(newPhotoId()).toMatch(/^[0-9a-z]+-[0-9a-z]{8}$/);
    expect(newPhotoId()).not.toContain("/");
  });
});
