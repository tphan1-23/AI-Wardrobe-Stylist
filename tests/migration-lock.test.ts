import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATION_NAME, buildLock, hashSql, verifyLock } from "../scripts/migration-lock.ts";

const sqlA = "create table a (id int);\n";
const sqlB = "create table b (id int);\n";

describe("hashSql", () => {
  it("is stable and sensitive to content", () => {
    expect(hashSql(sqlA)).toBe(hashSql(sqlA));
    expect(hashSql(sqlA)).not.toBe(hashSql(sqlB));
    expect(hashSql(sqlA)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("ignores Windows line endings, so CI and a Windows checkout agree", () => {
    expect(hashSql("select 1;\r\nselect 2;\r\n")).toBe(hashSql("select 1;\nselect 2;\n"));
    expect(hashSql("select 1;\n")).not.toBe(hashSql("select 1;\n\n"));
  });
});

describe("verifyLock", () => {
  const files = { "0001_a.sql": sqlA, "0002_b.sql": sqlB };
  const lock = { "0001_a.sql": hashSql(sqlA), "0002_b.sql": hashSql(sqlB) };

  it("accepts files that match their lock", () => {
    expect(verifyLock(files, lock)).toEqual([]);
  });

  it("flags an applied migration that was edited", () => {
    const problems = verifyLock({ ...files, "0001_a.sql": sqlA + "drop table a;\n" }, lock);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ file: "0001_a.sql", problem: "edited" });
    expect(problems[0]!.detail).toContain("write a new migration");
  });

  it("flags a new migration that is not locked yet", () => {
    const problems = verifyLock({ ...files, "0003_c.sql": sqlA }, lock);
    expect(problems).toEqual([expect.objectContaining({ file: "0003_c.sql", problem: "not_locked" })]);
  });

  it("flags a locked migration whose file is gone", () => {
    const problems = verifyLock({ "0001_a.sql": sqlA }, lock);
    expect(problems).toEqual([expect.objectContaining({ file: "0002_b.sql", problem: "missing_file" })]);
  });

  it("flags badly named files and gaps in the numbering", () => {
    expect(verifyLock({ "init.sql": sqlA }, {})).toEqual([expect.objectContaining({ file: "init.sql", problem: "bad_name" })]);
    expect(verifyLock({ "0001_Bad.sql": sqlA }, {}).map((p) => p.problem)).toContain("bad_name");
    const gap = { "0001_a.sql": sqlA, "0003_c.sql": sqlB };
    const problems = verifyLock(gap, { "0001_a.sql": hashSql(sqlA), "0003_c.sql": hashSql(sqlB) });
    expect(problems).toEqual([expect.objectContaining({ file: "0003_c.sql", problem: "number_gap" })]);
    const dup = { "0001_a.sql": sqlA, "0001_b.sql": sqlB };
    expect(verifyLock(dup, { "0001_a.sql": hashSql(sqlA), "0001_b.sql": hashSql(sqlB) }).map((p) => p.problem)).toContain("number_gap");
  });
});

describe("buildLock", () => {
  const files = { "0001_a.sql": sqlA, "0002_b.sql": sqlB };

  it("starts a lock from scratch", () => {
    const { lock, added, refused } = buildLock(files, {});
    expect(Object.keys(lock)).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(added).toEqual(["0001_a.sql", "0002_b.sql"]);
    expect(refused).toEqual([]);
  });

  it("adds only new files and keeps the recorded checksum of applied ones", () => {
    const existing = { "0001_a.sql": hashSql(sqlA) };
    const { lock, added, refused } = buildLock(files, existing);
    expect(added).toEqual(["0002_b.sql"]);
    expect(refused).toEqual([]);
    expect(lock["0001_a.sql"]).toBe(hashSql(sqlA));
  });

  it("refuses a changed applied migration and keeps its old checksum", () => {
    const existing = { "0001_a.sql": hashSql(sqlA), "0002_b.sql": hashSql(sqlB) };
    const { lock, refused } = buildLock({ ...files, "0002_b.sql": sqlB + "-- sneaky\n" }, existing);
    expect(refused).toEqual(["0002_b.sql"]);
    expect(lock["0002_b.sql"]).toBe(hashSql(sqlB));
  });

  it("accepts a change only when that exact file is named", () => {
    const existing = { "0001_a.sql": hashSql(sqlA), "0002_b.sql": hashSql(sqlB) };
    const edited = { "0001_a.sql": sqlA + "-- x\n", "0002_b.sql": sqlB + "-- y\n" };
    const { lock, refused } = buildLock(edited, existing, ["0001_a.sql"]);
    expect(lock["0001_a.sql"]).toBe(hashSql(edited["0001_a.sql"]));
    expect(refused).toEqual(["0002_b.sql"]);
    expect(lock["0002_b.sql"]).toBe(hashSql(sqlB));
  });

  it("drops entries for files that no longer exist", () => {
    const { lock } = buildLock({ "0001_a.sql": sqlA }, { "0001_a.sql": hashSql(sqlA), "0002_b.sql": hashSql(sqlB) });
    expect(Object.keys(lock)).toEqual(["0001_a.sql"]);
  });
});

describe("the real migrations in this repository", () => {
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files: Record<string, string> = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql"))) files[name] = readFileSync(new URL(name, dir), "utf8");
  const lock = JSON.parse(readFileSync(new URL("checksums.json", dir), "utf8")) as Record<string, string>;

  it("match supabase/migrations/checksums.json (run `npm run migrations:lock` after adding one)", () => {
    expect(verifyLock(files, lock)).toEqual([]);
  });

  it("are numbered without gaps and named consistently", () => {
    const names = Object.keys(files).sort();
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const name of names) expect(name).toMatch(MIGRATION_NAME);
  });
});
