import { describe, expect, it, vi } from "vitest";
import type { GatewayResult, HouseholdGateway } from "../frontend/src/services/household.ts";
import {
  COLOR_GROUPS,
  OCCASION_OPTIONS,
  STYLE_OPTIONS,
  TEMP_OPTIONS,
  draftToAnswers,
  emptyQuizDraft,
  saveQuiz,
  setTempComfort,
  toggleAvoidedGroup,
  toggleFavoriteGroup,
  toggleOccasion,
  toggleStyle,
  validateQuiz,
  type QuizDraft,
} from "../frontend/src/services/quiz.ts";
import { quizToPreferences } from "../supabase/functions/_shared/preferences.ts";
import { COLORS } from "../supabase/functions/_shared/tag-schema.ts";
import { OCCASIONS, STYLE_VIBES } from "../supabase/functions/_shared/types.ts";

const ok = (): GatewayResult<unknown> => ({ data: null, error: null });
const gateway = (saveQuiz = vi.fn(async () => ok())): Pick<HouseholdGateway, "saveQuiz"> => ({ saveQuiz });

const filled = (overrides: Partial<QuizDraft> = {}): QuizDraft => ({
  ...emptyQuizDraft(),
  style_vibes: ["casual", "smart_casual"],
  ...overrides,
});

