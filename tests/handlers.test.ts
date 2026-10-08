import { describe, expect, it, vi } from "vitest";
import {
  MAX_EXCLUDED_SUGGESTIONS,
  handleGenerateOutfit,
  handleUpdatePreferences,
  type GenerateOutfitDeps,
  type UpdatePreferencesDeps,
} from "../supabase/functions/_shared/handlers.ts";
import { WeatherParseError, parseWeather } from "../supabase/functions/_shared/weather.ts";
import type {
  Garment,
  PreferenceEntry,
  Suggestion,
  UserProfile,
  WeatherSnapshot,
} from "../supabase/functions/_shared/types.ts";

const USER = "user-1";
const HOUSEHOLD = "house-1";
const HOUSEMATE = "user-2";
const MILD: WeatherSnapshot = { temp_c: 18, feels_like_c: 18, is_precipitating: false };

const g = (id: string, type: Garment["type"], color: Garment["color"], extra: Partial<Garment> = {}): Garment => ({
  id, owner_id: USER, image_path: `${USER}/${id}.jpg`, type, color,
  season: "all", warmth: 2, status: "clean", last_worn_date: null, ...extra,
});
const closet = (): Garment[] => [
  g("t-red", "t_shirt", "red"), g("t-blue", "t_shirt", "blue"),
  g("b-1", "jeans", "navy"), g("s-1", "sneakers", "white"),
];
const profile = (extra: Partial<UserProfile> = {}): UserProfile => ({
  id: USER, household_id: HOUSEHOLD, name: "Test", location: "Conway", quiz_preferences: null, ...extra,
});

// In-memory backend implementing both Deps interfaces.
function fakeBackend(init: { profile?: UserProfile | null; garments?: Garment[]; prefs?: PreferenceEntry[]; weather?: () => Promise<WeatherSnapshot> } = {}) {
  const state = {
    profile: init.profile === undefined ? profile() : init.profile,
    garments: init.garments ?? closet(),
    prefs: [...(init.prefs ?? [])],
    suggestions: new Map<string, Suggestion>(),
    nextId: 1,
  };
  const generate: GenerateOutfitDeps = {
    getProfile: async () => state.profile,
    getOwnGarments: async (u) => state.garments.filter((x) => x.owner_id === u),
    getPreferences: async () => state.prefs,
    getWeather: init.weather ?? (async () => MILD),
    getSuggestionGarmentIds: async (_u, ids) => ids.map((id) => state.suggestions.get(id)?.garment_ids ?? []),
    saveSuggestion: async (row) => {
      const id = `sug-${state.nextId++}`;
      state.suggestions.set(id, { id, ...row, feedback: null, accepted: false });
      return id;
    },
  };
  const update: UpdatePreferencesDeps = {
    getSuggestion: async (u, id) => (u === USER ? state.suggestions.get(id) ?? null : null),
    getOwnGarmentsByIds: async (u, ids) => state.garments.filter((x) => x.owner_id === u && ids.includes(x.id)),
    getPreferences: async () => state.prefs,
    upsertPreferences: async (_u, entries) => {
      const m = new Map(state.prefs.map((p) => [p.tag, p.weight]));
      for (const e of entries) m.set(e.tag, e.weight);
      state.prefs = [...m].map(([tag, weight]) => ({ tag, weight }));
    },
    claimFeedback: async (id, feedback) => {
      const s = state.suggestions.get(id)!;
      if (s.feedback !== null) return false;
      s.feedback = feedback;
      return true;
    },
  };
  return { state, generate, update };
}

