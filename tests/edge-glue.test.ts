import { describe, expect, it, vi } from "vitest";
import { MAX_PATH_LENGTH, handleAnalyzeGarment, isOwnPhotoPath, type AnalyzeDeps } from "../supabase/functions/_shared/analyze-handler.ts";
import { GeminiError } from "../supabase/functions/_shared/gemini.ts";
import { bearerToken, toReply } from "../supabase/functions/_shared/http.ts";
import {
  analyzeDeps,
  bytesToBase64,
  generateOutfitDeps,
  updatePreferencesDeps,
  type Db,
  type Query,
} from "../supabase/functions/_shared/supabase-deps.ts";
import { WeatherParseError, fetchWeather, weatherUrl } from "../supabase/functions/_shared/weather.ts";
import type { AnalyzeGarmentResponse } from "../supabase/functions/_shared/types.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const tagged: AnalyzeGarmentResponse = { tags: { type: "jeans", color: "blue", season: "all", warmth: 3 }, confidence: {}, needs_review: [], warnings: [] };

describe("isOwnPhotoPath", () => {
  it("accepts a photo in the user's own folder", () => {
    for (const ext of ["jpg", "JPEG", "png", "webp", "heic", "heif"]) expect(isOwnPhotoPath(USER, `${USER}/a-b_c.${ext}`)).toBe(true);
  });

  it("rejects other folders, traversal, odd separators, bad extensions, and non-strings", () => {
    for (const bad of [
      `${OTHER}/a.jpg`, `${USER}/../${OTHER}/a.jpg`, `${USER}//a.jpg`, `${USER}\\a.jpg`, `${USER}/a.pdf`, `${USER}/a`,
      `x${USER}/a.jpg`, USER, "", `${USER}/${"a".repeat(MAX_PATH_LENGTH)}.jpg`,
    ]) expect(isOwnPhotoPath(USER, bad)).toBe(false);
    for (const bad of [null, undefined, 42, {}, ["a"]]) expect(isOwnPhotoPath(USER, bad)).toBe(false);
  });
});

describe("handleAnalyzeGarment", () => {
  const deps = (over: Partial<AnalyzeDeps> = {}): AnalyzeDeps => ({
    downloadImage: vi.fn(async () => ({ base64: "aGk=", mimeType: "image/jpeg" })),
    analyze: vi.fn(async () => tagged),
    ...over,
  });
  const req = { image_path: `${USER}/x.jpg` };

  it("downloads the photo, tags it and returns the tags", async () => {
    const d = deps();
    expect(await handleAnalyzeGarment(USER, req, d)).toEqual({ ok: true, body: tagged });
    expect(d.downloadImage).toHaveBeenCalledWith(`${USER}/x.jpg`);
    expect(d.analyze).toHaveBeenCalledWith({ base64: "aGk=", mimeType: "image/jpeg" });
  });

  it("refuses someone else's photo before touching storage or the AI", async () => {
    const d = deps();
    expect(await handleAnalyzeGarment(USER, { image_path: `${OTHER}/x.jpg` }, d)).toMatchObject({ ok: false, status: 403 });
    expect(await handleAnalyzeGarment(USER, {} as never, d)).toMatchObject({ ok: false, status: 403 });
    expect(await handleAnalyzeGarment(USER, undefined as never, d)).toMatchObject({ ok: false, status: 403 });
    expect(d.downloadImage).not.toHaveBeenCalled();
    expect(d.analyze).not.toHaveBeenCalled();
  });

  it("returns 404 when the photo is missing and does not call the AI", async () => {
    const d = deps({ downloadImage: vi.fn(async () => null) });
    expect(await handleAnalyzeGarment(USER, req, d)).toMatchObject({ ok: false, status: 404 });
    expect(d.analyze).not.toHaveBeenCalled();
  });

  it.each([
    [new GeminiError("secret-detail", "bad_image"), 400],
    [new GeminiError("secret-detail", "quota_exhausted", 429), 429],
    [new GeminiError("secret-detail", "rate_limited", 429), 429],
    [new GeminiError("secret-detail", "upstream", 503), 502],
    [new GeminiError("secret-detail", "network"), 502],
  ])("maps %s to HTTP %i without leaking the message", async (error, status) => {
    const res = await handleAnalyzeGarment(USER, req, deps({ analyze: vi.fn(async () => { throw error; }) }));
    expect(res).toMatchObject({ ok: false, status });
    if (!res.ok) expect(res.error).not.toContain("secret-detail");
  });

  it("lets unexpected errors propagate so the entry file returns a 500", async () => {
    await expect(handleAnalyzeGarment(USER, req, deps({ analyze: vi.fn(async () => { throw new TypeError("bug"); }) }))).rejects.toThrow("bug");
  });
});