describe("what the screen offers stays in step with the AI contract", () => {
  it("offers exactly the style vibes, occasions and temperature answers the contract accepts", () => {
    expect(STYLE_OPTIONS.map((o) => o.value).sort()).toEqual([...STYLE_VIBES].sort());
    expect(OCCASION_OPTIONS.map((o) => o.value).sort()).toEqual([...OCCASIONS].sort());
    expect(TEMP_OPTIONS.map((o) => o.value).sort()).toEqual(["neutral", "runs_cold", "runs_hot"]);
  });

  it("splits the tag schema's colors into groups with no gaps and no overlap", () => {
    const grouped = COLOR_GROUPS.flatMap((g) => g.colors);
    expect(grouped.sort()).toEqual([...COLORS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("gives every option a label to show", () => {
    for (const o of [...STYLE_OPTIONS, ...OCCASION_OPTIONS, ...TEMP_OPTIONS, ...COLOR_GROUPS.map((g) => ({ label: g.label }))]) {
      expect(o.label.trim()).not.toBe("");
    }
  });
});

describe("answering the quiz", () => {
  it("starts empty, with 'in between' as the temperature", () => {
    expect(emptyQuizDraft()).toEqual({
      style_vibes: [],
      occasions: [],
      favorite_groups: [],
      avoided_groups: [],
      temp_comfort: "neutral",
    });
  });

  it("toggles styles and occasions on and off without touching the rest", () => {
    let draft = toggleStyle(emptyQuizDraft(), "casual");
    draft = toggleStyle(draft, "sporty");
    expect(draft.style_vibes).toEqual(["casual", "sporty"]);
    expect(toggleStyle(draft, "casual").style_vibes).toEqual(["sporty"]);

    draft = toggleOccasion(draft, "gym");
    expect(draft.occasions).toEqual(["gym"]);
    expect(toggleOccasion(draft, "gym").occasions).toEqual([]);
    expect(draft.style_vibes).toEqual(["casual", "sporty"]);
  });

  it("does not change the draft it was given", () => {
    const draft = emptyQuizDraft();
    toggleStyle(draft, "casual");
    toggleFavoriteGroup(draft, "neutrals");
    setTempComfort(draft, "runs_hot");
    expect(draft).toEqual(emptyQuizDraft());
  });

  it("sets the temperature", () => {
    expect(setTempComfort(emptyQuizDraft(), "runs_cold").temp_comfort).toBe("runs_cold");
  });

  it("never lets a color group be both liked and avoided", () => {
    let draft = toggleFavoriteGroup(emptyQuizDraft(), "bright");
    draft = toggleFavoriteGroup(draft, "neutrals");
    draft = toggleAvoidedGroup(draft, "bright");
    expect(draft.favorite_groups).toEqual(["neutrals"]);
    expect(draft.avoided_groups).toEqual(["bright"]);

    draft = toggleFavoriteGroup(draft, "bright");
    expect(draft.favorite_groups).toEqual(["neutrals", "bright"]);
    expect(draft.avoided_groups).toEqual([]);
  });

  it("turning a group off leaves the other list alone", () => {
    let draft = toggleAvoidedGroup(toggleFavoriteGroup(emptyQuizDraft(), "earth"), "bright");
    draft = toggleFavoriteGroup(draft, "earth");
    expect(draft.favorite_groups).toEqual([]);
    expect(draft.avoided_groups).toEqual(["bright"]);
    draft = toggleAvoidedGroup(draft, "bright");
    expect(draft.avoided_groups).toEqual([]);
  });
});

describe("validateQuiz", () => {
  it("needs at least one style and nothing else", () => {
    expect(validateQuiz(emptyQuizDraft())).toBe("Pick at least one style.");
    expect(validateQuiz(filled())).toBeNull();
    expect(validateQuiz(filled({ occasions: [], favorite_groups: [], avoided_groups: [] }))).toBeNull();
  });
});

describe("draftToAnswers", () => {
  it("expands color groups into the exact colors the AI contract uses", () => {
    const answers = draftToAnswers(
      filled({ favorite_groups: ["black_white", "earth"], avoided_groups: ["bright"], occasions: ["work"], temp_comfort: "runs_cold" }),
    );
    expect(answers).toEqual({
      style_vibes: ["casual", "smart_casual"],
      temp_comfort: "runs_cold",
      occasions: ["work"],
      favorite_colors: ["black", "white", "brown", "green", "orange"],
      avoided_colors: ["red", "pink", "yellow", "purple", "blue", "multicolor"],
    });
  });

  it("gives the same colors whatever order the groups were tapped in", () => {
    const a = draftToAnswers(filled({ favorite_groups: ["earth", "black_white"] }));
    const b = draftToAnswers(filled({ favorite_groups: ["black_white", "earth"] }));
    expect(a.favorite_colors).toEqual(b.favorite_colors);
  });

  it("copies the lists, so later taps cannot change saved answers", () => {
    const draft = filled();
    const answers = draftToAnswers(draft);
    expect(answers.style_vibes).not.toBe(draft.style_vibes);
  });
});

describe("saveQuiz", () => {
  it("does not call the server for an unfinished quiz", async () => {
    const g = gateway();
    expect(await saveQuiz(g, emptyQuizDraft())).toEqual({ ok: false, error: "Pick at least one style." });
    expect(g.saveQuiz).not.toHaveBeenCalled();
  });

  it("stores the answers together with the starting weights the AI core computes from them", async () => {
    const g = gateway();
    const draft = filled({ favorite_groups: ["black_white"], avoided_groups: ["bright"] });
    const result = await saveQuiz(g, draft);

    const answers = draftToAnswers(draft);
    expect(result).toEqual({ ok: true, value: answers });
    expect(g.saveQuiz).toHaveBeenCalledWith(answers, quizToPreferences(answers));
    const [, preferences] = (g.saveQuiz as ReturnType<typeof vi.fn>).mock.calls[0]! as unknown as [unknown, { tag: string; weight: number }[]];
    expect(preferences).toContainEqual({ tag: "color:black", weight: 0.6 });
    expect(preferences).toContainEqual({ tag: "color:red", weight: -0.6 });
  });

  it("shows a server error and keeps the quiz open", async () => {
    const g = gateway(vi.fn(async () => ({ data: null, error: { message: "permission denied" } })));
    expect(await saveQuiz(g, filled())).toEqual({ ok: false, error: "permission denied" });
  });

  it("explains a lost session in plain words", async () => {
    const g = gateway(vi.fn(async () => ({ data: null, error: { message: "JWT expired" } })));
    expect(await saveQuiz(g, filled())).toEqual({ ok: false, error: "Your session expired. Please sign in again." });
  });

  it("reports network failures", async () => {
    const g = gateway(vi.fn(async () => { throw new Error("offline"); }));
    expect(await saveQuiz(g, filled())).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});
