import { describe, expect, it } from "vitest";
import {
  COLOR_OPTIONS,
  FIELD_LABELS,
  SEASON_LABELS,
  SEASON_OPTIONS,
  TAG_FIELDS,
  TYPE_GROUPS,
  TYPE_LABELS,
  WARMTH_LABELS,
  WARMTH_OPTIONS,
  chooseValue,
  colorLabel,
  confirmField,
  draftFromTags,
  emptyDraft,
  garmentDetail,
  garmentName,
  isComplete,
  manualReview,
  missingFields,
  needsAttention,
  reviewProblem,
  setField,
  startReview,
  typeLabel,
} from "../frontend/src/services/garment.ts";
import { COLORS, GARMENT_TYPES, SEASONS, slotForType } from "../supabase/functions/_shared/tag-schema.ts";

const full = { type: "jeans", color: "blue", season: "all", warmth: 3 } as const;

describe("labels and options stay in step with the tag schema", () => {
  it("has a label for every garment type, season and warmth level", () => {
    expect(Object.keys(TYPE_LABELS).sort()).toEqual([...GARMENT_TYPES].sort());
    expect(Object.keys(SEASON_LABELS).sort()).toEqual([...SEASONS].sort());
    expect(Object.keys(WARMTH_LABELS).map(Number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("offers exactly the schema's colors, seasons and warmth levels", () => {
    expect(COLOR_OPTIONS).toEqual([...COLORS]);
    expect(SEASON_OPTIONS).toEqual([...SEASONS]);
    expect(WARMTH_OPTIONS).toEqual([1, 2, 3, 4, 5]);
  });

  it("groups every garment type once: tops, bottoms, shoes, other", () => {
    expect(TYPE_GROUPS.map((g) => g.label)).toEqual(["Tops", "Bottoms", "Shoes", "Other"]);
    const all = TYPE_GROUPS.flatMap((g) => g.types);
    expect(all.sort()).toEqual([...GARMENT_TYPES].sort());
    for (const type of TYPE_GROUPS[0]!.types) expect(slotForType(type)).toBe("top");
    for (const type of TYPE_GROUPS[3]!.types) expect(slotForType(type)).toBe("other");
  });

  it("names and describes a garment", () => {
    expect(garmentName({ color: "black", type: "jeans" })).toBe("Black jeans");
    expect(garmentName({ color: "multicolor", type: "t_shirt" })).toBe("Multicolor t-shirt");
    expect(garmentDetail({ season: "all", warmth: 3 })).toBe("All seasons · Medium");
    expect(colorLabel("navy")).toBe("Navy");
    expect(typeLabel("dress_shoes")).toBe("Dress shoes");
  });

  it("labels the four fields", () => {
    expect(TAG_FIELDS.map((f) => FIELD_LABELS[f])).toEqual(["Type", "Color", "Season", "Warmth"]);
  });
});

describe("drafts", () => {
  it("starts empty and reports what is missing", () => {
    const draft = emptyDraft();
    expect(draft).toEqual({ type: null, color: null, season: null, warmth: null });
    expect(missingFields(draft)).toEqual(["type", "color", "season", "warmth"]);
    expect(isComplete(draft)).toBe(false);
  });

  it("builds a draft from whatever tags the AI gave", () => {
    expect(draftFromTags({ type: "jeans", warmth: 4 })).toEqual({ type: "jeans", color: null, season: null, warmth: 4 });
    expect(draftFromTags({ color: "red", season: "fall" })).toEqual({ type: null, color: "red", season: "fall", warmth: null });
    expect(isComplete(draftFromTags(full))).toBe(true);
  });

  it("changes one field without touching the rest or the original", () => {
    const draft = draftFromTags(full);
    const next = setField(draft, "color", "red");
    expect(next).toEqual({ ...full, color: "red" });
    expect(draft.color).toBe("blue");
  });
});

describe("review (decision D4: the person confirms what the AI suggested)", () => {
  it("flags the fields the AI listed and the ones it left out", () => {
    const review = startReview({ tags: { type: "jeans", color: "blue", warmth: 3 }, needs_review: ["color"] });
    expect(review.flagged).toEqual(["color", "season"]);
    expect(review.confirmed).toEqual([]);
    expect(review.draft.season).toBeNull();
  });

  it("flags nothing when the AI is sure of everything, and the garment can then be saved", () => {
    const review = startReview({ tags: full, needs_review: [] });
    expect(review.flagged).toEqual([]);
    expect(reviewProblem(review)).toBeNull();
  });

  it("leaves every field to the person when there is no suggestion", () => {
    const review = manualReview();
    expect(review.flagged).toEqual(TAG_FIELDS);
    expect(reviewProblem(review)).toBe("Choose type, color, season, warmth.");
  });

  it("will not save while a flagged field is unchecked, and says which", () => {
    const review = startReview({ tags: full, needs_review: ["season", "warmth"] });
    expect(needsAttention(review)).toEqual(["season", "warmth"]);
    expect(reviewProblem(review)).toBe("Check season, warmth before saving.");
  });

  it("lets the person confirm a suggestion with 'Looks right'", () => {
    let review = startReview({ tags: full, needs_review: ["season", "warmth"] });
    review = confirmField(review, "season");
    expect(needsAttention(review)).toEqual(["warmth"]);
    review = confirmField(confirmField(review, "warmth"), "warmth");
    expect(review.confirmed).toEqual(["season", "warmth"]);
    expect(reviewProblem(review)).toBeNull();
  });

  it("cannot confirm a field that has no value", () => {
    const review = startReview({ tags: { type: "jeans" }, needs_review: [] });
    expect(confirmField(review, "color")).toBe(review);
    expect(reviewProblem(review)).toBe("Choose color, season, warmth.");
  });

  it("counts choosing a value as checking that field", () => {
    let review = startReview({ tags: { type: "jeans", color: "blue" }, needs_review: ["color"] });
    review = chooseValue(review, "color", "green");
    review = chooseValue(review, "season", "fall");
    review = chooseValue(review, "warmth", 4);
    expect(review.draft).toEqual({ type: "jeans", color: "green", season: "fall", warmth: 4 });
    expect(reviewProblem(review)).toBeNull();
  });

  it("does not change the state it was given", () => {
    const review = startReview({ tags: full, needs_review: ["color"] });
    chooseValue(review, "color", "red");
    confirmField(review, "color");
    expect(review.draft.color).toBe("blue");
    expect(review.confirmed).toEqual([]);
  });
});
