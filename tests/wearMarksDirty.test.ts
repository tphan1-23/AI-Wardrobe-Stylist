import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wornMessage } from "../frontend/src/services/today.ts";
import { LAUNDRY_EXEMPT_TYPES } from "../supabase/functions/_shared/outfit.ts";
import { GARMENT_TYPES, slotForType } from "../supabase/functions/_shared/tag-schema.ts";

const MIGRATION = readFileSync(new URL("../supabase/migrations/0007_wear_marks_dirty.sql", import.meta.url), "utf8");
const LATEST = readFileSync(new URL("../supabase/migrations/0010_outerwear_not_dirty.sql", import.meta.url), "utf8");

describe("laundry after wearing an outfit", () => {
  it("sends the top and bottom to the laundry but never the shoes, when there is no outfit to read", () => {
    expect(wornMessage()).toContain("top and bottom");
  });

  it("tells the person what happened", () => {
    const message = wornMessage();
    expect(message).toContain("top and bottom");
    expect(message.toLowerCase()).not.toContain("shoes");
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

describe("migration 0010 (accept_suggestion, outerwear stays clean)", () => {
  const code = LATEST.replace(/--.*$/gm, "");
  const listed = /type in \(([^)]*)\) then status else 'dirty'/.exec(code);
  const sqlExempt = (listed?.[1] ?? "").split(",").map((t) => t.trim().replace(/'/g, "")).filter(Boolean);

  it("spares exactly the types the app says do not go to the laundry: shoes, jackets and coats", () => {
    expect(sqlExempt.length).toBeGreaterThan(0);
    expect([...sqlExempt].sort()).toEqual([...LAUNDRY_EXEMPT_TYPES].sort());
    expect(sqlExempt).toContain("jacket");
    expect(sqlExempt).toContain("coat");
    for (const type of GARMENT_TYPES.filter((t) => slotForType(t) === "shoes")) expect(sqlExempt).toContain(type);
  });

  it("does not spare dresses, tops, bottoms, hoodies or sweaters", () => {
    for (const type of ["dress", "t_shirt", "hoodie", "sweater", "jeans", "skirt"]) expect(sqlExempt).not.toContain(type);
  });

  it("keeps everything else about accept_suggestion: own suggestion, own garments, worn today, signed-in only", () => {
    expect(code).toContain("user_id = auth.uid()");
    expect(code).toContain("owner_id = auth.uid()");
    expect(code).toContain("last_worn_date = current_date");
    expect(code).toContain("security definer set search_path = public");
    expect(code).toMatch(/revoke all on function accept_suggestion\(uuid\) from public, anon;/);
    expect(code).toMatch(/grant execute on function accept_suggestion\(uuid\) to authenticated, service_role;/);
  });

  it("only replaces that one function: no tables, policies or data", () => {
    expect(code).not.toMatch(/\b(drop|delete|truncate|create table|alter table|create policy|insert)\b/i);
    expect(code.match(/create or replace function/g)).toHaveLength(1);
  });
});
