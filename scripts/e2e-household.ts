// Two-person household sharing check against the REAL Supabase project (D18).
//
//   node scripts/e2e-household.ts
//
// Needs (git-ignored, never printed):
//   .env                 TEST_EMAIL / TEST_PASSWORD   account A (an existing email+password account)
//                        TEST2_EMAIL / TEST2_PASSWORD account B (a second, different email+password account)
//   frontend/.env.local  EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
// Both accounts must start OUT of any household (the script refuses to touch a real household).
// It uses no AI calls. Everything it creates (garments, photos, the household) is removed at the end, even after a failure.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

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
for (const k of ["TEST_EMAIL", "TEST_PASSWORD", "TEST2_EMAIL", "TEST2_PASSWORD"]) {
  if (!env[k]) throw new Error(`${k} missing in .env (two different email+password accounts are needed)`);
}
if (env.TEST_EMAIL!.toLowerCase() === env.TEST2_EMAIL!.toLowerCase()) throw new Error("TEST_EMAIL and TEST2_EMAIL must be different accounts");

// 1x1 PNG; storage does not inspect it.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let passed = 0;
let failed = 0;
const check = (ok: boolean, label: string, detail = "") => {
  ok ? passed++ : failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  (${detail})` : ""}`);
  return ok;
};

