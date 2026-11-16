// Style Swipe ideas are about taste, not today's weather, and should not keep showing the same pieces.
import { describe, expect, it } from "vitest";
import { handleGenerateOutfit, RECENT_EXPLORE_IDEAS, type GenerateOutfitDeps } from "../supabase/functions/_shared/handlers.ts";
import { outfitIds } from "../supabase/functions/_shared/outfit.ts";
import {
  OVERLAP_PENALTY,
  RECENT_WEIGHTS,
  SIMILAR_PENALTY,
  VARIETY_JITTER,
  VARIETY_MAX_REPEATS,
  VARIETY_REPEAT_PENALTY,
  jitterOf,
  scoreOutfit,
  similarityPenalty,
  type OutfitInput,
} from "../supabase/functions/_shared/scoring.ts";
import type { GarmentType } from "../supabase/functions/_shared/tag-schema.ts";
import type { Garment, WeatherSnapshot } from "../supabase/functions/_shared/types.ts";

let n = 0;
function g(id: string, type: GarmentType, extra: Partial<Garment> = {}): Garment {
  n += 1;
  return {
    id, owner_id: "u", image_path: `u/${n}.jpg`, type, colors: ["gray"], seasons: ["all"], warmth: 2,
    status: "clean", last_worn_date: null, ...extra,
  };
}

const COLD: WeatherSnapshot = { temp_c: -3, feels_like_c: -3, is_precipitating: true };
const HOT: WeatherSnapshot = { temp_c: 35, feels_like_c: 37, is_precipitating: false };

const input = (garments: Garment[], over: Partial<OutfitInput> = {}): OutfitInput => ({
  garments, weather: HOT, preferences: [], tempComfort: "neutral", date: "2026-07-05", ...over,
});
const ok = (r: ReturnType<typeof scoreOutfit>) => {
  if (r.status !== "ok") throw new Error(`expected ok, got ${r.status}: ${r.reasoning}`);
  return r;
};

// A closet with a few of everything, including a hoodie the old engine loved in the cold.
const closet = () => [
  g("tee-1", "t_shirt", { warmth: 1 }), g("tee-2", "t_shirt", { warmth: 1 }), g("tee-3", "shirt", { warmth: 2 }),
  g("hoodie-1", "hoodie", { warmth: 4 }), g("sweater-1", "sweater", { warmth: 4 }),
  g("jeans-1", "jeans", { warmth: 3 }), g("shorts-1", "shorts", { warmth: 1 }), g("skirt-1", "skirt", { warmth: 1 }),
  g("sneakers-1", "sneakers", { warmth: 2 }), g("sandals-1", "sandals", { warmth: 1 }), g("boots-1", "boots", { warmth: 4 }),
  g("jacket-1", "jacket", { warmth: 4 }), g("coat-1", "coat", { warmth: 5 }), g("tights-1", "tights", { warmth: 3 }),
];

const ids = (outfit: ReturnType<typeof outfitIds>) => outfit.join(",");
const idea = (seed: number, shown: string[][] = [], weather = HOT, garments = closet()) =>
  ok(scoreOutfit(input(garments, { weather, explore: { seed, shown } })));

