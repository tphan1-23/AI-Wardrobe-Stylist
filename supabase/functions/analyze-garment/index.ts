// POST { image_path } -> proposed tags for a garment photo (the app shows them on the review screen).
// Secret: GEMINI_API_KEY (supabase secrets set GEMINI_API_KEY=...).
import { serveAuthed } from "../_deno/serve.ts";
import { handleAnalyzeGarment } from "../_shared/analyze-handler.ts";
import { analyzeImage } from "../_shared/gemini.ts";
import { toReply } from "../_shared/http.ts";
import { analyzeDeps } from "../_shared/supabase-deps.ts";
import type { AnalyzeGarmentRequest } from "../_shared/types.ts";

serveAuthed(async (userId, body, db) => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  const deps = analyzeDeps(db, (image) => analyzeImage({ fetch, apiKey }, image));
  return toReply(await handleAnalyzeGarment(userId, body as AnalyzeGarmentRequest, deps));
});
