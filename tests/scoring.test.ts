import { describe, expect, it } from "vitest";
import {
  REPEAT_WINDOW_DAYS,
  daysBetween,
  garmentTags,
  scoreOutfit,
  seasonOf,
  targetWarmth,
  type OutfitInput,
} from "../supabase/functions/_shared/scoring.ts";
import { COLORS, GARMENT_TYPES, SEASONS, slotForType } from "../supabase/functions/_shared/tag-schema.ts";
import type { Garment, WeatherSnapshot } from "../supabase/functions/_shared/types.ts";

let counter = 0;
function garment(overrides: Partial<Garment> = {}): Garment {
  counter += 1;
  return {
    id: `g-${String(counter).padStart(4, "0")}`,
    household_id: "h1",
    added_by: "u1",
    image_path: "h1/x.jpg",
    type: "t_shirt",
    color: "black",
    season: "all",
    warmth: 2,
    status: "clean",
    last_worn_date: null,
    ...overrides,
  };
}

const MILD: WeatherSnapshot = { temp_c: 18, feels_like_c: 18, is_precipitating: false };
const COLD: WeatherSnapshot = { temp_c: 2, feels_like_c: -1, is_precipitating: false };
const HOT: WeatherSnapshot = { temp_c: 33, feels_like_c: 35, is_precipitating: false };

function input(garments: Garment[], overrides: Partial<OutfitInput> = {}): OutfitInput {
  return { garments, weather: MILD, preferences: [], tempComfort: "neutral", date: "2026-10-05", ...overrides };
}

const basicCloset = () => [
  garment({ id: "top-a", type: "t_shirt" }),
  garment({ id: "bottom-a", type: "jeans" }),
  garment({ id: "shoes-a", type: "sneakers" }),
];

describe("helpers", () => {
  it("maps feels-like temperature to a warmth target", () => {
    expect(targetWarmth({ ...MILD, feels_like_c: -5 }, "neutral")).toBe(5);
    expect(targetWarmth({ ...MILD, feels_like_c: 5 }, "neutral")).toBe(4);
    expect(targetWarmth({ ...MILD, feels_like_c: 12 }, "neutral")).toBe(3);
    expect(targetWarmth({ ...MILD, feels_like_c: 20 }, "neutral")).toBe(2);
    expect(targetWarmth({ ...MILD, feels_like_c: 30 }, "neutral")).toBe(1);
  });

  it("shifts the target for people who run cold or hot", () => {
    const w = { ...MILD, feels_like_c: 18 };
    expect(targetWarmth(w, "neutral")).toBe(2);
    expect(targetWarmth(w, "runs_cold")).toBe(3);
    expect(targetWarmth(w, "runs_hot")).toBe(2);
    expect(targetWarmth({ ...w, feels_like_c: 22 }, "runs_hot")).toBe(1);
  });

  it("derives the season and day gaps from ISO dates", () => {
    expect(seasonOf("2026-01-15")).toBe("winter");
    expect(seasonOf("2026-12-01")).toBe("winter");
    expect(seasonOf("2026-04-10")).toBe("spring");
    expect(seasonOf("2026-07-04")).toBe("summer");
    expect(seasonOf("2026-10-05")).toBe("fall");
    expect(daysBetween("2026-10-01", "2026-10-05")).toBe(4);
    expect(daysBetween("2026-02-27", "2026-03-02")).toBe(3);
  });

  it("lists namespaced preference tags for a garment", () => {
    expect(garmentTags({ type: "jeans", color: "navy", season: "all" })).toEqual([
      "type:jeans",
      "color:navy",
      "season:all",
    ]);
  });
});

