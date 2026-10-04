import { describe, expect, it } from "vitest";
import { SAFE_AREA_GAP, screenTopPadding } from "../frontend/src/layout.ts";

describe("screenTopPadding", () => {
  it("keeps the design offset when the device has no top inset", () => {
    expect(screenTopPadding(56, 0)).toBe(56);
    expect(screenTopPadding(20, 0)).toBe(20);
  });

  it("clears a Dynamic Island iPhone (59 pt inset) on every screen, including the 20 pt tab screen", () => {
    for (const designTop of [20, 56, 72]) {
      expect(screenTopPadding(designTop, 59)).toBeGreaterThanOrEqual(59 + SAFE_AREA_GAP);
    }
  });

  it("clears a notch iPhone (47 pt) and never goes below the design offset", () => {
    expect(screenTopPadding(20, 47)).toBe(47 + SAFE_AREA_GAP);
    expect(screenTopPadding(72, 47)).toBe(72);
  });
});
