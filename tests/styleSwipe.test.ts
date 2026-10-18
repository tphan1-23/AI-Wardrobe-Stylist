import { describe, expect, it, vi } from "vitest";
import type { GatewayResult } from "../frontend/src/services/household.ts";
import {
  SWIPE_DISTANCE_FRACTION,
  createDeck,
  decideSwipe,
  feedbackFor,
} from "../frontend/src/services/styleSwipe.ts";
import type { GarmentRow, TodayGateway } from "../frontend/src/services/today.ts";
import type { GenerateOutfitResponse } from "../supabase/functions/_shared/types.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string, status?: number): GatewayResult<never> => ({ data: null, error: { message, status } });

const WIDTH = 400;
const MILD = { temp_c: 18, feels_like_c: 18, is_precipitating: false };

const garment = (id: string, overrides: Partial<GarmentRow> = {}): GarmentRow => ({
  id,
  type: "t_shirt",
  color: "white",
  season: "all",
  warmth: 2,
  status: "clean",
  image_path: `u/${id}.jpg`,
  ...overrides,
});
const CLOSET = [garment("g-top"), garment("g-bottom", { type: "jeans" }), garment("g-shoes", { type: "sneakers" })];

const idea = (id: string): GenerateOutfitResponse => ({
  status: "ok",
  suggestion_id: id,
  outfit: { top: "g-top", bottom: "g-bottom", shoes: "g-shoes" },
  score: 0.5,
  reasoning: `Idea ${id}.`,
  weather: MILD,
});

