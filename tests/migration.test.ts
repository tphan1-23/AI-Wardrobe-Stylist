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

describe("migration 0003_social_login_names", () => {
  const names = readFileSync(new URL("../supabase/migrations/0003_social_login_names.sql", import.meta.url), "utf8");

  it("reads the Google full_name when no name is set", () => {
    expect(names).toMatch(/nullif\(new\.raw_user_meta_data ->> 'name', ''\),\s+nullif\(new\.raw_user_meta_data ->> 'full_name', ''\)/);
  });

  it("only fills an empty profile name, never overwrites one", () => {
    expect(names).toMatch(/where id = new\.id\s+and name = ''/);
  });

  it("runs every security-definer function with a fixed search_path", () => {
    const definers = names.match(/security definer[^\n]*/g) ?? [];
    expect(definers.length).toBe(2);
    for (const line of definers) expect(line).toContain("set search_path = public");
  });
});

describe("migration 0002_personal_closets (D18)", () => {
  const personal = readFileSync(new URL("../supabase/migrations/0002_personal_closets.sql", import.meta.url), "utf8");

  it("moves garments from household ownership to user ownership", () => {
    expect(personal).toContain("alter table garments drop column household_id");
    expect(personal).toContain("alter table garments rename column added_by to owner_id");
  });

  it("drops every household-scoped garment and photo policy from 0001 before replacing it", () => {
    const old = [...sql.matchAll(/create policy (garment\w+) on (garments|storage\.objects)/g)];
    expect(old.length).toBeGreaterThan(0);
    for (const [, name, table] of old) expect(personal).toContain(`drop policy ${name} on ${table}`);
    expect(personal).not.toMatch(/create policy[^;]*household_id = current_household_id\(\)/);
  });

  it("lets only the owner write garments and photos; members may only read", () => {
    for (const action of ["insert", "update", "delete"]) {
      expect(personal).toMatch(new RegExp(`create policy garments_owner_${action} on garments\\s+for ${action}[^;]*owner_id = auth\\.uid\\(\\)`));
    }
    expect(personal).toMatch(/create policy garments_visible_read on garments\s+for select using \(owner_id in \(select visible_closet_owner_ids\(\)\)\)/);
    for (const action of ["insert", "delete"]) {
      expect(personal).toMatch(new RegExp(`create policy garment_photos_${action} on storage\\.objects[^;]*foldername\\(name\\)\\)\\[1\\] = auth\\.uid\\(\\)::text`));
    }
  });

  it("adds leave_household, which deletes the household once it is empty", () => {
    expect(personal).toMatch(/create function leave_household\(\) returns void/);
    expect(personal).toMatch(/update users set household_id = null where id = auth\.uid\(\)/);
    expect(personal).toMatch(/delete from households h\s+where h\.id = hid and not exists/);
  });

  it("refuses to create or join while already in a household", () => {
    for (const fn of ["create_household", "join_household"]) {
      const body = new RegExp(`create or replace function ${fn}[\\s\\S]*?end \\$\\$;`).exec(personal)?.[0] ?? "";
      expect(body, fn).toContain("raise exception 'already in a household'");
    }
  });

  it("runs every security-definer function with a fixed search_path", () => {
    const definers = personal.match(/security definer[^\n]*/g) ?? [];
    expect(definers.length).toBeGreaterThan(0);
    for (const line of definers) expect(line).toContain("set search_path = public");
  });
});
