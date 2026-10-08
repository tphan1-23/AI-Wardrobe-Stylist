// POST { date, exclude_suggestion_ids? } -> today's outfit from the caller's own closet.
// Secret: OPENWEATHER_API_KEY (supabase secrets set OPENWEATHER_API_KEY=...).
import { serveAuthed } from "../_deno/serve.ts";
import { handleGenerateOutfit } from "../_shared/handlers.ts";
import { toReply } from "../_shared/http.ts";
import { generateOutfitDeps } from "../_shared/supabase-deps.ts";
import type { GenerateOutfitRequest } from "../_shared/types.ts";
import { fetchWeather } from "../_shared/weather.ts";

serveAuthed(async (userId, body, db) => {
  const weatherKey = Deno.env.get("OPENWEATHER_API_KEY");
  if (!weatherKey) throw new Error("OPENWEATHER_API_KEY is not set");
  const deps = generateOutfitDeps(db, (location) => fetchWeather(fetch, weatherKey, location));
  return toReply(await handleGenerateOutfit(userId, body as GenerateOutfitRequest, deps));
});
