import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COLORS, GARMENT_TYPES, SEASONS } from "../supabase/functions/_shared/tag-schema.ts";

const sql = readFileSync(new URL("../supabase/migrations/0001_init.sql", import.meta.url), "utf8");

function checkList(column: string): string[] {
  const match = new RegExp(`${column} text not null check \\(${column} in \\(([^)]*)\\)`).exec(sql);
  expect(match, `check constraint for ${column}`).not.toBeNull();
  return [...match![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
}

describe("migration 0001_init stays in sync with the tag schema", () => {
  it.each([
    ["type", GARMENT_TYPES],
    ["color", COLORS],
    ["season", SEASONS],
  ] as const)("%s check constraint matches tag-schema.ts", (column, expected) => {
    expect(checkList(column).sort()).toEqual([...expected].sort());
  });

  it("enables RLS on every table", () => {
    for (const table of ["households", "users", "garments", "preference_vector", "suggestions"]) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
  });

  it("keeps the photo bucket private", () => {
    expect(sql).toMatch(/values \('garments', 'garments', false\)/);
  });
});
