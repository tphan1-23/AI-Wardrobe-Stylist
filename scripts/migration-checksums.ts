// Writes supabase/migrations/checksums.json (see migration-lock.ts for why).
//
//   npm run migrations:lock                           add new migrations, keep applied ones as they are
//   npm run migrations:lock -- --accept-edit 0004_x.sql   deliberately accept a changed migration
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { buildLock, type Lock } from "./migration-lock.ts";

const dir = new URL("../supabase/migrations/", import.meta.url);
const lockUrl = new URL("checksums.json", dir);

const files: Record<string, string> = {};
for (const name of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
  files[name] = readFileSync(new URL(name, dir), "utf8");
}

let existing: Lock = {};
try {
  existing = JSON.parse(readFileSync(lockUrl, "utf8")) as Lock;
} catch {
  // first run: no lock yet
}

const args = process.argv.slice(2);
const accepted = args.flatMap((a, i) => (a === "--accept-edit" && args[i + 1] ? [args[i + 1]!] : []));

const { lock, added, refused } = buildLock(files, existing, accepted);
writeFileSync(lockUrl, JSON.stringify(lock, null, 2) + "\n");

for (const file of added) console.log(`locked new migration: ${file}`);
for (const file of accepted) if (file in existing && existing[file] !== lock[file]) console.log(`accepted edit: ${file}`);
if (refused.length > 0) {
  console.error(`refused (already applied, content changed): ${refused.join(", ")}`);
  console.error("write a new migration instead, or rerun with --accept-edit <file> if the edit is deliberate");
  process.exit(1);
}
console.log(`${Object.keys(lock).length} migrations locked`);
