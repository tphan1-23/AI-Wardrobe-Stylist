// Headless end-to-end check against the REAL Supabase project, acting as the screens that do not exist yet.
//
//   node scripts/e2e.ts <photos folder>
//
// Needs (all git-ignored, never printed):
//   .env                    TEST_EMAIL, TEST_PASSWORD   an existing THROWAWAY account (create it in the app)
//   frontend/.env.local     EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
// Optional: E2E_PICK=5,10,9,11,15,18,21 (1-based photo numbers in sorted order), E2E_KEEP=1 (do not clean up).
// Safe on a real account: cleanup removes only the garments, photos and suggestions this run created, and puts the
// preference weights back exactly as they were. It only sets the location if the account has none.
// The three edge functions must be deployed. It spends a few Gemini calls (one per photo).
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { extname, join } from "node:path";

function readEnv(file: string): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
        .split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const env = { ...readEnv(".env"), ...readEnv("frontend/.env.local"), ...process.env } as Record<string, string | undefined>;
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_ || !ANON) throw new Error("EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY missing (frontend/.env.local)");
if (!env.TEST_EMAIL || !env.TEST_PASSWORD) throw new Error("TEST_EMAIL / TEST_PASSWORD missing in .env (the login of the account to test with)");
const photosDir = process.argv[2];
if (!photosDir) throw new Error("usage: node scripts/e2e.ts <photos folder>");
const dir: string = photosDir;

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
let passed = 0;
let failed = 0;
const check = (ok: boolean, label: string, detail = "") => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  (${detail})` : ""}`);
  return ok;
};

type Reply = { status: number; body: any };
async function call(path: string, init: { method?: string; token?: string; json?: unknown; raw?: Buffer; mime?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
  const headers: Record<string, string> = { apikey: ANON!, ...init.headers };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.json !== undefined) headers["content-type"] = "application/json";
  if (init.mime) headers["content-type"] = init.mime;
  const res = await fetch(`${URL_}${path}`, {
    method: init.method ?? (init.json !== undefined || init.raw ? "POST" : "GET"),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.raw ? new Uint8Array(init.raw) : undefined,
  });
  const text = await res.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body };
}

let made: { id: string; path: string; type: string }[] = [];
const state: { cleanup: (() => Promise<void>) | null } = { cleanup: null };

