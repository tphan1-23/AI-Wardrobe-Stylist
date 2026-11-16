// Several colors and several seasons per garment (D26): the list rules, the picker, labels, scoring and learning.
import { describe, expect, it } from "vitest";
import {
  MAX_COLORS,
  isColorList,
  isSeasonList,
  normalizeSeasons,
} from "../supabase/functions/_shared/tag-schema.ts";
import { applyFeedback } from "../supabase/functions/_shared/preferences.ts";
import { garmentTags, scoreOutfit, type OutfitInput } from "../supabase/functions/_shared/scoring.ts";
import type { Garment, WeatherSnapshot } from "../supabase/functions/_shared/types.ts";
import {
  colorsLabel,
  emptyDraft,
  garmentDetail,
  garmentName,
  missingFields,
  seasonsLabel,
  setField,
  toggleColor,
  toggleSeason,
} from "../frontend/src/services/garment.ts";
import { reviewFromAnalysis, setTag } from "../frontend/src/services/add.ts";

describe("color and season lists", () => {
  it("accepts 1 to 3 different colors only", () => {
    expect(isColorList(["red"])).toBe(true);
    expect(isColorList(["red", "blue", "green"])).toBe(true);
    expect(MAX_COLORS).toBe(3);
    expect(isColorList([])).toBe(false);
    expect(isColorList(["red", "blue", "green", "pink"])).toBe(false);
    expect(isColorList(["red", "red"])).toBe(false);
    expect(isColorList(["chartreuse"])).toBe(false);
    expect(isColorList("red")).toBe(false);
  });

  it('accepts ["all"] alone, or up to three different single seasons', () => {
    expect(isSeasonList(["all"])).toBe(true);
    expect(isSeasonList(["spring", "fall"])).toBe(true);
    expect(isSeasonList(["spring", "summer", "fall"])).toBe(true);
    expect(isSeasonList(["all", "winter"])).toBe(false);
    expect(isSeasonList(["spring", "summer", "fall", "winter"])).toBe(false); // that is "all"
    expect(isSeasonList(["winter", "winter"])).toBe(false);
    expect(isSeasonList([])).toBe(false);
    expect(isSeasonList(["monsoon"])).toBe(false);
  });

  it("normalizes any season list to its one canonical form", () => {
    expect(normalizeSeasons(["fall", "spring"])).toEqual(["spring", "fall"]);
    expect(normalizeSeasons(["all", "winter"])).toEqual(["all"]);
    expect(normalizeSeasons(["winter", "fall", "summer", "spring"])).toEqual(["all"]);
    expect(normalizeSeasons(["summer", "summer"])).toEqual(["summer"]);
    expect(normalizeSeasons([])).toEqual([]);
  });
});

describe("the color and season picker", () => {
  it("adds colors in the order they are tapped (the first is the main one) and removes them again", () => {
    let colors = toggleColor(null, "black");
    colors = toggleColor(colors, "white");
    expect(colors).toEqual(["black", "white"]);
    expect(toggleColor(colors, "black")).toEqual(["white"]); // the next one becomes the main color
    expect(toggleColor(["white"], "white")).toEqual([]);
  });

  it("ignores a fourth color instead of replacing one", () => {
    expect(toggleColor(["red", "blue", "green"], "pink")).toEqual(["red", "blue", "green"]);
  });

  it('keeps "All seasons" alone, and four single seasons become "All seasons"', () => {
    expect(toggleSeason(null, "summer")).toEqual(["summer"]);
    expect(toggleSeason(["summer"], "fall")).toEqual(["summer", "fall"]);
    expect(toggleSeason(["summer", "fall"], "all")).toEqual(["all"]);
    expect(toggleSeason(["all"], "winter")).toEqual(["winter"]);
    expect(toggleSeason(["all"], "all")).toEqual([]);
    expect(toggleSeason(["spring", "summer", "fall"], "winter")).toEqual(["all"]);
    expect(toggleSeason(["summer"], "summer")).toEqual([]);
  });

  it("treats an emptied list as not chosen, so the field is asked for again", () => {
    const draft = setField({ ...emptyDraft(), colors: ["red"] }, "colors", []);
    expect(draft.colors).toBeNull();
    expect(missingFields(draft)).toContain("colors");
  });
});