describe("http helpers", () => {
  it("turns handler results into replies", () => {
    expect(toReply({ ok: true, body: { a: 1 } })).toEqual({ status: 200, body: { a: 1 } });
    expect(toReply({ ok: false, status: 429, error: "slow down" })).toEqual({ status: 429, body: { error: "slow down" } });
  });

  it("reads a bearer token only in the right shape", () => {
    expect(bearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(bearerToken("bearer   tok")).toBe("tok");
    for (const bad of [null, "", "Basic abc", "Bearer", "Bearer a b", "abc"]) expect(bearerToken(bad)).toBeNull();
  });
});

describe("weather lookup", () => {
  it("uses the zip lookup for US ZIP codes and the city lookup otherwise", () => {
    expect(weatherUrl("72032", "K")).toContain("zip=72032,US");
    expect(weatherUrl(" 72032-1234 ", "K")).toContain("zip=72032,US");
    expect(weatherUrl("Little Rock, AR", "K")).toContain("q=Little%20Rock%2C%20AR");
    expect(weatherUrl("São Paulo", "K")).toContain("q=S%C3%A3o%20Paulo");
    expect(weatherUrl("72032", "K")).toContain("units=metric&appid=K");
    expect(weatherUrl("1234", "K")).toContain("q=1234");
  });

  it("fetches and parses, and never puts the key in an error", async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ main: { temp: 20, feels_like: 19 }, weather: [{ main: "Rain" }] })));
    expect(await fetchWeather(ok as never, "SECRETKEY", "Conway")).toEqual({ temp_c: 20, feels_like_c: 19, is_precipitating: true });
    const bad = vi.fn(async () => new Response("no", { status: 401 }));
    const err = await fetchWeather(bad as never, "SECRETKEY", "Conway").catch((e) => e);
    expect(err).toBeInstanceOf(WeatherParseError);
    expect(err.message).toContain("401");
    expect(err.message).not.toContain("SECRETKEY");
  });
});

type Reply = { data: unknown; error?: { message: string } | null };
type Download = { data: Blob | null; error: { message: string } | null };

// A fake Supabase client that records every call and replies per table.
function fakeDb(replies: Record<string, Reply> = {}, download?: Download) {
  const calls: unknown[][] = [];
  const db: Db = {
    from(table) {
      calls.push(["from", table]);
      const reply = replies[table] ?? { data: null };
      const q: Query = {
        select: (c) => (calls.push(["select", c]), q),
        insert: (v) => (calls.push(["insert", v]), q),
        upsert: (v, o) => (calls.push(["upsert", v, o]), q),
        update: (v) => (calls.push(["update", v]), q),
        eq: (c, v) => (calls.push(["eq", c, v]), q),
        in: (c, v) => (calls.push(["in", c, v]), q),
        is: (c, v) => (calls.push(["is", c, v]), q),
        maybeSingle: () => (calls.push(["maybeSingle"]), q),
        single: () => (calls.push(["single"]), q),
        then: (res, rej) => Promise.resolve({ data: reply.data, error: reply.error ?? null }).then(res, rej),
      };
      return q;
    },
    storage: {
      from: (bucket) => ({
        download: async (path) => (calls.push(["download", bucket, path]), download ?? { data: null, error: { message: "missing" } }),
      }),
    },
  };
  return { db, calls };
}

describe("generateOutfitDeps queries", () => {
  const weather = vi.fn();

  it("reads the profile, the user's own garments and the preferences with ownership filters", async () => {
    const f = fakeDb({ users: { data: { id: USER } }, garments: { data: [{ id: "g" }] }, preference_vector: { data: [{ tag: "t", weight: 1 }] } });
    const d = generateOutfitDeps(f.db, weather);
    expect(await d.getProfile(USER)).toEqual({ id: USER });
    expect(await d.getOwnGarments(USER)).toEqual([{ id: "g" }]);
    expect(await d.getPreferences(USER)).toEqual([{ tag: "t", weight: 1 }]);
    expect(f.calls).toContainEqual(["select", "id, household_id, name, location, quiz_preferences"]);
    expect(f.calls).toContainEqual(["eq", "owner_id", USER]);
    expect(f.calls).toContainEqual(["eq", "user_id", USER]);
    expect(d.getWeather).toBe(weather);
  });

  it("treats missing rows as empty, and database errors as failures", async () => {
    const empty = generateOutfitDeps(fakeDb({ users: { data: null }, garments: { data: null } }).db, weather);
    expect(await empty.getProfile(USER)).toBeNull();
    expect(await empty.getOwnGarments(USER)).toEqual([]);
    const broken = generateOutfitDeps(
      fakeDb({ garments: { data: null, error: { message: "rls denied" } }, users: { data: null, error: { message: "boom" } } }).db,
      weather,
    );
    await expect(broken.getOwnGarments(USER)).rejects.toThrow("rls denied");
    await expect(broken.getProfile(USER)).rejects.toThrow("boom");
  });

  it("looks up earlier suggestions only for this user and returns their garment ids", async () => {
    const f = fakeDb({ suggestions: { data: [{ garment_ids: ["a", "b"] }, { garment_ids: ["c"] }] } });
    expect(await generateOutfitDeps(f.db, weather).getSuggestionGarmentIds(USER, ["s1", "s2"])).toEqual([["a", "b"], ["c"]]);
    expect(f.calls).toContainEqual(["eq", "user_id", USER]);
    expect(f.calls).toContainEqual(["in", "id", ["s1", "s2"]]);
  });

  it("saves a suggestion and returns its id, or fails loudly", async () => {
    const f = fakeDb({ suggestions: { data: { id: "new-id" } } });
    const row = { user_id: USER, date: "2026-10-09", garment_ids: ["a", "b", "c"] };
    expect(await generateOutfitDeps(f.db, weather).saveSuggestion(row)).toBe("new-id");
    expect(f.calls).toContainEqual(["insert", row]);
    expect(f.calls).toContainEqual(["select", "id"]);
    const broken = fakeDb({ suggestions: { data: null, error: { message: "nope" } } });
    await expect(generateOutfitDeps(broken.db, weather).saveSuggestion(row)).rejects.toThrow("nope");
  });
});

