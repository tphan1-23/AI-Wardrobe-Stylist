import { describe, expect, it } from "vitest";
import {
  COLOR_WEIGHT,
  LEARNING_RATE,
  OCCASION_TYPES,
  STYLE_TYPES,
  STYLE_WEIGHT,
  applyFeedback,
  quizToPreferences,
} from "../supabase/functions/_shared/preferences.ts";
import { scoreOutfit } from "../supabase/functions/_shared/scoring.ts";
import { GARMENT_TYPES } from "../supabase/functions/_shared/tag-schema.ts";
import type { Garment, PreferenceEntry, QuizAnswers } from "../supabase/functions/_shared/types.ts";

const emptyQuiz: QuizAnswers = {
  style_vibes: [],
  temp_comfort: "neutral",
  occasions: [],
  favorite_colors: [],
  avoided_colors: [],
};
const weightOf = (entries: PreferenceEntry[], tag: string) => entries.find((e) => e.tag === tag)?.weight;

let n = 0;
function garment(overrides: Partial<Garment> = {}): Garment {
  n += 1;
  return {
    id: `p-${String(n).padStart(3, "0")}`, household_id: "h", added_by: "u", image_path: "h/x.jpg",
    type: "t_shirt", color: "black", season: "all", warmth: 2, status: "clean", last_worn_date: null,
    ...overrides,
  };
}

describe("quizToPreferences", () => {
  it("returns nothing for an empty quiz", () => {
    expect(quizToPreferences(emptyQuiz)).toEqual([]);
  });

  it("maps favorite and avoided colors to color tags", () => {
    const prefs = quizToPreferences({ ...emptyQuiz, favorite_colors: ["blue"], avoided_colors: ["red"] });
    expect(weightOf(prefs, "color:blue")).toBe(COLOR_WEIGHT);
    expect(weightOf(prefs, "color:red")).toBe(-COLOR_WEIGHT);
  });

  it("lets avoiding a color beat liking it", () => {
    const prefs = quizToPreferences({ ...emptyQuiz, favorite_colors: ["red"], avoided_colors: ["red"] });
    expect(weightOf(prefs, "color:red")).toBe(-COLOR_WEIGHT);
  });

  it("turns style vibes into affinity for the matching garment types", () => {
    const prefs = quizToPreferences({ ...emptyQuiz, style_vibes: ["sporty"] });
    for (const type of STYLE_TYPES.sporty) expect(weightOf(prefs, `type:${type}`)).toBe(STYLE_WEIGHT);
    expect(weightOf(prefs, "type:dress_shoes")).toBeUndefined();
  });

  it("adds occasion affinity on top of style and caps weights at 1", () => {
    const all = quizToPreferences({
      ...emptyQuiz,
      style_vibes: ["casual", "streetwear", "sporty"],
      occasions: ["school", "gym", "home"],
    });
    expect(weightOf(all, "type:sneakers")).toBeCloseTo(1, 5); // 0.4*3 + 0.2*2 would exceed 1
    for (const e of all) expect(Math.abs(e.weight)).toBeLessThanOrEqual(1);
  });

  it("ignores duplicate answers and returns a stable order", () => {
    const once = quizToPreferences({ ...emptyQuiz, style_vibes: ["formal"], favorite_colors: ["navy"] });
    const twice = quizToPreferences({
      ...emptyQuiz,
      style_vibes: ["formal", "formal"],
      favorite_colors: ["navy", "navy"],
    });
    expect(twice).toEqual(once);
    expect(once.map((e) => e.tag)).toEqual([...once.map((e) => e.tag)].sort());
  });

  it("only references real garment types", () => {
    const known = new Set<string>(GARMENT_TYPES);
    for (const types of [...Object.values(STYLE_TYPES), ...Object.values(OCCASION_TYPES)]) {
      for (const t of types) expect(known.has(t)).toBe(true);
    }
  });
});