describe("the weather does not rule Style Swipe", () => {
  it("gives the same idea in a heat wave and in a snowstorm", () => {
    expect(idea(7, [], HOT).outfit).toEqual(idea(7, [], COLD).outfit);
  });

  it("does not say anything about the temperature", () => {
    const text = idea(7, [], COLD).reasoning;
    expect(text).toMatch(/^A style idea:/);
    expect(text).not.toMatch(/feels like|warmth|because it is/i);
  });

  it("offers sandals, shorts and heavy knits in any weather, instead of only what suits the day", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) for (const id of outfitIds(idea(seed, [], COLD).outfit)) seen.add(id);
    for (const id of ["sandals-1", "shorts-1", "sneakers-1", "boots-1"]) expect(seen.has(id), id).toBe(true);
  });

  it("does not require a layer or tights just because it is freezing and wet", () => {
    const plain = [g("tee", "t_shirt"), g("skirt", "skirt"), g("sandals", "sandals"), g("jacket", "jacket"), g("tights", "tights")];
    const results = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) results.add(ids(outfitIds(idea(seed, [], COLD, plain).outfit)));
    // Some ideas have a jacket or tights, some do not: neither is forced.
    expect([...results].some((r) => r.includes("jacket"))).toBe(true);
    expect([...results].some((r) => !r.includes("jacket"))).toBe(true);
  });

  it("still never puts tights under jeans, or two layers on a dress", () => {
    for (let seed = 1; seed <= 80; seed++) {
      const o = idea(seed, [], COLD).outfit;
      if (o.tights) expect(o.bottom === undefined ? o.dress !== undefined : ["skirt-1", "shorts-1"].includes(o.bottom)).toBe(true);
    }
  });

  it("is unchanged for today's outfit: the weather still decides there", () => {
    const hot = ok(scoreOutfit(input(closet(), { weather: HOT })));
    const cold = ok(scoreOutfit(input(closet(), { weather: COLD, date: "2026-12-05" })));
    expect(hot.outfit).not.toEqual(cold.outfit);
    expect(hot.outfit.layer).toBeUndefined();
    expect(cold.outfit.layer).toBeDefined();
  });
});

describe("Style Swipe does not keep showing the same pieces", () => {
  it("changes from deck to deck: different seeds start with different ideas", () => {
    const first = new Set<string>();
    for (let seed = 1; seed <= 50; seed++) first.add(ids(outfitIds(idea(seed).outfit)));
    expect(first.size).toBeGreaterThan(8);
  });

  it("is repeatable for a seed", () => {
    expect(idea(42).outfit).toEqual(idea(42).outfit);
  });

  it("spreads a whole deck over the closet instead of cycling the same few pieces", () => {
    const shown: string[][] = [];
    const appearances = new Map<string, number>();
    for (let i = 0; i < 12; i++) {
      const outfit = idea(5, shown).outfit;
      const pieces = outfitIds(outfit);
      shown.push(pieces);
      for (const id of pieces) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    }
    const hoodieShare = (appearances.get("hoodie-1") ?? 0) / 12;
    expect(hoodieShare).toBeLessThanOrEqual(0.5);
    // Most of the closet shows up at least once in twelve ideas.
    expect(appearances.size).toBeGreaterThanOrEqual(10);
  });

  it("makes a piece that was just shown less likely to come back", () => {
    const first = idea(11);
    const used = outfitIds(first.outfit);
    const second = idea(11, [used]);
    const shared = outfitIds(second.outfit).filter((id) => used.includes(id));
    const sharedFirstTwo = outfitIds(idea(11).outfit).filter((id) => used.includes(id));
    expect(shared.length).toBeLessThan(sharedFirstTwo.length);
  });

  it("counts repeats only up to a limit, so a piece is never banned", () => {
    const only = [g("tee", "t_shirt"), g("jeans", "jeans"), g("sneakers", "sneakers")];
    const shown = Array.from({ length: 20 }, () => ["tee", "jeans", "sneakers"]);
    expect(ok(scoreOutfit(input(only, { explore: { seed: 1, shown: [] } }))).outfit).toMatchObject({ top: "tee" });
    // Even after being shown many times it is still the only idea, and it is not excluded by the penalty.
    expect(ok(scoreOutfit(input(only, { explore: { seed: 1, shown } }))).outfit).toMatchObject({ top: "tee" });
    expect(VARIETY_MAX_REPEATS).toBe(4);
    expect(VARIETY_REPEAT_PENALTY).toBeGreaterThan(0);
  });

  it("keeps the person's taste in charge: a strongly liked piece still comes up often", () => {
    const prefs = [{ tag: "type:hoodie", weight: 1 }, { tag: "color:gray", weight: 0.4 }];
    let hoodies = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const r = ok(scoreOutfit(input(closet(), { preferences: prefs, explore: { seed, shown: [] } })));
      if (outfitIds(r.outfit).includes("hoodie-1")) hoodies++;
    }
    expect(hoodies).toBeGreaterThan(10);
  });

  it("jitters deterministically between 0 and 1", () => {
    expect(jitterOf("a", 1)).toBe(jitterOf("a", 1));
    expect(jitterOf("a", 1)).not.toBe(jitterOf("a", 2));
    expect(jitterOf("a", 1)).not.toBe(jitterOf("b", 1));
    for (let i = 0; i < 200; i++) {
      const j = jitterOf(`garment-${i}`, i);
      expect(j).toBeGreaterThanOrEqual(0);
      expect(j).toBeLessThan(1);
    }
    expect(VARIETY_JITTER).toBe(0.2);
  });

  it("still skips an idea that was already judged", () => {
    const only = [g("tee", "t_shirt"), g("jeans", "jeans"), g("sneakers", "sneakers")];
    const r = scoreOutfit(input(only, { explore: { seed: 1, shown: [] }, excludedOutfits: [["tee", "jeans", "sneakers"]] }));
    expect(r.status).toBe("exhausted");
  });
});

