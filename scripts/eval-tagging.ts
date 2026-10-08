// Scores tagging results against hand labels.
// Usage: node scripts/eval-tagging.ts <results.json> [eval/tagging-labels.json]
// results.json comes from: OUT=results.json node scripts/tag-image.ts <photos...>
import { readFileSync } from "node:fs";

interface Label { note: string; type: string[]; color: string[]; season: string[]; warmth: [number, number] }
interface Result { file: string; error?: string; tags?: Record<string, unknown>; needs_review?: string[]; warnings?: string[] }

const resultsPath = process.argv[2];
if (!resultsPath) throw new Error("usage: node scripts/eval-tagging.ts <results.json> [labels.json]");
const labelsPath = process.argv[3] ?? new URL("../eval/tagging-labels.json", import.meta.url);
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
  const ok = {
    type: label.type.includes(String(t.type)),
    color: label.color.includes(String(t.color)),
    season: label.season.includes(String(t.season)),
    warmth: typeof t.warmth === "number" && t.warmth >= label.warmth[0] - 0 && t.warmth <= label.warmth[1],
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
console.log(`photos: ${results.length}  scored: ${scored}  no result: ${failures}`);
for (const f of fields) console.log(`  ${f.padEnd(7)} ${correct[f]}/${scored}  ${pct(correct[f]!, scored)}`);
console.log(`  all four correct: ${allCorrect}/${scored}  ${pct(allCorrect, scored)}`);
console.log(`  review flags raised: ${flagged}; wrong fields that were flagged for review: ${flaggedWrong}/${wrongTotal}`);
if (misses.length) console.log(`\nmisses:\n  ${misses.join("\n  ")}`);