describe("applyFeedback", () => {
  const outfit = [
    garment({ type: "t_shirt", color: "blue" }),
    garment({ type: "jeans", color: "blue" }),
    garment({ type: "sneakers", color: "white" }),
  ];

  it("raises type and color weights on thumbs up and lowers them on thumbs down", () => {
    const up = applyFeedback([], outfit, "up");
    expect(weightOf(up, "type:jeans")).toBeCloseTo(LEARNING_RATE, 5);
    expect(weightOf(up, "color:white")).toBeCloseTo(LEARNING_RATE, 5);
    const down = applyFeedback([], outfit, "down");
    expect(weightOf(down, "type:jeans")).toBeCloseTo(-LEARNING_RATE, 5);
  });

  it("updates a shared color once, not once per item, and skips season tags", () => {
    const up = applyFeedback([], outfit, "up");
    expect(up.filter((e) => e.tag === "color:blue")).toHaveLength(1);
    expect(weightOf(up, "color:blue")).toBeCloseTo(LEARNING_RATE, 5);
    expect(up.some((e) => e.tag.startsWith("season:"))).toBe(false);
  });

  it("builds on existing weights and does not mutate the input", () => {
    const current = [{ tag: "color:blue", weight: 0.5 }];
    const snapshot = structuredClone(current);
    const up = applyFeedback(current, outfit, "up");
    expect(weightOf(up, "color:blue")).toBeCloseTo(0.5 + LEARNING_RATE * 0.5, 5);
    expect(current).toEqual(snapshot);
  });

  it("returns only the touched tags, sorted", () => {
    const up = applyFeedback([{ tag: "color:red", weight: 0.7 }], outfit, "up");
    expect(up.some((e) => e.tag === "color:red")).toBe(false);
    expect(up.map((e) => e.tag)).toEqual([...up.map((e) => e.tag)].sort());
  });

  it("keeps weights strictly inside (-1, 1) under repeated feedback", () => {
    let prefs: PreferenceEntry[] = [];
    const merge = (updates: PreferenceEntry[]) => {
      const m = new Map(prefs.map((p) => [p.tag, p.weight]));
      for (const u of updates) m.set(u.tag, u.weight);
      prefs = [...m].map(([tag, weight]) => ({ tag, weight }));
    };
    for (let i = 0; i < 500; i++) merge(applyFeedback(prefs, outfit, "up"));
    for (const p of prefs) expect(p.weight).toBeLessThan(1);
    for (let i = 0; i < 1000; i++) merge(applyFeedback(prefs, outfit, "down"));
    for (const p of prefs) expect(p.weight).toBeGreaterThan(-1);
  });

  it("returns nothing for an empty suggestion", () => {
    expect(applyFeedback([{ tag: "color:red", weight: 0.3 }], [], "up")).toEqual([]);
  });
});

describe("end to end: a simulated user teaches the engine", () => {
  // Hidden taste: hates red, otherwise happy. Uses the real scoring engine.
  it("suggests fewer disliked outfits as feedback accumulates", () => {
    const closet: Garment[] = [
      garment({ id: "t-red", type: "t_shirt", color: "red" }),
      garment({ id: "t-blue", type: "t_shirt", color: "blue" }),
      garment({ id: "t-white", type: "t_shirt", color: "white" }),
      garment({ id: "t-gray", type: "t_shirt", color: "gray" }),
      garment({ id: "b-red", type: "jeans", color: "red" }),
      garment({ id: "b-navy", type: "jeans", color: "navy" }),
      garment({ id: "b-black", type: "jeans", color: "black" }),
      garment({ id: "s-white", type: "sneakers", color: "white" }),
      garment({ id: "s-black", type: "sneakers", color: "black" }),
    ];
    // Start with a mild *positive* lean towards red so it must be unlearned.
    let prefs: PreferenceEntry[] = [{ tag: "color:red", weight: 0.3 }];
    const byId = new Map(closet.map((g) => [g.id, g]));
    const mild = { temp_c: 18, feels_like_c: 18, is_precipitating: false };
    const dislikes = (g: Garment[]) => g.some((x) => x.color === "red");

    let dislikedFirstHalf = 0;
    let dislikedSecondHalf = 0;
    let wornCounts = new Map<string, number>();
    for (let day = 0; day < 30; day++) {
      const date = `2026-10-${String(day + 1).padStart(2, "0")}`;
      const excluded: string[][] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const result = scoreOutfit({
          garments: closet, weather: mild, preferences: prefs, tempComfort: "neutral", date, excludedOutfits: excluded,
        });
        if (result.status !== "ok") break;
        const ids = Object.values(result.outfit);
        const items = ids.map((id) => byId.get(id)!);
        const bad = dislikes(items);
        prefs = mergeUpdates(prefs, applyFeedback(prefs, items, bad ? "down" : "up"));
        if (bad) {
          if (day < 15) dislikedFirstHalf++; else dislikedSecondHalf++;
          excluded.push(ids);
          continue;
        }
        for (const id of ids) {
          byId.get(id)!.last_worn_date = date;
          wornCounts.set(id, (wornCounts.get(id) ?? 0) + 1);
        }
        break;
      }
    }
    expect(weightOf(prefs, "color:red")!).toBeLessThan(0);
    expect(dislikedSecondHalf).toBeLessThan(dislikedFirstHalf);
    expect(dislikedSecondHalf).toBeLessThanOrEqual(1);
    // No collapse: the liked tops all get rotated in.
    const topsWorn = ["t-blue", "t-white", "t-gray"].filter((id) => (wornCounts.get(id) ?? 0) > 0);
    expect(topsWorn.length).toBeGreaterThanOrEqual(2);
  });
});

function mergeUpdates(prefs: PreferenceEntry[], updates: PreferenceEntry[]): PreferenceEntry[] {
  const m = new Map(prefs.map((p) => [p.tag, p.weight]));
  for (const u of updates) m.set(u.tag, u.weight);
  return [...m].map(([tag, weight]) => ({ tag, weight }));
}