describe("the explore request", () => {
  function deps(over: Partial<GenerateOutfitDeps> = {}) {
    const saved: unknown[] = [];
    const asked: number[] = [];
    const d: GenerateOutfitDeps = {
      getProfile: async () => ({ id: "u", household_id: null, name: "T", location: "Conway", quiz_preferences: null }),
      getOwnGarments: async () => closet(),
      getPreferences: async () => [],
      getWeather: async () => COLD,
      getSuggestionGarmentIds: async () => [],
      saveSuggestion: async (row) => (saved.push(row), "sug-1"),
      getRecentExploreGarmentIds: async (_u, limit) => (asked.push(limit), []),
      random: () => 0.25,
      ...over,
    };
    return { d, saved, asked };
  }

  it("asks for the recent ideas, only for Style Swipe", async () => {
    const { d, asked } = deps();
    await handleGenerateOutfit("u", { date: "2026-12-05", purpose: "explore" }, d);
    expect(asked).toEqual([RECENT_EXPLORE_IDEAS]);
    await handleGenerateOutfit("u", { date: "2026-12-05" }, d);
    expect(asked).toEqual([RECENT_EXPLORE_IDEAS]); // not for today's outfit
  });

  it("gives a different idea when the random number is different, and the same idea for the same one", async () => {
    const pick = async (random: number) => {
      const { d } = deps({ random: () => random });
      const r = await handleGenerateOutfit("u", { date: "2026-12-05", purpose: "explore" }, d);
      return r.ok && r.body.status === "ok" ? outfitIds(r.body.outfit).join(",") : "";
    };
    const results = new Set<string>();
    for (const r of [0.01, 0.2, 0.4, 0.6, 0.8, 0.99]) results.add(await pick(r));
    expect(results.size).toBeGreaterThan(1);
    expect(await pick(0.3)).toBe(await pick(0.3));
  });

  it("avoids pieces from recent ideas of earlier decks", async () => {
    const baseline = deps({ random: () => 0.5 });
    const first = await handleGenerateOutfit("u", { date: "2026-12-05", purpose: "explore" }, baseline.d);
    const usedBefore = first.ok && first.body.status === "ok" ? outfitIds(first.body.outfit) : [];
    const { d } = deps({ random: () => 0.5, getRecentExploreGarmentIds: async () => [usedBefore, usedBefore, usedBefore] });
    const second = await handleGenerateOutfit("u", { date: "2026-12-05", purpose: "explore" }, d);
    const usedNow = second.ok && second.body.status === "ok" ? outfitIds(second.body.outfit) : [];
    expect(usedNow.filter((id) => usedBefore.includes(id)).length).toBeLessThan(usedBefore.length);
  });

  it("works with a backend that cannot list recent ideas, and uses Math.random when none is given", async () => {
    const { d } = deps({ getRecentExploreGarmentIds: undefined, random: undefined });
    expect(await handleGenerateOutfit("u", { date: "2026-12-05", purpose: "explore" }, d)).toMatchObject({ ok: true, body: { status: "ok" } });
  });
});