describe("handleGenerateOutfit", () => {
  it("scores the household closet, saves the suggestion and returns its id", async () => {
    const b = fakeBackend();
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    expect(res.ok && res.body.status).toBe("ok");
    if (!res.ok || res.body.status !== "ok") throw new Error("expected ok");
    expect(res.body.suggestion_id).toBe("sug-1");
    expect(b.state.suggestions.get("sug-1")!.garment_ids).toEqual([res.body.outfit.top, res.body.outfit.bottom, res.body.outfit.shoes]);
  });

  it("uses the profile's location and temperature comfort", async () => {
    const getWeather = vi.fn(async () => ({ temp_c: 12, feels_like_c: 16, is_precipitating: false }));
    const b = fakeBackend({ profile: profile({ location: " Little Rock ", quiz_preferences: { style_vibes: [], temp_comfort: "runs_cold", occasions: [], favorite_colors: [], avoided_colors: [] } }), weather: getWeather,
      garments: [g("light", "t_shirt", "blue", { warmth: 2 }), g("warm", "sweater", "gray", { warmth: 3 }), g("b", "jeans", "navy"), g("s", "sneakers", "white")] });
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    expect(getWeather).toHaveBeenCalledWith(" Little Rock ");
    // 16 C feels-like + runs_cold (-3) = 13 -> warmth target 3 -> picks the sweater over the t-shirt
    expect(res.ok && res.body.status === "ok" && res.body.outfit.top).toBe("warm");
  });

  it("returns incomplete/exhausted results without saving anything", async () => {
    const b = fakeBackend({ garments: [g("t", "t_shirt", "blue")] });
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    expect(res).toMatchObject({ ok: true, body: { status: "incomplete", missing_slots: ["bottom", "shoes"] } });
    expect(b.state.suggestions.size).toBe(0);
  });

  it("re-rolls: a rejected suggestion is excluded from the next one until nothing is left", async () => {
    const b = fakeBackend();
    const first = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    const second = await handleGenerateOutfit(USER, { date: "2026-10-05", exclude_suggestion_ids: ["sug-1"] }, b.generate);
    if (!first.ok || first.body.status !== "ok" || !second.ok || second.body.status !== "ok") throw new Error("expected ok");
    expect(second.body.outfit.top).not.toBe(first.body.outfit.top);
    const third = await handleGenerateOutfit(USER, { date: "2026-10-05", exclude_suggestion_ids: ["sug-1", "sug-2"] }, b.generate);
    expect(third).toMatchObject({ ok: true, body: { status: "exhausted" } });
    expect(b.state.suggestions.size).toBe(2);
  });

  it.each([
    ["2026-13-01"], ["2026-02-30"], ["10/05/2026"], [""], [undefined], [20261005],
  ])("rejects an invalid date %j", async (date) => {
    const res = await handleGenerateOutfit(USER, { date } as never, fakeBackend().generate);
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects malformed or oversized exclusion lists", async () => {
    const b = fakeBackend();
    expect(await handleGenerateOutfit(USER, { date: "2026-10-05", exclude_suggestion_ids: "x" as never }, b.generate)).toMatchObject({ ok: false, status: 400 });
    expect(await handleGenerateOutfit(USER, { date: "2026-10-05", exclude_suggestion_ids: [1] as never }, b.generate)).toMatchObject({ ok: false, status: 400 });
    const tooMany = Array.from({ length: MAX_EXCLUDED_SUGGESTIONS + 1 }, (_, i) => `s${i}`);
    expect(await handleGenerateOutfit(USER, { date: "2026-10-05", exclude_suggestion_ids: tooMany }, b.generate)).toMatchObject({ ok: false, status: 400 });
  });

  it("explains what is missing: no profile or no location", async () => {
    const run = (p: UserProfile | null) => handleGenerateOutfit(USER, { date: "2026-10-05" }, fakeBackend({ profile: p }).generate);
    expect(await run(null)).toMatchObject({ ok: false, status: 404 });
    expect(await run(profile({ location: null }))).toMatchObject({ ok: false, status: 409, error: expect.stringContaining("location") });
    expect(await run(profile({ location: "   " }))).toMatchObject({ ok: false, status: 409 });
  });

  it("works for someone who is not in a household (D18)", async () => {
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, fakeBackend({ profile: profile({ household_id: null }) }).generate);
    expect(res).toMatchObject({ ok: true, body: { status: "ok" } });
  });

  it("never suggests a housemate's clothes, even when they are the best match (D18)", async () => {
    const theirs = (id: string, type: Garment["type"]) => g(id, type, "navy", { owner_id: HOUSEMATE });
    const b = fakeBackend({ garments: [...closet(), theirs("their-top", "t_shirt"), theirs("their-bottom", "jeans"), theirs("their-shoes", "sneakers")] });
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    if (!res.ok || res.body.status !== "ok") throw new Error("expected ok");
    for (const id of Object.values(res.body.outfit)) expect(id).not.toMatch(/^their-/);
  });

  it("reports an empty closet as incomplete when all the clothes belong to housemates", async () => {
    const b = fakeBackend({ garments: closet().map((x) => ({ ...x, owner_id: HOUSEMATE })) });
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    expect(res).toMatchObject({ ok: true, body: { status: "incomplete", missing_slots: ["top", "bottom", "shoes"] } });
  });

  it("maps a weather failure to 502 and does not save", async () => {
    const b = fakeBackend({ weather: async () => { throw new Error("boom"); } });
    const res = await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(b.state.suggestions.size).toBe(0);
  });
});

