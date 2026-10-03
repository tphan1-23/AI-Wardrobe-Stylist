// Live check of garment tagging: node scripts/tag-image.ts <photo> [<photo> ...]
// Reads GEMINI_API_KEY from .env (git-ignored). Photos stay local; never commit them.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { analyzeImage } from "../supabase/functions/_shared/gemini.ts";

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic" };

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing in .env");

const files = process.argv.slice(2);
if (files.length === 0) throw new Error("usage: node scripts/tag-image.ts <photo> [<photo> ...]");

for (const file of files) {
  const mimeType = MIME[extname(file).toLowerCase()];
  if (!mimeType) {
    console.log(`${file}: unsupported extension`);
    continue;
  }
  try {
    const result = await analyzeImage(
      { fetch, apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL },
      { base64: readFileSync(file).toString("base64"), mimeType },
    );
    console.log(`${file}\n  ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`${file}: ${(error as Error).message}`);
  }
}