describe("an idea should not look like the one before it", () => {
  it("only objects when most of the pieces are the same, and more the newer the earlier outfit is", () => {
    expect(similarityPenalty(["a", "b", "c"], [])).toBe(0);
    expect(similarityPenalty(["a", "b", "c"], [["x", "y", "z"]])).toBe(0);
    // One piece in common: fine, a small cost.
    expect(similarityPenalty(["a", "b", "c"], [["a", "y", "z"]])).toBeCloseTo(OVERLAP_PENALTY, 10);
    // Two of three the same: "the same outfit with one swap".
    expect(similarityPenalty(["a", "b", "c"], [["a", "b", "z"]])).toBeCloseTo(SIMILAR_PENALTY + 2 * OVERLAP_PENALTY, 10);
    // An older outfit never triggers the big penalty, only the small one, and counts less.
    expect(similarityPenalty(["a", "b", "c"], [["x", "y", "z"], ["a", "b", "z"]])).toBeCloseTo(2 * OVERLAP_PENALTY * RECENT_WEIGHTS[1], 10);
    expect(similarityPenalty(["a", "b", "c"], [["x"], ["y"], ["z"], ["a", "b", "c"]])).toBe(0); // only the last three count
  });

  it("asks for at least half of the pieces to differ, for outfits of any size", () => {
    expect(similarityPenalty(["a", "b"], [["a", "z"]])).toBeLessThan(SIMILAR_PENALTY); // 1 of 2 differs, 1 is needed: fine
    expect(similarityPenalty(["a", "b", "c", "d"], [["a", "b", "x", "y"]])).toBeLessThan(SIMILAR_PENALTY); // 2 of 4 differ: enough
    expect(similarityPenalty(["a", "b", "c", "d"], [["a", "b", "c", "y"]])).toBeGreaterThanOrEqual(SIMILAR_PENALTY);
  });

  it("gives an idea that shares at most one piece with the previous one, deck after deck", () => {
    const shown: string[][] = [];
    for (let i = 0; i < 15; i++) {
      const outfit = outfitIds(ok(scoreOutfit(input(closet(), { explore: { seed: 9, shown }, recent: [...shown].reverse().slice(0, 3) }))).outfit);
      const previous = shown[shown.length - 1];
      if (previous) expect(outfit.filter((id) => previous.includes(id)).length).toBeLessThanOrEqual(1);
      shown.push(outfit);
    }
  });

  it("makes a re-roll look different from the outfit that was just rejected, weather still deciding", () => {
    const first = ok(scoreOutfit(input(closet(), { weather: COLD, date: "2026-12-05" })));
    const rejected = outfitIds(first.outfit);
    const second = ok(scoreOutfit(input(closet(), { weather: COLD, date: "2026-12-05", excludedOutfits: [rejected], recent: [rejected] })));
    const shared = outfitIds(second.outfit).filter((id) => rejected.includes(id));
    expect(shared.length).toBeLessThanOrEqual(Math.floor(rejected.length / 2));
    expect(second.outfit.layer).toBeDefined(); // it is still freezing and wet
  });

  it("still answers when the closet is too small to be different", () => {
    const tiny = [g("tee", "t_shirt"), g("jeans", "jeans"), g("sneakers", "sneakers"), g("tee-2", "t_shirt")];
    const r = ok(scoreOutfit(input(tiny, { explore: { seed: 1, shown: [] }, recent: [["tee", "jeans", "sneakers"]], excludedOutfits: [["tee", "jeans", "sneakers"]] })));
    expect(outfitIds(r.outfit)).toContain("tee-2");
  });

  it("is told about the recent outfits by the request: the rejected ones, newest first", async () => {
    const rejectedA = ["tee-1", "jeans-1", "sneakers-1"];
    const rejectedB = ["tee-2", "shorts-1", "sandals-1"];
    const d: GenerateOutfitDeps = {
      getProfile: async () => ({ id: "u", household_id: null, name: "T", location: "Conway", quiz_preferences: null }),
      getOwnGarments: async () => closet(),
      getPreferences: async () => [],
      getWeather: async () => HOT,
      getSuggestionGarmentIds: async () => [rejectedA, rejectedB],
      saveSuggestion: async () => "sug",
    };
    const result = await handleGenerateOutfit("u", { date: "2026-07-05", exclude_suggestion_ids: ["a", "b"] }, d);
    expect(result).toMatchObject({ ok: true, body: { status: "ok" } });
    if (result.ok && result.body.status === "ok") {
      const picked = outfitIds(result.body.outfit);
      // The newest rejected outfit (B) is the one it must not copy.
      expect(picked.filter((id) => rejectedB.includes(id)).length).toBeLessThanOrEqual(1);
    }
  });
});
