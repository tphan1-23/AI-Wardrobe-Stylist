import { describe, expect, it } from "vitest";
import {
  COLORS,
  GARMENT_TYPES,
  SEASONS,
  TYPE_TO_SLOT,
  isColor,
  isGarmentType,
  isSeason,
  isWarmth,
  slotForType,
} from "../supabase/functions/_shared/tag-schema.ts";

describe("tag schema", () => {
  it("maps every garment type to a slot", () => {
    for (const type of GARMENT_TYPES) {
      expect(["top", "bottom", "shoes", "other"]).toContain(slotForType(type));
    }
  });

  it("covers the three MVP outfit slots", () => {
    const slots = new Set(Object.values(TYPE_TO_SLOT));
    expect(slots.has("top") && slots.has("bottom") && slots.has("shoes")).toBe(true);
  });

  it("accepts known values and rejects unknown ones", () => {
    expect(isGarmentType("jeans")).toBe(true);
    expect(isGarmentType("toString")).toBe(false);
    expect(isGarmentType(42)).toBe(false);
    expect(isColor(COLORS[0])).toBe(true);
    expect(isColor("chartreuse")).toBe(false);
    expect(isSeason(SEASONS[0])).toBe(true);
    expect(isSeason("monsoon")).toBe(false);
  });

  it("validates warmth as an integer from 1 to 5", () => {
    expect([1, 2, 3, 4, 5].every(isWarmth)).toBe(true);
    expect(isWarmth(0)).toBe(false);
    expect(isWarmth(6)).toBe(false);
    expect(isWarmth(2.5)).toBe(false);
    expect(isWarmth("3")).toBe(false);
  });
});
