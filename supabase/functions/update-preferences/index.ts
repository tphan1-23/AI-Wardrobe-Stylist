// POST { suggestion_id, feedback: "up" | "down" } -> updates the caller's preference weights (once per suggestion).
import { serveAuthed } from "../_deno/serve.ts";
import { handleUpdatePreferences } from "../_shared/handlers.ts";
import { toReply } from "../_shared/http.ts";
import { updatePreferencesDeps } from "../_shared/supabase-deps.ts";
import type { UpdatePreferencesRequest } from "../_shared/types.ts";

serveAuthed(async (userId, body, db) =>
  toReply(await handleUpdatePreferences(userId, body as UpdatePreferencesRequest, updatePreferencesDeps(db))),
);