async function main() {
  console.log("1. Sign in");
  const auth = await call("/auth/v1/token?grant_type=password", { json: { email: env.TEST_EMAIL, password: env.TEST_PASSWORD } });
  if (!check(auth.status === 200 && !!auth.body.access_token, "signed in as the test account", `HTTP ${auth.status}`)) return;
  const token: string = auth.body.access_token;
  const uid: string = auth.body.user.id;

  console.log("2. Profile (created by the sign-up trigger) and location");
  const prof = await call(`/rest/v1/users?select=id,location&id=eq.${uid}`, { token });
  if (!check(prof.status === 200 && prof.body.length === 1, "profile row exists", `HTTP ${prof.status}`)) return;
  if (!prof.body[0].location) {
    const set = await call(`/rest/v1/users?id=eq.${uid}`, { method: "PATCH", token, json: { location: "72032" } });
    check(set.status === 204 || set.status === 200, "location saved (72032)", `HTTP ${set.status}`);
  }

  const prefsBefore = await call(`/rest/v1/preference_vector?select=tag,weight&user_id=eq.${uid}`, { token });
  if (!check(prefsBefore.status === 200, "preferences snapshot taken (restored at the end)", `HTTP ${prefsBefore.status}`)) return;
  const createdSuggestions: string[] = [];
  made = [];
  state.cleanup = async () => {
    for (const id of createdSuggestions) await call(`/rest/v1/suggestions?id=eq.${id}`, { method: "DELETE", token });
    const before = new Map<string, number>((prefsBefore.body as { tag: string; weight: number }[]).map((p) => [p.tag, p.weight]));
    const after = await call(`/rest/v1/preference_vector?select=tag,weight&user_id=eq.${uid}`, { token });
    for (const p of after.body as { tag: string; weight: number }[]) {
      const tag = encodeURIComponent(p.tag);
      if (!before.has(p.tag)) await call(`/rest/v1/preference_vector?user_id=eq.${uid}&tag=eq.${tag}`, { method: "DELETE", token });
      else if (before.get(p.tag) !== p.weight) await call(`/rest/v1/preference_vector?user_id=eq.${uid}&tag=eq.${tag}`, { method: "PATCH", token, json: { weight: before.get(p.tag) } });
    }
    const restored = await call(`/rest/v1/preference_vector?select=tag,weight&user_id=eq.${uid}`, { token });
    const norm = (rows: { tag: string; weight: number }[]) => JSON.stringify([...rows].sort((a, b) => a.tag.localeCompare(b.tag)));
    check(norm(restored.body) === norm(prefsBefore.body), "preference weights are exactly as they were before the run");
    for (const m of made) await call(`/rest/v1/garments?id=eq.${m.id}`, { method: "DELETE", token });
    const del = await call("/storage/v1/object/garments", { method: "DELETE", token, json: { prefixes: made.map((m) => m.path) } });
    check(del.status === 200, "garments, suggestions and photos created by this run removed", `HTTP ${del.status}`);
  };

  console.log("3. Security rules reject what they should");
  const forged = await call("/rest/v1/garments", { token, json: { owner_id: randomUUID(), image_path: "x/y.jpg", type: "jeans", color: "blue", season: "all", warmth: 3 } });
  check(forged.status === 403 || forged.status === 401, "cannot insert a garment owned by someone else", `HTTP ${forged.status}`);
  const foreignUpload = await call(`/storage/v1/object/garments/${randomUUID()}/x.png`, { token, raw: Buffer.from("x"), mime: "image/png" });
  check(foreignUpload.status >= 400 && foreignUpload.status < 500, "cannot upload into someone else's photo folder", `HTTP ${foreignUpload.status}`);
  const noToken = await call("/functions/v1/update-preferences", { json: { suggestion_id: "x", feedback: "up" } });
  check(noToken.status === 401, "functions refuse a request without a login", `HTTP ${noToken.status}`);

  console.log("4. Upload photos, tag them with the real AI, save them as garments");
  const files = readdirSync(dir).filter((f) => MIME[extname(f).toLowerCase()]).sort();
  const pick = (env.E2E_PICK ?? "5,10,9,11,15,18,21").split(",").map((n) => Number(n.trim()) - 1).filter((i) => files[i]);
  if (!check(pick.length >= 3, `${pick.length} photos selected from ${files.length}`)) return;
  for (const i of pick) {
    const file = files[i]!;
    const path = `${uid}/${randomUUID()}${extname(file).toLowerCase()}`;
    const up = await call(`/storage/v1/object/garments/${path}`, { token, raw: readFileSync(join(dir, file)), mime: MIME[extname(file).toLowerCase()] });
    if (!check(up.status === 200, `uploaded photo #${i + 1}`, `HTTP ${up.status}`)) continue;
    const tagged = await call("/functions/v1/analyze-garment", { token, json: { image_path: path } });
    if (!check(tagged.status === 200 && !!tagged.body.tags?.type, `tagged photo #${i + 1}`, tagged.status === 200 ? `${tagged.body.tags.type}/${tagged.body.tags.color}` : `HTTP ${tagged.status} ${JSON.stringify(tagged.body).slice(0, 120)}`)) continue;
    const t = tagged.body.tags;
    const row = { owner_id: uid, image_path: path, type: t.type, color: t.color ?? "multicolor", season: t.season ?? "all", warmth: t.warmth ?? 3, status: "clean" };
    const ins = await call("/rest/v1/garments", { token, json: row, headers: { prefer: "return=representation" } });
    if (check(ins.status === 201 && !!ins.body[0]?.id, `saved garment #${i + 1}`, `HTTP ${ins.status}`)) made.push({ id: ins.body[0].id, path, type: t.type });
  }
  const own = await call(`/rest/v1/garments?select=id&owner_id=eq.${uid}`, { token });
  check(own.status === 200 && made.every((m) => own.body.some((g: any) => g.id === m.id)), "all saved garments are readable by their owner");

  console.log("5. Daily suggestion, feedback, re-roll, accept");
  const today = new Date().toISOString().slice(0, 10);
  const first = await call("/functions/v1/generate-outfit", { token, json: { date: today } });
  if (!check(first.status === 200, "generate-outfit answered", `HTTP ${first.status} ${first.status === 200 ? first.body.status : JSON.stringify(first.body).slice(0, 120)}`)) return;
  if (first.body.status !== "ok") {
    check(false, "an outfit was produced", `${first.body.status}: ${first.body.reasoning}`);
    return;
  }
  createdSuggestions.push(first.body.suggestion_id);
  const ids: string[] = Object.values(first.body.outfit);
  check(ids.every((id) => made.some((m) => m.id === id)), "the outfit uses only this account's garments", first.body.reasoning);
  const down = await call("/functions/v1/update-preferences", { token, json: { suggestion_id: first.body.suggestion_id, feedback: "down" } });
  check(down.status === 200 && down.body.updated_tags?.length > 0, "thumbs down updated preference tags", `HTTP ${down.status}`);
  const twice = await call("/functions/v1/update-preferences", { token, json: { suggestion_id: first.body.suggestion_id, feedback: "down" } });
  check(twice.status === 409, "a second feedback on the same suggestion is refused", `HTTP ${twice.status}`);
  const again = await call("/functions/v1/generate-outfit", { token, json: { date: today, exclude_suggestion_ids: [first.body.suggestion_id] } });
  if (again.body?.suggestion_id) createdSuggestions.push(again.body.suggestion_id);
  check(again.status === 200 && (again.body.status === "exhausted" || JSON.stringify(Object.values(again.body.outfit ?? {}).sort()) !== JSON.stringify([...ids].sort())), "re-roll gives a different outfit (or says none are left)", again.body.status);
  const accept = await call("/rest/v1/rpc/accept_suggestion", { token, json: { p_suggestion_id: first.body.suggestion_id } });
  check(accept.status === 200 || accept.status === 204, "accepting a suggestion succeeds", `HTTP ${accept.status}`);
  const worn = await call(`/rest/v1/garments?select=last_worn_date&id=in.(${ids.join(",")})`, { token });
  check(worn.status === 200 && worn.body.every((g: any) => g.last_worn_date === today), "accepted items are marked worn today");
}

try {
  await main();
} catch (error) {
  failed++;
  console.log(` FAIL  unexpected error: ${(error as Error).message}`);
} finally {
  if (state.cleanup && !env.E2E_KEEP) {
    console.log("6. Clean up (always runs, even after a failure)");
    try {
      await state.cleanup();
    } catch (error) {
      failed++;
      console.log(` FAIL  cleanup error: ${(error as Error).message} - check the account for leftovers`);
    }
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
