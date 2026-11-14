import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_NAME_LENGTH, validateName } from "../frontend/src/services/auth.ts";
import { MAX_HOUSEHOLD_NAME_LENGTH, MAX_LOCATION_LENGTH } from "../frontend/src/services/household.ts";

const MIGRATION = readFileSync(new URL("../supabase/migrations/0009_length_limits.sql", import.meta.url), "utf8");

// The part of the file that is SQL, not comments.
const SQL = MIGRATION.replace(/--.*$/gm, "");

describe("name length in the app", () => {
  it("accepts a name up to the limit and refuses a longer one", () => {
    expect(validateName("n".repeat(MAX_NAME_LENGTH))).toBeNull();
    expect(validateName("n".repeat(MAX_NAME_LENGTH + 1))).toMatch(/at most 100/);
    expect(validateName("  " + "n".repeat(MAX_NAME_LENGTH) + "  ")).toBeNull();
    expect(validateName("   ")).toBe("Enter your name.");
  });
});

describe("migration 0009 (length limits) matches the app", () => {
  const limitOf = (constraint: string): string => {
    const match = new RegExp(`constraint ${constraint} check \\(([^\\n]*?)\\)(?:,|;)`).exec(SQL);
    expect(match, `constraint ${constraint}`).not.toBeNull();
    return match![1]!;
  };

  it("uses the same numbers as the checks in the app", () => {
    expect(limitOf("households_name_length")).toContain(`between 1 and ${MAX_HOUSEHOLD_NAME_LENGTH}`);
    expect(limitOf("users_location_length")).toContain(`<= ${MAX_LOCATION_LENGTH}`);
    expect(limitOf("users_name_length")).toContain(`<= ${MAX_NAME_LENGTH}`);
  });

  it("cuts long names on the way in to the same length", () => {
    expect(SQL).toContain(`left(new.name, ${MAX_NAME_LENGTH})`);
    expect(SQL).toMatch(/create trigger users_limit_name before insert or update of name on users/);
  });

  it("keeps preference weights inside the range the learning code clamps to (-1 to 1)", () => {
    expect(limitOf("preference_vector_weight_range")).toContain("weight between -1 and 1");
  });

  it("limits every free-text and size column the reviewer pointed at", () => {
    for (const name of [
      "households_name_length",
      "households_invite_code_format",
      "users_name_length",
      "users_location_length",
      "users_quiz_preferences_size",
      "garments_image_path_length",
      "preference_vector_tag_length",
      "preference_vector_weight_range",
      "suggestions_garment_ids_size",
    ]) {
      expect(SQL, name).toContain(`add constraint ${name} check`);
    }
  });

  it("revokes the trigger function from signed-out callers like migration 0008", () => {
    expect(SQL).toMatch(/revoke all on function limit_user_name\(\) from public, anon;/);
  });

  it("does not delete or rewrite anything", () => {
    // Statements only: "update of name" in the trigger definition is not a rewrite.
    expect(SQL).not.toMatch(/\b(delete\s+from|truncate|drop\s+(table|column|constraint))\b|\bupdate\s+\w+\s+set\b/i);
  });
});