describe("updatePreferencesDeps queries", () => {
  it("loads a suggestion only if it belongs to the user", async () => {
    const f = fakeDb({ suggestions: { data: { id: "s1", feedback: null } } });
    expect(await updatePreferencesDeps(f.db).getSuggestion(USER, "s1")).toEqual({ id: "s1", feedback: null });
    expect(f.calls).toContainEqual(["eq", "id", "s1"]);
    expect(f.calls).toContainEqual(["eq", "user_id", USER]);
  });

  it("loads only the user's own garments by id, and skips the query for an empty list", async () => {
    const f = fakeDb({ garments: { data: [{ id: "a" }] } });
    const d = updatePreferencesDeps(f.db);
    expect(await d.getOwnGarmentsByIds(USER, ["a", "b"])).toEqual([{ id: "a" }]);
    expect(f.calls).toContainEqual(["eq", "owner_id", USER]);
    expect(f.calls).toContainEqual(["in", "id", ["a", "b"]]);
    const none = fakeDb();
    expect(await updatePreferencesDeps(none.db).getOwnGarmentsByIds(USER, [])).toEqual([]);
    expect(none.calls).toEqual([]);
  });

  it("reads the preferences of this user only", async () => {
    const f = fakeDb({ preference_vector: { data: [{ tag: "a", weight: 0.5 }] } });
    expect(await updatePreferencesDeps(f.db).getPreferences(USER)).toEqual([{ tag: "a", weight: 0.5 }]);
    expect(f.calls).toContainEqual(["eq", "user_id", USER]);
  });

  it("upserts weights per user and tag", async () => {
    const f = fakeDb({ preference_vector: { data: null } });
    await updatePreferencesDeps(f.db).upsertPreferences(USER, [{ tag: "color:red", weight: -0.2 }]);
    expect(f.calls).toContainEqual(["upsert", [{ user_id: USER, tag: "color:red", weight: -0.2 }], { onConflict: "user_id,tag" }]);
    const broken = fakeDb({ preference_vector: { data: null, error: { message: "bad" } } });
    await expect(updatePreferencesDeps(broken.db).upsertPreferences(USER, [])).rejects.toThrow("bad");
  });

  it("claims feedback only while it is still empty, and reports who won", async () => {
    const won = fakeDb({ suggestions: { data: [{ id: "s1" }] } });
    expect(await updatePreferencesDeps(won.db).claimFeedback("s1", "up")).toBe(true);
    expect(won.calls).toContainEqual(["update", { feedback: "up" }]);
    expect(won.calls).toContainEqual(["is", "feedback", null]);
    expect(won.calls).toContainEqual(["eq", "id", "s1"]);
    const lost = fakeDb({ suggestions: { data: [] } });
    expect(await updatePreferencesDeps(lost.db).claimFeedback("s1", "up")).toBe(false);
  });
});

describe("analyzeDeps", () => {
  const analyze = vi.fn(async () => tagged);

  it("downloads from the private bucket and picks the mime type from the extension", async () => {
    const blob = new Blob([new Uint8Array([104, 105])], { type: "application/octet-stream" });
    const f = fakeDb({}, { data: blob, error: null });
    expect(await analyzeDeps(f.db, analyze).downloadImage(`${USER}/x.PNG`)).toEqual({ base64: "aGk=", mimeType: "image/png" });
    expect(f.calls).toContainEqual(["download", "garments", `${USER}/x.PNG`]);
    const unknown = fakeDb({}, { data: blob, error: null });
    expect((await analyzeDeps(unknown.db, analyze).downloadImage(`${USER}/x.weird`))?.mimeType).toBe("application/octet-stream");
  });

  it("returns null when the photo cannot be downloaded", async () => {
    expect(await analyzeDeps(fakeDb().db, analyze).downloadImage(`${USER}/x.jpg`)).toBeNull();
    expect(await analyzeDeps(fakeDb({}, { data: null, error: null }).db, analyze).downloadImage(`${USER}/x.jpg`)).toBeNull();
    expect(analyzeDeps(fakeDb().db, analyze).analyze).toBe(analyze);
  });

  it("encodes large images to base64 correctly", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => i % 251);
    expect(Buffer.from(bytesToBase64(bytes), "base64").equals(Buffer.from(bytes))).toBe(true);
    expect(bytesToBase64(new Uint8Array())).toBe("");
  });
});
