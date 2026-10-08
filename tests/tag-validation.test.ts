import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIDENCE,
  LOW_CONFIDENCE,
  extractJson,
  parseModelOutput,
  validateTags,
} from "../supabase/functions/_shared/tag-validation.ts";
import { COLORS, GARMENT_TYPES, SEASONS, isWarmth } from "../supabase/functions/_shared/tag-schema.ts";
import { PROMPT_VERSION, buildVisionPrompt } from "../supabase/functions/_shared/vision-prompt.ts";

const good = {
  type: "jeans", color: "navy", season: "all", warmth: 3,
  confidence: { type: 0.95, color: 0.9, season: 0.8, warmth: 0.7 },
};

describe("validateTags", () => {
  it("passes a clean answer through with its confidence and no review flags", () => {
    expect(validateTags(good)).toEqual({
      tags: { type: "jeans", color: "navy", season: "all", warmth: 3 },
      confidence: good.confidence,
      needs_review: [],
      warnings: [],
    });
  });

  it("normalizes case, spacing, hyphens and plurals", () => {
    const r = validateTags({ ...good, type: " T-Shirts ", color: "Navy", season: "ALL" });
    expect(r.tags).toMatchObject({ type: "t_shirt", color: "navy", season: "all" });
  });

  it.each([
    ["tee", "t_shirt"], ["Button Up", "shirt"], ["pullover", "sweater"], ["pants", "trousers"],
    ["trainers", "sneakers"], ["loafers", "dress_shoes"], ["blazer", "jacket"], ["sweatshirt", "hoodie"],
  ])("maps type synonym %s -> %s", (given, expected) => {
    expect(validateTags({ ...good, type: given }).tags.type).toBe(expected);
  });

  it.each([
    ["grey", "gray"], ["Navy Blue", "navy"], ["cream", "beige"], ["burgundy", "red"], ["multi-color", "multicolor"],
  ])("maps color synonym %s -> %s", (given, expected) => {
    expect(validateTags({ ...good, color: given }).tags.color).toBe(expected);
  });

  it("maps season synonyms and collapses season lists", () => {
    expect(validateTags({ ...good, season: "autumn" }).tags.season).toBe("fall");
    expect(validateTags({ ...good, season: "year round" }).tags.season).toBe("all");
    expect(validateTags({ ...good, season: ["spring", "summer", "fall"] }).tags.season).toBe("all");
    const two = validateTags({ ...good, season: ["spring", "summer"] });
    expect(two.tags.season).toBe("spring");
    expect(two.warnings.join()).toContain("multiple seasons");
    expect(validateTags({ ...good, season: ["monsoon"] }).tags.season).toBeUndefined();
  });

  it("accepts warmth as a number, a numeric string or a decimal, and rejects the rest", () => {
    expect(validateTags({ ...good, warmth: "4" }).tags.warmth).toBe(4);
    expect(validateTags({ ...good, warmth: 2.6 }).tags.warmth).toBe(3);
    for (const bad of [0, 6, -1, NaN, Infinity, "warm", "", null, undefined, {}, []]) {
      const r = validateTags({ ...good, warmth: bad });
      expect(r.tags.warmth).toBeUndefined();
      expect(r.needs_review).toContain("warmth");
    }
  });

  it("leaves unrecognized values out, flags them and says what the model returned", () => {
    const r = validateTags({ ...good, type: "spaceship", color: "chartreuse" });
    expect(r.tags.type).toBeUndefined();
    expect(r.tags.color).toBeUndefined();
    expect(r.needs_review).toEqual(["type", "color"]);
    expect(r.warnings.join()).toContain("spaceship");
    expect(r.confidence.type).toBeUndefined();
  });

  it("flags low-confidence fields but keeps their values", () => {
    const r = validateTags({ ...good, confidence: { ...good.confidence, color: LOW_CONFIDENCE - 0.01 } });
    expect(r.tags.color).toBe("navy");
    expect(r.needs_review).toEqual(["color"]);
  });

  it("does not flag a field at exactly the confidence threshold", () => {
    const r = validateTags({ ...good, confidence: { type: LOW_CONFIDENCE, color: 1, season: 1, warmth: 1 } });
    expect(r.needs_review).toEqual([]);
  });

  it("uses a review-triggering default and clamps when confidence is missing or silly", () => {
    const missing = validateTags({ type: "jeans", color: "navy", season: "all", warmth: 3 });
    expect(missing.confidence.type).toBe(DEFAULT_CONFIDENCE);
    expect(missing.needs_review).toEqual(["type", "color", "season", "warmth"]);
    const odd = validateTags({ ...good, confidence: { type: 7, color: -2, season: "high", warmth: NaN } });
    expect(odd.confidence).toEqual({ type: 1, color: 0, season: DEFAULT_CONFIDENCE, warmth: DEFAULT_CONFIDENCE });
  });

  it("uses the first garment when the model returns several", () => {
    const r = validateTags([good, { ...good, type: "shirt" }]);
    expect(r.tags.type).toBe("jeans");
    expect(r.warnings.join()).toContain("multiple garments");
    expect(validateTags([good]).warnings).toEqual([]);
  });

  it.each([null, undefined, "jeans", 42, true, [], ""])("survives non-object output %j", (junk) => {
    const r = validateTags(junk);
    expect(r.tags).toEqual({});
    expect(r.needs_review).toEqual(["type", "color", "season", "warmth"]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("is not fooled by prototype keys", () => {
    const r = validateTags({ type: "constructor", color: "__proto__", season: "toString", warmth: 3 });
    expect(r.tags.type).toBeUndefined();
    expect(r.tags.color).toBeUndefined();
    expect(r.tags.season).toBeUndefined();
  });
});

describe("extractJson / parseModelOutput", () => {
  it("parses plain JSON, fenced JSON and JSON surrounded by chatter", () => {
    const json = JSON.stringify(good);
    expect(extractJson(json)).toEqual(good);
    expect(extractJson("```json\n" + json + "\n```")).toEqual(good);
    expect(extractJson(`Sure! Here is the tag:\n${json}\nHope that helps.`)).toEqual(good);
    expect(extractJson(`[${json}]`)).toEqual([good]);
  });

  it("returns undefined for text with no usable JSON", () => {
    for (const text of ["", "no json here", "{broken", "} then {", "{'single': 'quotes'}"]) {
      expect(extractJson(text)).toBeUndefined();
    }
  });

  it("parseModelOutput validates fenced output and reports missing JSON", () => {
    const ok = parseModelOutput("```json\n" + JSON.stringify(good) + "\n```");
    expect(ok.tags.type).toBe("jeans");
    const none = parseModelOutput("I cannot see an image.");
    expect(none.tags).toEqual({});
    expect(none.warnings).toEqual(["no JSON found in model output"]);
    expect(none.needs_review).toHaveLength(4);
  });
});

// Seeded fuzzing: whatever comes in, whatever comes out is valid or absent.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("validateTags fuzzing", () => {
  it("never throws and only returns schema-valid values", () => {
    const rand = mulberry32(7);
    const junk: unknown[] = [
      null, undefined, NaN, 0, 3, 99, -4, 2.5, "", " ", "jeans", "RED", "x".repeat(500), "😀", "__proto__", {}, [], ["jeans"],
      { a: 1 }, true, ...GARMENT_TYPES, ...COLORS, ...SEASONS,
    ];
    const pick = () => junk[Math.floor(rand() * junk.length)];
    for (let i = 0; i < 2000; i++) {
      const input = { type: pick(), color: pick(), season: pick(), warmth: pick(), confidence: { type: pick(), color: pick(), season: pick(), warmth: pick() } };
      const r = validateTags(rand() < 0.1 ? [input, input] : input);
      if (r.tags.type !== undefined) expect(GARMENT_TYPES).toContain(r.tags.type);
      if (r.tags.color !== undefined) expect(COLORS).toContain(r.tags.color);
      if (r.tags.season !== undefined) expect(SEASONS).toContain(r.tags.season);
      if (r.tags.warmth !== undefined) expect(isWarmth(r.tags.warmth)).toBe(true);
      for (const c of Object.values(r.confidence)) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThanOrEqual(1);
      // every field is either present or flagged for review
      for (const f of ["type", "color", "season", "warmth"] as const) {
        expect(r.tags[f] !== undefined || r.needs_review.includes(f)).toBe(true);
      }
    }
  });
});

describe("vision prompt", () => {
  it("lists every allowed value so the model cannot answer outside the schema", () => {
    const prompt = buildVisionPrompt();
    for (const v of [...GARMENT_TYPES, ...COLORS, ...SEASONS]) expect(prompt).toContain(v);
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("confidence");
    expect(PROMPT_VERSION).toMatch(/^v\d+$/);
  });
});
