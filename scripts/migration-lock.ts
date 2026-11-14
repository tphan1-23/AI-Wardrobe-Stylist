// Pure helpers for the migration lock (supabase/migrations/checksums.json).
//
// Why: the database is one production project and migrations are applied by hand, so a migration that
// was already applied must never change silently. The lock records a checksum of every migration. A test
// fails when a file differs from its recorded checksum, when a file has no entry, or when an entry has
// no file. Adding a migration means running `npm run migrations:lock`, which shows up in the PR diff;
// changing an applied one needs an explicit `--accept-edit <file>` and a reason in review.
import { createHash } from "node:crypto";

export const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

export type Lock = Record<string, string>;

// Line endings differ between Windows checkouts (CRLF) and the Linux CI runner (LF), so hash the LF form.
export function hashSql(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export interface LockProblem {
  file: string;
  problem: "edited" | "not_locked" | "missing_file" | "bad_name" | "number_gap";
  detail: string;
}

// `files` maps each migration file name to its text.
export function verifyLock(files: Record<string, string>, lock: Lock): LockProblem[] {
  const problems: LockProblem[] = [];
  const names = Object.keys(files).sort();

  for (const file of names) {
    if (!MIGRATION_NAME.test(file)) {
      problems.push({ file, problem: "bad_name", detail: "migration files are named NNNN_snake_case.sql" });
      continue;
    }
    if (!(file in lock)) {
      problems.push({ file, problem: "not_locked", detail: "new migration: run `npm run migrations:lock` and commit checksums.json" });
    } else if (lock[file] !== hashSql(files[file]!)) {
      problems.push({
        file,
        problem: "edited",
        detail: "an applied migration was changed; write a new migration instead (or, if the edit is deliberate, `npm run migrations:lock -- --accept-edit " + file + "` and explain it in the PR)",
      });
    }
  }
  for (const file of Object.keys(lock).sort()) {
    if (!(file in files)) problems.push({ file, problem: "missing_file", detail: "a locked migration was deleted or renamed" });
  }

  // Numbers must run 0001, 0002, ... with no gaps and no duplicates, so the order is unambiguous.
  const numbers = names.map((n) => MIGRATION_NAME.exec(n)?.[1]).filter((n): n is string => n !== undefined).map(Number);
  numbers.forEach((n, i) => {
    if (n !== i + 1) problems.push({ file: names[i]!, problem: "number_gap", detail: `expected number ${String(i + 1).padStart(4, "0")}` });
  });
  return problems;
}

export interface BuildResult {
  lock: Lock;
  added: string[];
  refused: string[];
}

// New files are added. A file whose checksum changed is refused unless it is in `accepted`.
export function buildLock(files: Record<string, string>, existing: Lock, accepted: string[] = []): BuildResult {
  const lock: Lock = {};
  const added: string[] = [];
  const refused: string[] = [];
  for (const file of Object.keys(files).sort()) {
    const hash = hashSql(files[file]!);
    if (!(file in existing)) {
      lock[file] = hash;
      added.push(file);
    } else if (existing[file] === hash || accepted.includes(file)) {
      lock[file] = hash;
    } else {
      lock[file] = existing[file]!;
      refused.push(file);
    }
  }
  return { lock, added, refused };
}
