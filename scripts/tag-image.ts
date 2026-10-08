// Live check of garment tagging: node scripts/tag-image.ts <photo> [<photo> ...]
// Reads GEMINI_API_KEY from .env (git-ignored). Photos stay local; never commit them.
// Optional env: GEMINI_MODEL, DELAY_MS (pause between photos, default 6500 for the free tier),
// OUT (write the results as JSON to this path).
import { readFileSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { GeminiError, analyzeImage } from "../supabase/functions/_shared/gemini.ts";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

const env = {
  ...Object.fromEntries(
    readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  ),
  ...process.env,
} as Record<string, string | undefined>;
if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in .env");

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("usage: node scripts/tag-image.ts <photo> [<photo> ...]");

const delayMs = Number(env.DELAY_MS ?? 6500);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tag(file: string, mimeType: string) {
  const image = { base64: readFileSync(file).toString("base64"), mimeType };
  const deps = { fetch, apiKey: env.GEMINI_API_KEY!, model: env.GEMINI_MODEL };
  try {
    return await analyzeImage(deps, image);
  } catch (error) {
    if (error instanceof GeminiError && error.retryable) {
      console.log(`  (${error.message}; retrying once in 30s)`);
      await sleep(30_000);
      return await analyzeImage(deps, image);
    }
    throw error;
  }
}

const results: Record<string, unknown>[] = [];
for (const [i, file] of files.entries()) {
  const name = basename(file);
  const mimeType = MIME[extname(file).toLowerCase()];
  if (!mimeType) {
    console.log(`${name}: unsupported extension`);
    results.push({ file: name, error: "unsupported extension" });
    continue;
  }
  const started = Date.now();
  try {
    const result = await tag(file, mimeType);
    const t = result.tags;
    console.log(
      `${String(i + 1).padStart(2)}. ${name}\n    ${t.type ?? "?"} | ${t.color ?? "?"} | ${t.season ?? "?"} | warmth ${t.warmth ?? "?"}` +
        `  review:[${result.needs_review.join(",")}]  ${((Date.now() - started) / 1000).toFixed(1)}s` +
        (result.warnings.length ? `  warnings: ${result.warnings.join("; ")}` : ""),
    );
    results.push({ file: name, ...result });
  } catch (error) {
    console.log(`${String(i + 1).padStart(2)}. ${name}: ${(error as Error).message}`);
    results.push({ file: name, error: (error as Error).message });
  }
  if (i < files.length - 1) await sleep(delayMs);
}

if (env.OUT) writeFileSync(env.OUT, JSON.stringify(results, null, 2));