describe("handleUpdatePreferences", () => {
  async function suggested() {
    const b = fakeBackend();
    await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    return b;
  }

  it("updates weights for the suggested items and stores the feedback", async () => {
    const b = await suggested();
    const res = await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "up" }, b.update);
    expect(res.ok && res.body.updated_tags).toEqual(expect.arrayContaining(["type:jeans", "type:sneakers", "color:navy", "color:white"]));
    expect(b.state.suggestions.get("sug-1")!.feedback).toBe("up");
    expect(b.state.prefs.find((p) => p.tag === "type:jeans")!.weight).toBeGreaterThan(0);
  });

  it("lowers weights on thumbs down", async () => {
    const b = await suggested();
    await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "down" }, b.update);
    expect(b.state.prefs.find((p) => p.tag === "type:jeans")!.weight).toBeLessThan(0);
  });

  it("refuses a second feedback so one outfit cannot count twice", async () => {
    const b = await suggested();
    await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "up" }, b.update);
    const before = structuredClone(b.state.prefs);
    const again = await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "up" }, b.update);
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(b.state.prefs).toEqual(before);
  });

  it("loses a race safely: if another request claims the feedback first, no weights change", async () => {
    const b = await suggested();
    const racing = { ...b.update, claimFeedback: async () => false };
    const res = await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "up" }, racing);
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(b.state.prefs).toEqual([]);
  });

  it("validates input and ownership", async () => {
    const b = await suggested();
    expect(await handleUpdatePreferences(USER, { suggestion_id: "", feedback: "up" }, b.update)).toMatchObject({ ok: false, status: 400 });
    expect(await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "meh" as never }, b.update)).toMatchObject({ ok: false, status: 400 });
    expect(await handleUpdatePreferences(USER, { suggestion_id: "nope", feedback: "up" }, b.update)).toMatchObject({ ok: false, status: 404 });
    expect(await handleUpdatePreferences("someone-else", { suggestion_id: "sug-1", feedback: "up" }, b.update)).toMatchObject({ ok: false, status: 404 });
  });

  it("still records feedback when the garments were deleted", async () => {
    const b = await suggested();
    b.state.garments = [];
    const res = await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "down" }, b.update);
    expect(res).toMatchObject({ ok: true, body: { updated_tags: [] } });
    expect(b.state.suggestions.get("sug-1")!.feedback).toBe("down");
  });

  it("learns without a household, and never learns from clothes the user does not own (D18)", async () => {
    const b = fakeBackend({ profile: profile({ household_id: null }) });
    await handleGenerateOutfit(USER, { date: "2026-10-05" }, b.generate);
    // A garment owned by a housemate sneaks into the stored suggestion (e.g. it was owned by someone who left).
    b.state.garments.push(g("their-hat", "hoodie", "purple", { owner_id: HOUSEMATE }));
    b.state.suggestions.get("sug-1")!.garment_ids.push("their-hat");
    const res = await handleUpdatePreferences(USER, { suggestion_id: "sug-1", feedback: "up" }, b.update);
    if (!res.ok) throw new Error("expected ok");
    expect(res.body.updated_tags).toContain("type:jeans");
    expect(res.body.updated_tags).not.toContain("color:purple");
    expect(res.body.updated_tags).not.toContain("type:hoodie");
  });
});

