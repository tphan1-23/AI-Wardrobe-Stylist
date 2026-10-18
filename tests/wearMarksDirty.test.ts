import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { laundrySlots, wornMessage } from "../frontend/src/services/today.ts";
import { GARMENT_TYPES, slotForType } from "../supabase/functions/_shared/tag-schema.ts";

const MIGRATION = readFileSync(new URL("../supabase/migrations/0007_wear_marks_dirty.sql", import.meta.url), "utf8");

describe("laundry after wearing an outfit", () => {
  it("sends the top and bottom to the laundry but never the shoes", () => {
    expect(laundrySlots()).toEqual(["top", "bottom"]);
  });

  it("tells the person what happened", () => {
    const message = wornMessage();
    expect(message).toContain("top and bottom");
    expect(message).toContain("Shoes stay clean");
  });
});

describe("migration 0007 (accept_suggestion)", () => {
  // The shoe list is written out in SQL, so it must match the shoes slot in tag-schema.ts.
  const listed = /type in \(([^)]*)\) then status else 'dirty'/.exec(MIGRATION);
  const sqlShoes = (listed?.[1] ?? "").split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);

  it("spares exactly the garment types of the shoes slot", () => {
    const shoes = GARMENT_TYPES.filter((type) => slotForType(type) === "shoes");
    expect(shoes.length).toBeGreaterThan(0);
    expect([...sqlShoes].sort()).toEqual([...shoes].sort());
  });

  it("only touches the caller's own garments and still requires the caller's own suggestion", () => {
    expect(MIGRATION).toContain("owner_id = auth.uid()");
    expect(MIGRATION).toContain("user_id = auth.uid()");
  });

  it("still marks the garments as worn today", () => {
    expect(MIGRATION).toContain("last_worn_date = current_date");
  });
});
