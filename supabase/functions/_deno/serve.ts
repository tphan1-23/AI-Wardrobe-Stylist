// Shared Deno wrapper for the edge functions: CORS, POST only, verifies the signed-in user, parses JSON,
// and turns unexpected errors into a plain 500. The business logic lives in ../_shared (unit-tested in Node).
// This file uses Deno and an npm: import, so it is checked with `deno check`, not the root tsc.
import { createClient } from "npm:@supabase/supabase-js@2";
import { CORS_HEADERS, bearerToken, type HttpReply } from "../_shared/http.ts";
import type { Db } from "../_shared/supabase-deps.ts";

export function serveAuthed(handle: (userId: string, body: unknown, db: Db) => Promise<HttpReply>) {
  Deno.serve(async (req) => {
    const reply = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "content-type": "application/json" } });

    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
    if (req.method !== "POST") return reply(405, { error: "use POST" });

    const token = bearerToken(req.headers.get("Authorization"));
    if (!token) return reply(401, { error: "missing bearer token" });

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !anonKey) {
      console.error("SUPABASE_URL or SUPABASE_ANON_KEY is not set");
      return reply(500, { error: "server misconfigured" });
    }

    // Queries run as the caller, so row-level security applies to everything below.
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return reply(401, { error: "invalid or expired session" });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return reply(400, { error: "body must be JSON" });
    }

    try {
      const result = await handle(data.user.id, body, client as unknown as Db);
      return reply(result.status, result.body);
    } catch (e) {
      // Log the message only: errors can carry URLs or keys from upstream services.
      console.error("function failed:", e instanceof Error ? e.message : "unknown error");
      return reply(500, { error: "internal error" });
    }
  });
}
