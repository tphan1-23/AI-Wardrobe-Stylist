// Scores tagging results against hand labels.
// Usage: node scripts/eval-tagging.ts <results.json> [eval/tagging-labels.json] [--strict]
// --strict accepts only the FIRST listed answer per field (my first choice) and, for warmth, a value
// within 0.5 of the midpoint of the accepted range. Without it, every listed answer counts (lenient).
// results.json comes from: OUT=results.json node scripts/tag-image.ts <photos...>
import { readFileSync } from "node:fs";

interface Label { note: string; type: string[]; color: string[]; season: string[]; warmth: [number, number] }
interface Result { file: string; error?: string; tags?: Record<string, unknown>; needs_review?: string[]; warnings?: string[] }

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const positional = args.filter((a) => !a.startsWith("--"));
const resultsPath = positional[0];
if (!resultsPath) throw new Error("usage: node scripts/eval-tagging.ts <results.json> [labels.json]");
const labelsPath = positional[1] ?? new URL("../eval/tagging-labels.json", import.meta.url);
const labels = (JSON.parse(readFileSync(labelsPath, "utf8")) as { items: Record<string, Label> }).items;
const results = JSON.parse(readFileSync(resultsPath, "utf8")) as Result[];

const fields = ["type", "color", "season", "warmth"] as const;
const correct: Record<string, number> = { type: 0, color: 0, season: 0, warmth: 0 };
let scored = 0;
let allCorrect = 0;
let failures = 0;
let flagged = 0;
let flaggedWrong = 0;
let wrongTotal = 0;
const misses: string[] = [];

for (const r of results) {
  const label = labels[r.file];
  if (!label) { console.log(`(no label for ${r.file})`); continue; }
  if (r.error || !r.tags) { failures++; misses.push(`${r.file}: NO RESULT (${r.error})`); continue; }
  scored++;
  const t = r.tags;
  const accepted = (list: string[]) => (strict ? list.slice(0, 1) : list);
  const midpoint = (label.warmth[0] + label.warmth[1]) / 2;
  const ok = {
    type: accepted(label.type).includes(String(t.type)),
    color: accepted(label.color).includes(String(t.color)),
    season: accepted(label.season).includes(String(t.season)),
    warmth:
      typeof t.warmth === "number" &&
      (strict ? Math.abs(t.warmth - midpoint) <= 0.5 : t.warmth >= label.warmth[0] && t.warmth <= label.warmth[1]),
  };
  for (const f of fields) if (ok[f]) correct[f]!++;
  const wrong = fields.filter((f) => !ok[f]);
  if (wrong.length === 0) allCorrect++;
  const review = new Set(r.needs_review ?? []);
  for (const f of wrong) { wrongTotal++; if (review.has(f)) flaggedWrong++; }
  flagged += review.size;
  if (wrong.length > 0) {
    misses.push(`${r.file.replace(/Screenshot 2026-10-08 /, "#")} [${label.note}]\n      got ${t.type}/${t.color}/${t.season}/w${t.warmth}; wrong: ${wrong.join(", ")}`);
  }
}

const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${((n / d) * 100).toFixed(0)}%`);
console.log(`labels: ${strict ? "STRICT (first choice only)" : "lenient (any listed answer)"}`);
console.log(`photos: ${results.length}  scored: ${scored}  no result: ${failures}`);
for (const f of fields) console.log(`  ${f.padEnd(7)} ${correct[f]}/${scored}  ${pct(correct[f]!, scored)}`);
console.log(`  all four correct: ${allCorrect}/${scored}  ${pct(allCorrect, scored)}`);
console.log(`  review flags raised: ${flagged}; wrong fields that were flagged for review: ${flaggedWrong}/${wrongTotal}`);
if (misses.length) console.log(`\nmisses:\n  ${misses.join("\n  ")}`);