describe("scoreOutfit", () => {
  it("returns top, bottom and shoes from the clean closet", () => {
    const result = scoreOutfit(input(basicCloset()));
    expect(result).toMatchObject({ status: "ok", outfit: { top: "top-a", bottom: "bottom-a", shoes: "shoes-a" } });
    if (result.status === "ok") expect(result.reasoning.length).toBeGreaterThan(0);
  });

  it("never suggests dirty items", () => {
    const closet = [...basicCloset(), garment({ id: "top-dirty", type: "shirt", status: "dirty" })];
    const result = scoreOutfit(input(closet, { weather: MILD }));
    expect(result.status === "ok" && result.outfit.top).toBe("top-a");
  });

  it("reports missing slots instead of inventing an outfit", () => {
    const closet = [garment({ type: "t_shirt" }), garment({ type: "jeans", status: "dirty" })];
    const result = scoreOutfit(input(closet));
    expect(result).toMatchObject({ status: "incomplete", missing_slots: ["bottom", "shoes"] });
  });

  it("ignores items in the 'other' slot such as jackets and dresses", () => {
    const closet = [...basicCloset(), garment({ id: "dress", type: "dress" })];
    const result = scoreOutfit(input(closet));
    if (result.status !== "ok") throw new Error("expected ok");
    expect(Object.values(result.outfit)).not.toContain("dress");
  });

  it("picks warm clothes when it is cold", () => {
    const closet = [
      garment({ id: "tee", type: "t_shirt", warmth: 1 }),
      garment({ id: "sweater", type: "sweater", warmth: 4 }),
      garment({ id: "shorts", type: "shorts", warmth: 1 }),
      garment({ id: "jeans", type: "jeans", warmth: 4 }),
      garment({ id: "sneakers", type: "sneakers", warmth: 2 }),
      garment({ id: "boots", type: "boots", warmth: 5 }),
    ];
    const result = scoreOutfit(input(closet, { weather: COLD }));
    expect(result).toMatchObject({ status: "ok", outfit: { top: "sweater", bottom: "jeans", shoes: "boots" } });
  });

  it("picks light clothes when it is hot", () => {
    const closet = [
      garment({ id: "tee", type: "t_shirt", warmth: 1 }),
      garment({ id: "sweater", type: "sweater", warmth: 4 }),
      garment({ id: "shorts", type: "shorts", warmth: 1 }),
      garment({ id: "jeans", type: "jeans", warmth: 4 }),
      garment({ id: "sandals", type: "sandals", warmth: 1 }),
    ];
    const result = scoreOutfit(input(closet, { weather: HOT }));
    expect(result).toMatchObject({ status: "ok", outfit: { top: "tee", bottom: "shorts", shoes: "sandals" } });
  });

  it("avoids sandals in the rain", () => {
    const closet = [
      garment({ id: "top", type: "t_shirt" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "sandals", type: "sandals", warmth: 2 }),
      garment({ id: "sneakers", type: "sneakers", warmth: 2 }),
    ];
    const rainy = { ...MILD, is_precipitating: true };
    const result = scoreOutfit(input(closet, { weather: rainy }));
    expect(result.status === "ok" && result.outfit.shoes).toBe("sneakers");
    expect(result.status === "ok" && result.reasoning).toContain("wet");
  });

  it("prefers items that suit the current season", () => {
    const closet = [
      garment({ id: "summer-tee", type: "t_shirt", season: "summer" }),
      garment({ id: "fall-tee", type: "t_shirt", season: "fall" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const result = scoreOutfit(input(closet, { date: "2026-10-05" }));
    expect(result.status === "ok" && result.outfit.top).toBe("fall-tee");
  });

  it("penalizes recently worn items and forgives old wears", () => {
    const closet = [
      garment({ id: "tee-recent", type: "t_shirt", last_worn_date: "2026-10-04" }),
      garment({ id: "tee-old", type: "t_shirt", last_worn_date: "2026-09-01" }),
      garment({ id: "tee-never", type: "t_shirt", last_worn_date: null }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const first = scoreOutfit(input(closet));
    expect(first.status === "ok" && first.outfit.top).toBe("tee-never");
    const withoutNever = closet.filter((g) => g.id !== "tee-never");
    const second = scoreOutfit(input(withoutNever));
    expect(second.status === "ok" && second.outfit.top).toBe("tee-old");
  });

  it("penalizes an item worn today most, and stops penalizing after the repeat window", () => {
    const outsideWindow = `2026-09-${String(30 - REPEAT_WINDOW_DAYS)}`; // 5 Oct minus (window + 5) days
    const closet = [
      garment({ id: "a-worn-today", type: "t_shirt", last_worn_date: "2026-10-05" }),
      garment({ id: "z-outside-window", type: "t_shirt", last_worn_date: outsideWindow }),
      garment({ type: "jeans" }),
      garment({ type: "sneakers" }),
    ];
    expect(daysBetween(outsideWindow, "2026-10-05")).toBeGreaterThan(REPEAT_WINDOW_DAYS);
    const result = scoreOutfit(input(closet));
    // "a-worn-today" would win the id tie-break, so only the penalty can explain the choice.
    expect(result.status === "ok" && result.outfit.top).toBe("z-outside-window");
  });

  it("favors liked tags and avoids disliked ones", () => {
    const closet = [
      garment({ id: "red-tee", type: "t_shirt", color: "red" }),
      garment({ id: "blue-tee", type: "t_shirt", color: "blue" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const likesRed = scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: 1 }] }));
    expect(likesRed.status === "ok" && likesRed.outfit.top).toBe("red-tee");
    if (likesRed.status === "ok") expect(likesRed.reasoning).toContain("preferences");
    const avoidsRed = scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: -1 }] }));
    expect(avoidsRed.status === "ok" && avoidsRed.outfit.top).toBe("blue-tee");
  });

  it("keeps avoiding a strongly disliked item even when it is the freshest option", () => {
    const closet = [
      garment({ id: "red-fresh", type: "t_shirt", color: "red", last_worn_date: null }),
      garment({ id: "blue-worn", type: "t_shirt", color: "blue", last_worn_date: "2026-10-04" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const result = scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: -0.95 }] }));
    expect(result.status === "ok" && result.outfit.top).toBe("blue-worn");
  });

  it("does not let preferences override clear weather mismatches", () => {
    const closet = [
      garment({ id: "loved-tee", type: "t_shirt", color: "red", warmth: 1 }),
      garment({ id: "sweater", type: "sweater", color: "gray", warmth: 4 }),
      garment({ id: "jeans", type: "jeans", warmth: 4 }),
      garment({ id: "boots", type: "boots", warmth: 5 }),
    ];
    const prefs = [{ tag: "color:red", weight: 1 }];
    const result = scoreOutfit(input(closet, { weather: COLD, preferences: prefs }));
    expect(result.status === "ok" && result.outfit.top).toBe("sweater");
  });

  it("returns a different outfit on re-roll and exhausts when nothing is left", () => {
    const closet = [
      garment({ id: "top-1", type: "t_shirt" }),
      garment({ id: "top-2", type: "shirt" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const first = scoreOutfit(input(closet));
    if (first.status !== "ok") throw new Error("expected ok");
    const rejected = [Object.values(first.outfit)];
    const second = scoreOutfit(input(closet, { excludedOutfits: rejected }));
    if (second.status !== "ok") throw new Error("expected ok");
    expect(second.outfit).not.toEqual(first.outfit);
    const third = scoreOutfit(input(closet, { excludedOutfits: [...rejected, Object.values(second.outfit)] }));
    expect(third.status).toBe("exhausted");
  });

  it("is deterministic and breaks ties by id", () => {
    const closet = [
      garment({ id: "b-top", type: "t_shirt" }),
      garment({ id: "a-top", type: "t_shirt" }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const a = scoreOutfit(input(closet));
    const b = scoreOutfit(input([...closet].reverse()));
    expect(a).toEqual(b);
    expect(a.status === "ok" && a.outfit.top).toBe("a-top");
  });

  it("handles a large closet by considering only the top candidates per slot", () => {
    const closet = Array.from({ length: 40 }, (_, i) => [
      garment({ id: `t${i}`, type: "t_shirt" }),
      garment({ id: `b${i}`, type: "jeans" }),
      garment({ id: `s${i}`, type: "sneakers" }),
    ]).flat();
    expect(scoreOutfit(input(closet)).status).toBe("ok");
  });
});

// Seeded PRNG so failures are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("scoreOutfit invariants (random closets)", () => {
  it("only ever returns clean items, one per slot, never an excluded outfit", () => {
    const rand = mulberry32(42);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    for (let run = 0; run < 300; run++) {
      const closet = Array.from({ length: Math.floor(rand() * 25) }, () =>
        garment({
          type: pick(GARMENT_TYPES),
          color: pick(COLORS),
          season: pick(SEASONS),
          warmth: pick([1, 2, 3, 4, 5] as const),
          status: rand() < 0.3 ? "dirty" : "clean",
          last_worn_date: rand() < 0.5 ? null : `2026-09-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
        }),
      );
      const weather = { temp_c: rand() * 40 - 5, feels_like_c: rand() * 40 - 5, is_precipitating: rand() < 0.3 };
      const result = scoreOutfit(input(closet, { weather, tempComfort: pick(["runs_cold", "neutral", "runs_hot"] as const) }));
      if (result.status !== "ok") continue;
      const byId = new Map(closet.map((g) => [g.id, g]));
      const top = byId.get(result.outfit.top)!;
      const bottom = byId.get(result.outfit.bottom)!;
      const shoes = byId.get(result.outfit.shoes)!;
      expect([top.status, bottom.status, shoes.status]).toEqual(["clean", "clean", "clean"]);
      expect([slotForType(top.type), slotForType(bottom.type), slotForType(shoes.type)]).toEqual(["top", "bottom", "shoes"]);
      const again = scoreOutfit(input(closet, { weather, excludedOutfits: [Object.values(result.outfit)] }));
      if (again.status === "ok") expect(again.outfit).not.toEqual(result.outfit);
    }
  });
});