// A fake that hands out i-1, i-2, i-3 ... and then runs out after `total` ideas.
function gateway(total = 10, overrides: Partial<TodayGateway> = {}): TodayGateway {
  let served = 0;
  return {
    loadSuggestions: vi.fn(async () => ok([])),
    loadGarments: vi.fn(async (ids: string[]) => ok(CLOSET.filter((g) => ids.includes(g.id)))),
    signPhotos: vi.fn(async (paths: string[]) => ok(Object.fromEntries(paths.map((p) => [p, `https://photos/${p}`])))),
    generateOutfit: vi.fn(async () => {
      served += 1;
      if (served > total) return ok<GenerateOutfitResponse>({ status: "exhausted", reasoning: "No more ideas.", weather: MILD });
      return ok(idea(`i-${served}`));
    }),
    sendFeedback: vi.fn(async () => ok(null)),
    acceptSuggestion: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

const DATE = "2026-10-18";
const asked = (g: TodayGateway) => (g.generateOutfit as ReturnType<typeof vi.fn>).mock.calls as unknown[][];

describe("decideSwipe", () => {
  it("is a like past the swipe distance to the right, and a dislike to the left", () => {
    const far = WIDTH * SWIPE_DISTANCE_FRACTION;
    expect(decideSwipe(far + 1, 0, WIDTH)).toBe("like");
    expect(decideSwipe(-far - 1, 0, WIDTH)).toBe("dislike");
  });

  it("leaves a short drag alone", () => {
    expect(decideSwipe(0, 0, WIDTH)).toBeNull();
    expect(decideSwipe(WIDTH * SWIPE_DISTANCE_FRACTION - 1, 0.1, WIDTH)).toBeNull();
    expect(decideSwipe(-(WIDTH * SWIPE_DISTANCE_FRACTION - 1), -0.1, WIDTH)).toBeNull();
  });

  it("counts a fast flick even over a short distance, but not a twitch", () => {
    expect(decideSwipe(40, 1.2, WIDTH)).toBe("like");
    expect(decideSwipe(-40, -1.2, WIDTH)).toBe("dislike");
    expect(decideSwipe(5, 1.5, WIDTH)).toBeNull();
    expect(decideSwipe(-5, -1.5, WIDTH)).toBeNull();
    // A fast flick against the drag direction is not a swipe.
    expect(decideSwipe(-40, 1.2, WIDTH)).toBeNull();
  });

  it("sends a thumbs-up for a like and a thumbs-down for a dislike", () => {
    expect(feedbackFor("like")).toBe("up");
    expect(feedbackFor("dislike")).toBe("down");
  });
});

describe("the deck", () => {
  it("shows the first idea as an explore idea and starts fetching the next one", async () => {
    const g = gateway();
    const deck = createDeck(g, DATE);
    const result = await deck.load();

    expect(result).toMatchObject({
      ok: true,
      value: { current: { suggestionId: "i-1", reasoning: "Idea i-1." }, weather: MILD, end: null, judged: 0, warning: null },
    });
    expect(g.generateOutfit).toHaveBeenNthCalledWith(1, DATE, [], "explore");
    // The second idea is already being asked for, skipping the first.
    expect(g.generateOutfit).toHaveBeenNthCalledWith(2, DATE, ["i-1"], "explore");
  });

  it("a swipe right sends a thumbs-up for that idea and moves on to the next one", async () => {
    const g = gateway();
    const deck = createDeck(g, DATE);
    await deck.load();
    const result = await deck.swipe("like");

    expect(g.sendFeedback).toHaveBeenCalledWith("i-1", "up");
    expect(result).toMatchObject({ ok: true, value: { current: { suggestionId: "i-2" }, judged: 1, warning: null } });
  });

  it("a swipe left sends a thumbs-down", async () => {
    const g = gateway();
    const deck = createDeck(g, DATE);
    await deck.load();
    await deck.swipe("dislike");
    expect(g.sendFeedback).toHaveBeenCalledWith("i-1", "down");
  });

  it("never shows the same idea twice, and always asks for the next one while skipping everything seen", async () => {
    const g = gateway();
    const deck = createDeck(g, DATE);
    const shown: string[] = [];
    let state = await deck.load();
    for (let i = 0; i < 6; i++) {
      if (!state.ok || !state.value.current) break;
      shown.push(state.value.current.suggestionId);
      state = await deck.swipe(i % 2 === 0 ? "like" : "dislike");
    }
    expect(shown).toEqual(["i-1", "i-2", "i-3", "i-4", "i-5", "i-6"]);
    expect(new Set(shown).size).toBe(shown.length);
    // Every request skips all the ideas fetched before it, shown or not yet shown.
    asked(g).forEach((call, index) => expect(call[1]).toEqual(shown.concat(["i-7", "i-8"]).slice(0, index)));
    expect(asked(g).every((call) => call[2] === "explore")).toBe(true);
    expect((g.sendFeedback as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      ["i-1", "up"], ["i-2", "down"], ["i-3", "up"], ["i-4", "down"], ["i-5", "up"], ["i-6", "down"],
    ]);
  });

  it("never touches today's suggestions", async () => {
    const g = gateway();
    const deck = createDeck(g, DATE);
    await deck.load();
    await deck.swipe("like");
    expect(g.loadSuggestions).not.toHaveBeenCalled();
    expect(g.acceptSuggestion).not.toHaveBeenCalled();
  });

  it("ends the deck when the ideas run out, and says so", async () => {
    const g = gateway(2);
    const deck = createDeck(g, DATE);
    await deck.load();
    await deck.swipe("like");
    const last = await deck.swipe("dislike");
    expect(last).toMatchObject({
      ok: true,
      value: { current: null, end: { kind: "exhausted", reasoning: "No more ideas.", missing: [] }, judged: 2 },
    });
    expect(g.sendFeedback).toHaveBeenCalledTimes(2);
  });

  it("explains an empty closet from the first idea on", async () => {
    const g = gateway(10, {
      generateOutfit: vi.fn(async () =>
        ok<GenerateOutfitResponse>({ status: "incomplete", missing_slots: ["top", "shoes"], reasoning: "Not enough clothes.", weather: MILD }),
      ),
    });
    const result = await createDeck(g, DATE).load();
    expect(result).toMatchObject({
      ok: true,
      value: { current: null, end: { kind: "incomplete", missing: ["top", "shoes"], reasoning: "Not enough clothes." } },
    });
    expect(g.generateOutfit).toHaveBeenCalledTimes(1);
  });

  it("has nothing to judge when there is no current idea", async () => {
    const g = gateway(1);
    const deck = createDeck(g, DATE);
    expect(await deck.swipe("like")).toEqual({ ok: false, error: "There is no outfit idea to judge right now." });
    await deck.load();
    await deck.swipe("like");
    expect(await deck.swipe("like")).toMatchObject({ ok: false });
    expect(g.sendFeedback).toHaveBeenCalledTimes(1);
  });

  it("moves on even when the answer could not be saved, and warns", async () => {
    const g = gateway(10, { sendFeedback: vi.fn(async () => err("not found", 404)) });
    const deck = createDeck(g, DATE);
    await deck.load();
    const result = await deck.swipe("like");
    expect(result).toMatchObject({ ok: true, value: { current: { suggestionId: "i-2" }, warning: expect.stringMatching(/profile could not be found/i) } });
  });

  it("does not warn when the answer was already recorded (409)", async () => {
    const g = gateway(10, { sendFeedback: vi.fn(async () => err("already", 409)) });
    const deck = createDeck(g, DATE);
    await deck.load();
    expect(await deck.swipe("like")).toMatchObject({ ok: true, value: { warning: null } });
  });

  it("shows an error when the first idea cannot be loaded, and works after trying again", async () => {
    let fail = true;
    const g = gateway(10);
    const real = g.generateOutfit as ReturnType<typeof vi.fn>;
    (g as { generateOutfit: unknown }).generateOutfit = vi.fn(async (...args: unknown[]) =>
      fail ? err("weather is unavailable right now", 502) : (real as (...a: unknown[]) => unknown)(...args),
    );
    const deck = createDeck(g, DATE);
    expect(await deck.load()).toMatchObject({ ok: false, error: expect.stringMatching(/weather service/i) });
    fail = false;
    expect(await deck.load()).toMatchObject({ ok: true, value: { current: { suggestionId: "i-1" } } });
  });

  it("when the next idea cannot be fetched, the swipe is still sent and loading again continues the deck", async () => {
    let calls = 0;
    const g = gateway(10);
    const real = g.generateOutfit as ReturnType<typeof vi.fn>;
    (g as { generateOutfit: unknown }).generateOutfit = vi.fn(async (...args: unknown[]) => {
      calls += 1;
      return calls === 2 ? err("offline") : (real as (...a: unknown[]) => unknown)(...args);
    });
    const deck = createDeck(g, DATE);
    await deck.load();
    const failed = await deck.swipe("like");
    expect(failed).toMatchObject({ ok: false });
    expect(g.sendFeedback).toHaveBeenCalledWith("i-1", "up");
    const retried = await deck.load();
    expect(retried).toMatchObject({ ok: true, value: { current: { suggestionId: expect.stringMatching(/^i-/) }, judged: 1 } });
  });
});