type Reply = { status: number; body: any };
async function call(path: string, init: { method?: string; token?: string; json?: unknown; raw?: Uint8Array; mime?: string; headers?: Record<string, string> } = {}): Promise<Reply> {
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

interface Who { name: string; token: string; uid: string; garments: string[]; paths: string[]; ownsHousehold: boolean }
async function signIn(name: string, email: string, password: string): Promise<Who | null> {
  const r = await call("/auth/v1/token?grant_type=password", { json: { email, password } });
  if (!check(r.status === 200 && !!r.body.access_token, `${name} signed in`, `HTTP ${r.status}`)) return null;
  return { name, token: r.body.access_token, uid: r.body.user.id, garments: [], paths: [], ownsHousehold: false };
}
const householdOf = async (w: Who): Promise<string | null> => {
  const r = await call(`/rest/v1/users?select=household_id&id=eq.${w.uid}`, { token: w.token });
  return r.status === 200 && r.body[0] ? r.body[0].household_id : null;
};
const rpc = (w: Who, fn: string, args: object = {}) => call(`/rest/v1/rpc/${fn}`, { token: w.token, json: args });

async function addGarment(w: Who, type: string, path: string): Promise<string | null> {
  const r = await call("/rest/v1/garments", {
    token: w.token,
    json: { owner_id: w.uid, image_path: path, type, color: "white", season: "all", warmth: 2, status: "clean" },
    headers: { prefer: "return=representation" },
  });
  if (r.status !== 201 || !r.body[0]?.id) return null;
  w.garments.push(r.body[0].id);
  return r.body[0].id;
}

const state: { a?: Who; b?: Who } = {};

async function main() {
  console.log("1. Sign in both accounts and make sure neither is in a household");
  const a = await signIn("A", env.TEST_EMAIL!, env.TEST_PASSWORD!);
  const b = await signIn("B", env.TEST2_EMAIL!, env.TEST2_PASSWORD!);
  if (!a || !b) return;
  state.a = a;
  state.b = b;
  if (a.uid === b.uid) return void check(false, "A and B are different accounts");
  for (const w of [a, b]) {
    const h = await householdOf(w);
    if (!check(h === null, `${w.name} is not in a household`, h ? "already in one: leave it first, this script will not touch a real household" : "")) return;
    const loc = await call(`/rest/v1/users?select=location&id=eq.${w.uid}`, { token: w.token });
    if (loc.status === 200 && !loc.body[0]?.location) await call(`/rest/v1/users?id=eq.${w.uid}`, { method: "PATCH", token: w.token, json: { location: "72032" } });
  }
  // From here on any household membership was created by this script, so cleanup may undo it.
  // Before this point cleanup must not touch a household: it could be a real one.
  a.ownsHousehold = true;
  b.ownsHousehold = true;

  console.log("2. A creates a household; invite codes are checked");
  const created = await rpc(a, "create_household", { p_name: "E2E Test Household" });
  const hid: string = created.body;
  if (!check(created.status === 200 && typeof hid === "string", "A created a household", `HTTP ${created.status}`)) return;
  const row = await call(`/rest/v1/households?select=invite_code&id=eq.${hid}`, { token: a.token });
  const code: string = row.body[0]?.invite_code;
  check(/^[0-9a-f]{8}$/.test(code ?? ""), "the invite code is 8 hex characters");
  const again = await rpc(a, "create_household", { p_name: "Second" });
  check(again.status >= 400 && JSON.stringify(again.body).includes("already in a household"), "A cannot create a second household while in one");
  const wrong = await rpc(b, "join_household", { p_code: "00000000" });
  check(wrong.status >= 400 && JSON.stringify(wrong.body).includes("invalid invite code"), "B is refused with a wrong invite code");
  const outsider = await call(`/rest/v1/households?select=id&id=eq.${hid}`, { token: b.token });
  check(outsider.status === 200 && outsider.body.length === 0, "B cannot read the household before joining");

  console.log("3. B joins; A's clothes become visible to B, read-only");
  const joined = await rpc(b, "join_household", { p_code: code });
  if (!check(joined.status === 200, "B joined with the invite code", `HTTP ${joined.status}`)) return;
  const pathA = `${a.uid}/${randomUUID()}.png`;
  const upA = await call(`/storage/v1/object/garments/${pathA}`, { token: a.token, raw: PIXEL, mime: "image/png" });
  if (!check(upA.status === 200, "A uploaded a photo", `HTTP ${upA.status}`)) return;
  a.paths.push(pathA);
  const ids = [await addGarment(a, "t_shirt", pathA), await addGarment(a, "jeans", pathA), await addGarment(a, "sneakers", pathA)];
  if (!check(ids.every(Boolean), "A saved a top, a bottom and shoes")) return;
  const gid = ids[0]!;
  const seen = await call(`/rest/v1/garments?select=id,owner_id&owner_id=eq.${a.uid}`, { token: b.token });
  check(seen.status === 200 && seen.body.length === 3, "B can see all 3 of A's garments", `saw ${Array.isArray(seen.body) ? seen.body.length : seen.status}`);
  const photo = await call(`/storage/v1/object/authenticated/garments/${pathA}`, { token: b.token });
  check(photo.status === 200, "B can view A's photo", `HTTP ${photo.status}`);

  console.log("4. B cannot change or delete anything of A's");
  const patch = await call(`/rest/v1/garments?id=eq.${gid}`, { method: "PATCH", token: b.token, json: { status: "dirty" }, headers: { prefer: "return=representation" } });
  check(patch.status >= 400 || (Array.isArray(patch.body) && patch.body.length === 0), "B's attempt to mark A's garment dirty changed nothing", `HTTP ${patch.status}`);
  const del = await call(`/rest/v1/garments?id=eq.${gid}`, { method: "DELETE", token: b.token, headers: { prefer: "return=representation" } });
  check(del.status >= 400 || (Array.isArray(del.body) && del.body.length === 0), "B's attempt to delete A's garment removed nothing", `HTTP ${del.status}`);
  const still = await call(`/rest/v1/garments?select=status&id=eq.${gid}`, { token: a.token });
  check(still.body[0]?.status === "clean", "A's garment is still there and still clean");
  const forged = await call("/rest/v1/garments", { token: b.token, json: { owner_id: a.uid, image_path: pathA, type: "shirt", color: "red", season: "all", warmth: 2 } });
  check(forged.status === 403 || forged.status === 401, "B cannot create a garment in A's name", `HTTP ${forged.status}`);
  const foreignUpload = await call(`/storage/v1/object/garments/${a.uid}/${randomUUID()}.png`, { token: b.token, raw: PIXEL, mime: "image/png" });
  check(foreignUpload.status >= 400 && foreignUpload.status < 500, "B cannot upload into A's photo folder", `HTTP ${foreignUpload.status}`);
  const delPhoto = await call("/storage/v1/object/garments", { method: "DELETE", token: b.token, json: { prefixes: [pathA] } });
  const photoAfter = await call(`/storage/v1/object/authenticated/garments/${pathA}`, { token: a.token });
  check(photoAfter.status === 200, "B cannot delete A's photo", `delete answered HTTP ${delPhoto.status}`);

  console.log("5. B's own closet is separate, even though A's clothes are visible");
  const pathB = `${b.uid}/${randomUUID()}.png`;
  const upB = await call(`/storage/v1/object/garments/${pathB}`, { token: b.token, raw: PIXEL, mime: "image/png" });
  if (check(upB.status === 200, "B uploaded a photo", `HTTP ${upB.status}`)) {
    b.paths.push(pathB);
    const gb = await addGarment(b, "t_shirt", pathB);
    check(!!gb, "B saved one garment");
    const aSeesB = await call(`/rest/v1/garments?select=id&owner_id=eq.${b.uid}`, { token: a.token });
    check(aSeesB.status === 200 && aSeesB.body.length === 1, "A can see B's garment too (sharing goes both ways)");
  }
  const outfit = await call("/functions/v1/generate-outfit", { token: b.token, json: { date: new Date().toISOString().slice(0, 10) } });
  check(outfit.status === 200 && outfit.body.status === "incomplete" && outfit.body.missing_slots?.includes("bottom") && outfit.body.missing_slots?.includes("shoes"),
    "B's outfit uses only B's own clothes (A's full outfit is not borrowed)", `${outfit.status} ${outfit.body?.status}`);

  console.log("6. Leaving stops the sharing, and the last member out deletes the household");
  const bLeft = await rpc(b, "leave_household");
  check(bLeft.status === 200 || bLeft.status === 204, "B left the household", `HTTP ${bLeft.status}`);
  const gone = await call(`/rest/v1/garments?select=id&owner_id=eq.${a.uid}`, { token: b.token });
  check(gone.status === 200 && gone.body.length === 0, "B can no longer see A's garments");
  // Storage's CDN may keep serving a file it already delivered for the same URL, so the plain URL proves
  // nothing here. Ask the database policy directly (list) and bypass the cache with a throwaway query parameter.
  const listed = await call("/storage/v1/object/list/garments", { method: "POST", token: b.token, json: { prefix: a.uid, limit: 100 } });
  check(listed.status === 200 && Array.isArray(listed.body) && listed.body.length === 0, "B can no longer list A's photos", `HTTP ${listed.status}, ${Array.isArray(listed.body) ? listed.body.length : "?"} listed`);
  const photoGone = await call(`/storage/v1/object/authenticated/garments/${pathA}?nocache=${randomUUID()}`, { token: b.token });
  check(photoGone.status >= 400, "B can no longer download A's photo (cache bypassed)", `HTTP ${photoGone.status}`);
  const photoCached = await call(`/storage/v1/object/authenticated/garments/${pathA}`, { token: b.token });
  console.log(`  info the plain photo URL answered HTTP ${photoCached.status} after B left${photoCached.status < 400 ? " (served from the Storage cache, not by the policy)" : ""}`);
  const aStill = await call(`/rest/v1/garments?select=id&owner_id=eq.${a.uid}`, { token: a.token });
  check(aStill.body.length === 3, "A still has all 3 of their own garments");
  const notIn = await rpc(b, "leave_household");
  check(notIn.status >= 400 && JSON.stringify(notIn.body).includes("not in a household"), "leaving when not in a household is refused");
  const aLeft = await rpc(a, "leave_household");
  check(aLeft.status === 200 || aLeft.status === 204, "A (the last member) left", `HTTP ${aLeft.status}`);
  const hhGone = await call(`/rest/v1/households?select=id&id=eq.${hid}`, { token: a.token });
  check(hhGone.status === 200 && hhGone.body.length === 0, "the empty household was deleted");
}

async function cleanup() {
  for (const w of [state.a, state.b]) {
    if (!w) continue;
    for (const id of w.garments) await call(`/rest/v1/garments?id=eq.${id}`, { method: "DELETE", token: w.token });
    if (w.paths.length) await call("/storage/v1/object/garments", { method: "DELETE", token: w.token, json: { prefixes: w.paths } });
    if (w.ownsHousehold && (await householdOf(w)) !== null) await rpc(w, "leave_household");
    const left = await call(`/rest/v1/garments?select=id&owner_id=eq.${w.uid}`, { token: w.token });
    check(left.status === 200 && left.body.length === 0 && (!w.ownsHousehold || (await householdOf(w)) === null), `${w.name}: no test garments left${w.ownsHousehold ? " and not in a household" : ""}`);
  }
}

try {
  await main();
} catch (error) {
  failed++;
  console.log(` FAIL  unexpected error: ${(error as Error).message}`);
} finally {
  console.log("7. Clean up (always runs, even after a failure)");
  try {
    await cleanup();
  } catch (error) {
    failed++;
    console.log(` FAIL  cleanup error: ${(error as Error).message} - check both accounts for leftovers`);
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