describe("full loop through the handlers", () => {
  it("thumbs-down on red outfits teaches the engine to stop suggesting red", async () => {
    const b = fakeBackend({ garments: [
      g("t-red", "t_shirt", "red"), g("t-blue", "t_shirt", "blue"), g("t-gray", "t_shirt", "gray"),
      g("b-1", "jeans", "navy"), g("b-2", "jeans", "black"), g("s-1", "sneakers", "white"),
    ] });
    const redSuggestions: boolean[] = [];
    for (let day = 1; day <= 12; day++) {
      const date = `2026-10-${String(day).padStart(2, "0")}`;
      const rejected: string[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await handleGenerateOutfit(USER, { date, exclude_suggestion_ids: rejected }, b.generate);
        if (!res.ok || res.body.status !== "ok") break;
        const isRed = res.body.outfit.top === "t-red";
        redSuggestions.push(isRed);
        await handleUpdatePreferences(USER, { suggestion_id: res.body.suggestion_id, feedback: isRed ? "down" : "up" }, b.update);
        if (!isRed) {
          for (const id of [res.body.outfit.top, res.body.outfit.bottom, res.body.outfit.shoes]) {
            b.state.garments.find((x) => x.id === id)!.last_worn_date = date;
          }
          break;
        }
        rejected.push(res.body.suggestion_id);
      }
    }
    const firstHalf = redSuggestions.slice(0, Math.floor(redSuggestions.length / 2)).filter(Boolean).length;
    const secondHalf = redSuggestions.slice(Math.floor(redSuggestions.length / 2)).filter(Boolean).length;
    expect(b.state.prefs.find((p) => p.tag === "type:t_shirt")).toBeDefined();
    expect(secondHalf).toBeLessThanOrEqual(firstHalf);
    // Observed pattern "..RR.RR........." : at most 4 early rejections, then red stops for good.
    expect(redSuggestions.filter(Boolean).length).toBeLessThanOrEqual(4);
    expect(redSuggestions.slice(-8).some(Boolean)).toBe(false);
  });
});

describe("parseWeather", () => {
  it("maps an OpenWeatherMap response", () => {
    expect(parseWeather({ main: { temp: 7.4, feels_like: 4.1 }, weather: [{ main: "Clouds" }] })).toEqual({
      temp_c: 7.4, feels_like_c: 4.1, is_precipitating: false,
    });
  });

  it.each([
    [{ weather: [{ main: "Rain" }] }], [{ weather: [{ main: "Drizzle" }] }], [{ weather: [{ main: "Thunderstorm" }] }],
    [{ weather: [{ main: "Snow" }] }], [{ weather: [{ main: "Clear" }], rain: { "1h": 0.4 } }], [{ weather: [], snow: { "1h": 1 } }],
  ])("detects precipitation in %j", (extra) => {
    expect(parseWeather({ main: { temp: 10 }, ...extra }).is_precipitating).toBe(true);
  });

  it("falls back to the real temperature when feels_like is missing and ignores zero rain", () => {
    const w = parseWeather({ main: { temp: 10 }, weather: [{ main: "Clear" }], rain: { "1h": 0 } });
    expect(w).toEqual({ temp_c: 10, feels_like_c: 10, is_precipitating: false });
  });

  it("tolerates odd entries but refuses a response without a temperature", () => {
    expect(parseWeather({ main: { temp: 1 }, weather: [null, "x", {}] }).is_precipitating).toBe(false);
    for (const bad of [null, undefined, "x", {}, { main: {} }, { main: { temp: "hot" } }, { main: { temp: NaN } }]) {
      expect(() => parseWeather(bad)).toThrow(WeatherParseError);
    }
  });
});