describe("labels", () => {
  it("lists colors in words, main color first", () => {
    expect(colorsLabel(["black"])).toBe("Black");
    expect(colorsLabel(["black", "white"])).toBe("Black and white");
    expect(colorsLabel(["black", "white", "pink"])).toBe("Black, white and pink");
  });

  it("names and describes a garment with several colors and seasons", () => {
    expect(garmentName({ colors: ["red", "white"], type: "t_shirt" })).toBe("Red and white t-shirt");
    expect(seasonsLabel(["spring", "fall"])).toBe("Spring, Fall");
    expect(garmentDetail({ seasons: ["spring", "fall"], warmth: 2 })).toBe("Spring, Fall · Light");
  });
});

describe("review state", () => {
  const analysis = (tags: object) => ({ tags, confidence: {}, needs_review: [], warnings: [] }) as never;

  it("drops a color or season list that breaks the rules and asks for it again", () => {
    const state = reviewFromAnalysis("u/p.jpg", analysis({ type: "jeans", colors: ["red", "red"], seasons: ["all", "winter"], warmth: 3 }));
    expect(state.tags).toEqual({ type: "jeans", warmth: 3 });
    expect(state.needsReview).toEqual(["colors", "seasons"]);
  });

  it("refuses a list that is not valid when a person sets it", () => {
    const state = reviewFromAnalysis("u/p.jpg", analysis({ type: "jeans", colors: ["red"], seasons: ["all"], warmth: 3 }));
    expect(setTag(state, "colors", ["red", "blue", "green", "pink"])).toBe(state);
    expect(setTag(state, "seasons", ["all", "winter"])).toBe(state);
    expect(setTag(state, "colors", ["red", "blue"]).tags.colors).toEqual(["red", "blue"]);
  });
});

// ---- Scoring and learning ----------------------------------------------------

let counter = 0;
const garment = (overrides: Partial<Garment> = {}): Garment => ({
  id: `m-${++counter}`,
  owner_id: "u1",
  image_path: "u1/x.jpg",
  type: "t_shirt",
  colors: ["black"],
  seasons: ["all"],
  warmth: 2,
  status: "clean",
  last_worn_date: null,
  ...overrides,
});
const MILD: WeatherSnapshot = { temp_c: 18, feels_like_c: 18, is_precipitating: false };
const input = (garments: Garment[], overrides: Partial<OutfitInput> = {}): OutfitInput => ({
  garments,
  weather: MILD,
  preferences: [],
  tempComfort: "neutral",
  date: "2026-10-05",
  ...overrides,
});

describe("scoring with several colors and seasons", () => {
  it("makes one color tag per color and one season tag per season", () => {
    expect(garmentTags({ type: "shirt", colors: ["black", "white"], seasons: ["spring", "fall"] })).toEqual([
      "type:shirt",
      "color:black",
      "color:white",
      "season:spring",
      "season:fall",
    ]);
  });

  it("treats a garment as in season when any of its seasons is the current one", () => {
    const closet = [
      garment({ id: "winter-spring-tee", seasons: ["spring", "winter"] }), // it is fall: not in season
      garment({ id: "fall-summer-tee", seasons: ["summer", "fall"] }), // in season
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const result = scoreOutfit(input(closet, { date: "2026-10-05" }));
    expect(result.status === "ok" && result.outfit.top).toBe("fall-summer-tee");
  });

  it("likes a garment when any of its colors is liked, and dislikes it when one is disliked", () => {
    const closet = [
      garment({ id: "plain-tee", colors: ["gray"] }),
      garment({ id: "red-white-tee", colors: ["white", "red"] }),
      garment({ id: "bottom", type: "jeans" }),
      garment({ id: "shoes", type: "sneakers" }),
    ];
    const likesRed = scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: 1 }] }));
    expect(likesRed.status === "ok" && likesRed.outfit.top).toBe("red-white-tee");
    const avoidsRed = scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: -1 }] }));
    expect(avoidsRed.status === "ok" && avoidsRed.outfit.top).toBe("plain-tee");
  });

  it("names the main color in the reasoning", () => {
    const closet = [garment({ colors: ["navy", "white"] }), garment({ type: "jeans" }), garment({ type: "sneakers" })];
    const result = scoreOutfit(input(closet));
    expect(result.status === "ok" && result.reasoning).toContain("navy t shirt");
  });
});

describe("learning from feedback with several colors", () => {
  it("learns every color of the garment once, and never the seasons", () => {
    const shirt = garment({ type: "shirt", colors: ["black", "white"], seasons: ["spring", "fall"] });
    const up = applyFeedback([], [shirt], "up");
    expect(up.map((e) => e.tag).sort()).toEqual(["color:black", "color:white", "type:shirt"]);
  });
});
