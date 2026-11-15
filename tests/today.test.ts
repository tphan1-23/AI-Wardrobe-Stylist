import { describe, expect, it, vi } from "vitest";
import type { GatewayResult } from "../frontend/src/services/household.ts";
import {
  MAX_EXCLUDED,
  formatToday,
  friendlyTodayError,
  garmentDetail,
  garmentName,
  judgeIdea,
  loadToday,
  newOutfitToday,
  nextIdea,
  rejectOutfit,
  todayString,
  wearOutfit,
  weatherLine,
  wornMessage,
  type GarmentRow,
  type SuggestionRow,
  type TodayGateway,
} from "../frontend/src/services/today.ts";
import { GARMENT_TYPES, WARMTH_MAX, WARMTH_MIN } from "../supabase/functions/_shared/tag-schema.ts";
import type { GenerateOutfitResponse } from "../supabase/functions/_shared/types.ts";
import { GENERIC_ERROR } from "../frontend/src/services/errors.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string, status?: number): GatewayResult<never> => ({ data: null, error: { message, status } });

const garment = (id: string, overrides: Partial<GarmentRow> = {}): GarmentRow => ({
  id,
  type: "t_shirt",
  color: "white",
  season: "all",
  warmth: 3,
  status: "clean",
  image_path: `user-1/${id}.jpg`,
  ...overrides,
});

const TOP = garment("g-top");
const BOTTOM = garment("g-bottom", { type: "jeans", color: "blue", season: "fall", warmth: 4 });
const SHOES = garment("g-shoes", { type: "sneakers", color: "black", warmth: 2 });
const CLOSET = [TOP, BOTTOM, SHOES];

const suggestion = (id: string, overrides: Partial<SuggestionRow> = {}): SuggestionRow => ({
  id,
  date: "2026-10-04",
  garment_ids: ["g-top", "g-bottom", "g-shoes"],
  feedback: null,
  accepted: false,
  created_at: `2026-10-04T08:00:0${id.length}Z`,
  ...overrides,
});

const MILD = { temp_c: 18, feels_like_c: 18, is_precipitating: false };

const generated: GenerateOutfitResponse = {
  status: "ok",
  suggestion_id: "s-new",
  outfit: { top: "g-top", bottom: "g-bottom", shoes: "g-shoes" },
  score: 0.5,
  reasoning: "Cool today, so a warmer top.",
  weather: { temp_c: 18, feels_like_c: 18, is_precipitating: false },
};

function gateway(overrides: Partial<TodayGateway> = {}, closet: GarmentRow[] = CLOSET): TodayGateway {
  return {
    loadSuggestions: vi.fn(async () => ok<SuggestionRow[]>([])),
    loadGarments: vi.fn(async (ids: string[]) => ok(closet.filter((g) => ids.includes(g.id)))),
    signPhotos: vi.fn(async (paths: string[]) => ok(Object.fromEntries(paths.map((p) => [p, `https://photos/${p}`])))),
    generateOutfit: vi.fn(async () => ok<GenerateOutfitResponse>(generated)),
    sendFeedback: vi.fn(async () => ok(null)),
    acceptSuggestion: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

const DATE = "2026-10-04";

describe("labels", () => {
  it("names a garment from its color and type", () => {
    expect(garmentName({ color: "black", type: "jeans" })).toBe("Black jeans");
    expect(garmentName({ color: "multicolor", type: "t_shirt" })).toBe("Multicolor t-shirt");
    expect(garmentName({ color: "navy", type: "dress_shoes" })).toBe("Navy dress shoes");
  });

  it("has a readable name for every garment type", () => {
    for (const type of GARMENT_TYPES) {
      const name = garmentName({ color: "red", type });
      expect(name).toMatch(/^Red [a-z -]+$/);
      expect(name).not.toContain("_");
    }
  });

  it("describes season and warmth", () => {
    expect(garmentDetail({ season: "all", warmth: 3 })).toBe("All seasons · Medium");
    expect(garmentDetail({ season: "fall", warmth: 5 })).toBe("Fall · Very warm");
    for (let warmth = WARMTH_MIN; warmth <= WARMTH_MAX; warmth++) {
      expect(garmentDetail({ season: "winter", warmth: warmth as 1 | 2 | 3 | 4 | 5 })).toMatch(/^Winter · [A-Z]/);
    }
  });
});

describe("weatherLine", () => {
  const snapshot = (temp_c: number, is_precipitating = false) => ({ temp_c, feels_like_c: temp_c, is_precipitating });

  it("shows the place, the temperature in Fahrenheit and rain", () => {
    expect(weatherLine("Conway", snapshot(14.4))).toBe("Conway · 58°");
    expect(weatherLine("Conway", snapshot(14.4, true))).toBe("Conway · 58° · Rain");
    expect(weatherLine(" Conway, AR ", snapshot(0))).toBe("Conway, AR · 32°");
    expect(weatherLine("Conway", snapshot(-10))).toBe("Conway · 14°");
    expect(weatherLine("Conway", snapshot(37.8))).toBe("Conway · 100°");
  });

  it("shows only the place when the weather is not known (a reopened screen)", () => {
    expect(weatherLine("Conway", null)).toBe("Conway");
  });

  it("shows only the weather, or nothing, when there is no location", () => {
    expect(weatherLine(null, snapshot(14.4))).toBe("58°");
    expect(weatherLine("  ", snapshot(20, true))).toBe("68° · Rain");
    expect(weatherLine(null, null)).toBe("");
  });
});

describe("dates", () => {
  it("uses the device's calendar day, zero-padded", () => {
    expect(todayString(new Date(2026, 9, 4, 23, 59))).toBe("2026-10-04");
    expect(todayString(new Date(2026, 0, 5, 0, 1))).toBe("2026-01-05");
  });

  it("shows a short weekday and date", () => {
    expect(formatToday(new Date(2026, 9, 4))).toBe("Sun, Oct 4");
    expect(formatToday(new Date(2026, 11, 25))).toBe("Fri, Dec 25");
  });

  it("falls back to the current time when none is given", () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatToday()).toMatch(/^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}$/);
  });
});

describe("friendlyTodayError", () => {
  it.each([
    [401, /session expired/i],
    [404, /profile could not be found/i],
    [409, /set your location/i],
    [502, /weather service is unavailable/i],
  ])("explains status %i in plain words", (status, expected) => {
    expect(friendlyTodayError({ message: "raw", status })).toMatch(expected);
  });

  it("hides unexpected messages behind a generic one", () => {
    expect(friendlyTodayError({ message: "Something odd", status: 500 })).toBe(GENERIC_ERROR);
    expect(friendlyTodayError({ message: "Something odd" })).toBe(GENERIC_ERROR);
  });
});

describe("loadToday: first open of the day", () => {
  it("asks for an outfit, then shows it with names, details, photos and the reason", async () => {
    const g = gateway();
    const result = await loadToday(g, DATE);

    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, []);
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "outfit",
        outfit: {
          suggestionId: "s-new",
          accepted: false,
          reasoning: "Cool today, so a warmer top.",
          items: [
            { id: "g-top", slot: "top", label: "Top", name: "White t-shirt", detail: "All seasons · Medium", photoUrl: "https://photos/user-1/g-top.jpg", goesToLaundry: true },
            { id: "g-bottom", slot: "bottom", label: "Bottom", name: "Blue jeans", detail: "Fall · Warm", photoUrl: "https://photos/user-1/g-bottom.jpg", goesToLaundry: true },
            { id: "g-shoes", slot: "shoes", label: "Shoes", name: "Black sneakers", detail: "All seasons · Light", photoUrl: "https://photos/user-1/g-shoes.jpg", goesToLaundry: false },
          ],
        },
        weather: MILD,
      },
    });
  });

  it("reports which slots have nothing clean to wear", async () => {
    const g = gateway({
      generateOutfit: vi.fn(async () =>
        ok<GenerateOutfitResponse>({ status: "incomplete", missing_slots: ["shoes"], reasoning: "No clean shoes available.", weather: MILD }),
      ),
    });
    expect(await loadToday(g, DATE)).toEqual({
      ok: true,
      value: { kind: "incomplete", missing: ["shoes"], reasoning: "No clean shoes available.", weather: MILD },
    });
  });

  it("reports when every combination was already rejected", async () => {
    const g = gateway({
      generateOutfit: vi.fn(async () => ok<GenerateOutfitResponse>({ status: "exhausted", reasoning: "All rejected.", weather: MILD })),
    });
    expect(await loadToday(g, DATE)).toEqual({ ok: true, value: { kind: "exhausted", reasoning: "All rejected.", weather: MILD } });
  });

  it("still shows the outfit when the photo links cannot be made", async () => {
    for (const signPhotos of [
      vi.fn(async () => err("storage down")),
      vi.fn(async () => ok<Record<string, string>>({})),
      vi.fn(async () => { throw new Error("offline"); }),
    ]) {
      const result = await loadToday(gateway({ signPhotos }), DATE);
      expect(result).toMatchObject({ ok: true, value: { kind: "outfit" } });
      if (result.ok && result.value.kind === "outfit") {
        expect(result.value.outfit.items.map((item) => item.photoUrl)).toEqual([null, null, null]);
      }
    }
  });

  it("shows the error when the new outfit's garments cannot be read", async () => {
    const g = gateway({ loadGarments: vi.fn(async () => err("denied")) });
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: GENERIC_ERROR });
  });

  it("fails clearly if the new outfit's garments cannot be found", async () => {
    const g = gateway({ loadGarments: vi.fn(async () => ok<GarmentRow[]>([])) });
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: "Could not load your outfit. Please try again." });
  });
});

describe("loadToday: opening the screen again the same day", () => {
  it("shows the same outfit instead of generating a new one", async () => {
    const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1")])) });
    const result = await loadToday(g, DATE);
    expect(g.generateOutfit).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      // A saved suggestion does not store the weather, so a reopened screen has none.
      value: { kind: "outfit", outfit: { suggestionId: "s-1", accepted: false, reasoning: null }, weather: null },
    });
  });

  it("remembers that the outfit was already accepted, even if an item has since gone to the laundry", async () => {
    const dirty = [TOP, { ...BOTTOM, status: "dirty" as const }, SHOES];
    const g = gateway(
      { loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { accepted: true, feedback: "up" })])) },
      dirty,
    );
    const result = await loadToday(g, DATE);
    expect(g.generateOutfit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, value: { kind: "outfit", outfit: { accepted: true } } });
  });

  it("replaces an outfit that was rejected, and tells the AI which ones to skip", async () => {
    const g = gateway({
      loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { feedback: "down" }), suggestion("s-2", { feedback: "down" })])),
    });
    await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["s-1", "s-2"]);
  });

  it("tells the AI to skip only the rejected outfits, never ones the user accepted", async () => {
    const g = gateway({
      loadSuggestions: vi.fn(async () =>
        ok([
          suggestion("s-1", { feedback: "up", accepted: true }),
          suggestion("s-2", { feedback: null }),
          suggestion("s-3", { feedback: "down" }),
        ]),
      ),
    });
    await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["s-3"]);
  });

  it("only skips the rejected ones, not the earlier outfit the user kept", async () => {
    const g = gateway({
      loadSuggestions: vi.fn(async () =>
        ok([suggestion("s-1", { feedback: "down" }), suggestion("s-2", { feedback: "up", accepted: false })]),
      ),
    });
    const result = await loadToday(g, DATE);
    expect(g.generateOutfit).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, value: { outfit: { suggestionId: "s-2" } } });
  });

  it(`sends at most the ${MAX_EXCLUDED} most recent rejected outfits`, async () => {
    const rows = Array.from({ length: MAX_EXCLUDED + 10 }, (_, i) => suggestion(`s-${i}`, { feedback: "down" }));
    const g = gateway({ loadSuggestions: vi.fn(async () => ok(rows)) });
    await loadToday(g, DATE);
    const sent = (g.generateOutfit as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(sent).toHaveLength(MAX_EXCLUDED);
    expect(sent[0]).toBe("s-10");
    expect(sent[MAX_EXCLUDED - 1]).toBe(`s-${MAX_EXCLUDED + 9}`);
  });

  it.each([
    ["a garment was deleted", [TOP, BOTTOM], undefined],
    ["a garment is in the laundry", [TOP, { ...BOTTOM, status: "dirty" as const }, SHOES], undefined],
    ["two garments share a slot", [TOP, garment("g-bottom", { type: "shirt" }), SHOES], undefined],
    ["a garment is not a top, bottom or shoes", [TOP, BOTTOM, garment("g-shoes", { type: "jacket" })], undefined],
  ])("generates a new outfit when %s", async (_why, closet) => {
    const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1")])) }, closet);
    const result = await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledTimes(1);
    // The new outfit then needs the full closet, so the fake only returns what exists:
    // what matters here is that the stale one was not shown.
    expect(result.ok && result.value.kind === "outfit" && result.value.outfit.suggestionId === "s-1").toBe(false);
  });
});

describe("loadToday: failures", () => {
  it("shows a server error from loading suggestions", async () => {
    const g = gateway({ loadSuggestions: vi.fn(async () => err("permission denied")) });
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: GENERIC_ERROR });
    expect(g.generateOutfit).not.toHaveBeenCalled();
  });

  it("explains a missing location and an unavailable weather service", async () => {
    const noLocation = gateway({ generateOutfit: vi.fn(async () => err("set your location first", 409)) });
    expect(await loadToday(noLocation, DATE)).toMatchObject({ ok: false, error: expect.stringMatching(/set your location/i) });
    const noWeather = gateway({ generateOutfit: vi.fn(async () => err("weather is unavailable right now", 502)) });
    expect(await loadToday(noWeather, DATE)).toMatchObject({ ok: false, error: expect.stringMatching(/weather service/i) });
  });

  it("shows an error from loading the garments of a saved outfit", async () => {
    const g = gateway({
      loadSuggestions: vi.fn(async () => ok([suggestion("s-1")])),
      loadGarments: vi.fn(async () => err("denied")),
    });
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: GENERIC_ERROR });
  });

  it("reports network failures and empty answers", async () => {
    const down = gateway({ loadSuggestions: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await loadToday(down, DATE)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    const empty = gateway({ generateOutfit: vi.fn(async () => ({ data: null, error: null })) });
    expect(await loadToday(empty, DATE)).toMatchObject({ ok: false, error: expect.stringContaining("no data") });
  });
});

describe("newOutfitToday (another outfit after one was approved)", () => {
  it("asks for a new outfit that skips everything already suggested today, worn or not", async () => {
    const g = gateway({
      loadSuggestions: vi.fn(async () =>
        ok([
          suggestion("s-1", { feedback: "down" }),
          suggestion("s-2", { feedback: "up", accepted: true }),
          suggestion("s-3", { feedback: null }),
        ]),
      ),
    });
    const result = await newOutfitToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["s-1", "s-2", "s-3"]);
    expect(result).toMatchObject({ ok: true, value: { kind: "outfit", outfit: { suggestionId: "s-new", accepted: false }, weather: MILD } });
  });

  it("is today's outfit, not an idea: no purpose is sent", async () => {
    const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { accepted: true })])) });
    await newOutfitToday(g, DATE);
    expect((g.generateOutfit as ReturnType<typeof vi.fn>).mock.calls[0]).toHaveLength(2);
  });

  it("works when nothing was suggested yet", async () => {
    const g = gateway();
    await newOutfitToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, []);
  });

  it("reports when there is no other combination, not enough clothes, or an error", async () => {
    const exhausted = gateway({
      generateOutfit: vi.fn(async () => ok<GenerateOutfitResponse>({ status: "exhausted", reasoning: "All used.", weather: MILD })),
    });
    expect(await newOutfitToday(exhausted, DATE)).toEqual({ ok: true, value: { kind: "exhausted", reasoning: "All used.", weather: MILD } });
    expect(await newOutfitToday(gateway({ loadSuggestions: vi.fn(async () => err("denied")) }), DATE)).toEqual({ ok: false, error: GENERIC_ERROR });
    const g = gateway({ generateOutfit: vi.fn(async () => err("weather", 502)) });
    expect(await newOutfitToday(g, DATE)).toMatchObject({ ok: false, error: expect.stringMatching(/weather service/i) });
  });
});

describe("nextIdea (the Style Swipe deck)", () => {
  it("asks for an explore idea, skipping the ones already judged, and shows it like an outfit", async () => {
    const g = gateway();
    const result = await nextIdea(g, DATE, ["i-1", "i-2"]);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["i-1", "i-2"], "explore");
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "outfit", outfit: { suggestionId: "s-new", reasoning: "Cool today, so a warmer top." }, weather: MILD },
    });
  });

  it("shows an idea made of dirty clothes, but today's outfit still refuses them", async () => {
    const dirty = CLOSET.map((x) => ({ ...x, status: "dirty" as const }));
    expect(await nextIdea(gateway({}, dirty), DATE, [])).toMatchObject({ ok: true, value: { kind: "outfit" } });
    expect(await loadToday(gateway({}, dirty), DATE)).toEqual({ ok: false, error: "Could not load your outfit. Please try again." });
  });

  it("never asks the saved suggestions for today, and today's own requests carry no purpose", async () => {
    const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { feedback: "down" })])) });
    await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["s-1"]);
    expect(g.loadSuggestions).toHaveBeenCalledTimes(1);
    const calls = (g.generateOutfit as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.every((c) => c.length === 2)).toBe(true);
    await nextIdea(g, DATE, []);
    expect(g.loadSuggestions).toHaveBeenCalledTimes(1);
  });

  it("reports when the ideas run out or there are not enough clothes", async () => {
    const exhausted = gateway({
      generateOutfit: vi.fn(async () => ok<GenerateOutfitResponse>({ status: "exhausted", reasoning: "No more.", weather: MILD })),
    });
    expect(await nextIdea(exhausted, DATE, ["i-1"])).toEqual({ ok: true, value: { kind: "exhausted", reasoning: "No more.", weather: MILD } });
    const incomplete = gateway({
      generateOutfit: vi.fn(async () =>
        ok<GenerateOutfitResponse>({ status: "incomplete", missing_slots: ["shoes"], reasoning: "No shoes.", weather: MILD }),
      ),
    });
    expect(await nextIdea(incomplete, DATE, [])).toMatchObject({ ok: true, value: { kind: "incomplete", missing: ["shoes"] } });
  });

  it("sends at most the most recent ideas the server accepts", async () => {
    const g = gateway();
    const judged = Array.from({ length: MAX_EXCLUDED + 5 }, (_, i) => `i-${i}`);
    await nextIdea(g, DATE, judged);
    const sent = (g.generateOutfit as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(sent).toHaveLength(MAX_EXCLUDED);
    expect(sent[0]).toBe("i-5");
  });

  it("shows server errors", async () => {
    expect(await nextIdea(gateway({ generateOutfit: vi.fn(async () => err("weather", 502)) }), DATE, [])).toMatchObject({
      ok: false,
      error: expect.stringMatching(/weather service/i),
    });
  });
});

describe("judgeIdea (a swipe)", () => {
  it("sends a thumbs-up for a right swipe and a thumbs-down for a left swipe", async () => {
    const g = gateway();
    expect(await judgeIdea(g, "i-1", "up")).toEqual({ ok: true, value: true });
    expect(await judgeIdea(g, "i-2", "down")).toEqual({ ok: true, value: true });
    expect(g.sendFeedback).toHaveBeenNthCalledWith(1, "i-1", "up");
    expect(g.sendFeedback).toHaveBeenNthCalledWith(2, "i-2", "down");
  });

  it("does not treat 'already recorded' (409) as an error, but shows other errors", async () => {
    expect(await judgeIdea(gateway({ sendFeedback: vi.fn(async () => err("already", 409)) }), "i-1", "up")).toEqual({ ok: true, value: true });
    expect(await judgeIdea(gateway({ sendFeedback: vi.fn(async () => err("gone", 404)) }), "i-1", "up")).toMatchObject({ ok: false });
    expect(await judgeIdea(gateway({ sendFeedback: vi.fn(async () => { throw new Error("offline"); }) }), "i-1", "up")).toMatchObject({
      ok: false,
      error: expect.stringContaining("Could not reach"),
    });
  });
});

describe("rejectOutfit (No, show another)", () => {
  it("records the thumbs-down, then picks a different outfit that skips it", async () => {
    const calls: string[] = [];
    const g = gateway({
      sendFeedback: vi.fn(async () => (calls.push("feedback"), ok(null))),
      loadSuggestions: vi.fn(async () => (calls.push("load"), ok([suggestion("s-1", { feedback: "down" })]))),
      generateOutfit: vi.fn(async () => (calls.push("generate"), ok<GenerateOutfitResponse>(generated))),
    });
    const result = await rejectOutfit(g, DATE, "s-1");
    expect(calls).toEqual(["feedback", "load", "generate"]);
    expect(g.sendFeedback).toHaveBeenCalledWith("s-1", "down");
    expect(g.generateOutfit).toHaveBeenCalledWith(DATE, ["s-1"]);
    expect(result).toMatchObject({ ok: true, value: { kind: "outfit" } });
  });

  it("carries on when the thumbs-down was already recorded (409)", async () => {
    const g = gateway({ sendFeedback: vi.fn(async () => err("already recorded", 409)) });
    expect(await rejectOutfit(g, DATE, "s-1")).toMatchObject({ ok: true });
    expect(g.generateOutfit).toHaveBeenCalled();
  });

  it("stops and shows the error when the thumbs-down cannot be sent", async () => {
    const g = gateway({ sendFeedback: vi.fn(async () => err("not found", 404)) });
    expect(await rejectOutfit(g, DATE, "s-1")).toMatchObject({ ok: false, error: expect.stringMatching(/profile could not be found/i) });
    expect(g.generateOutfit).not.toHaveBeenCalled();
  });

  it("reports a network failure", async () => {
    const g = gateway({ sendFeedback: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await rejectOutfit(g, DATE, "s-1")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("wearOutfit (Yes, wear this)", () => {
  it("marks the garments as worn, then sends the thumbs-up", async () => {
    const calls: string[] = [];
    const g = gateway({
      acceptSuggestion: vi.fn(async () => (calls.push("accept"), ok(null))),
      sendFeedback: vi.fn(async () => (calls.push("feedback"), ok(null))),
    });
    expect(await wearOutfit(g, "s-1")).toEqual({ ok: true, value: true });
    expect(calls).toEqual(["accept", "feedback"]);
    expect(g.acceptSuggestion).toHaveBeenCalledWith("s-1");
    expect(g.sendFeedback).toHaveBeenCalledWith("s-1", "up");
  });

  it("does not send a thumbs-up when marking as worn failed", async () => {
    const g = gateway({ acceptSuggestion: vi.fn(async () => err("suggestion not found")) });
    expect(await wearOutfit(g, "s-1")).toEqual({ ok: false, error: GENERIC_ERROR });
    expect(g.sendFeedback).not.toHaveBeenCalled();
  });

  it("still succeeds when the thumbs-up fails, because the outfit is already marked as worn", async () => {
    for (const sendFeedback of [
      vi.fn(async () => err("weather", 502)),
      vi.fn(async () => { throw new Error("offline"); }),
    ]) {
      expect(await wearOutfit(gateway({ sendFeedback }), "s-1")).toEqual({ ok: true, value: true });
    }
  });

  it("reports a network failure while marking as worn", async () => {
    const g = gateway({ acceptSuggestion: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await wearOutfit(g, "s-1")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("outfits with a dress or a layer", () => {
  const DRESS = garment("g-dress", { type: "dress", color: "pink", season: "summer", warmth: 2 });
  const JACKET = garment("g-jacket", { type: "jacket", color: "gray", warmth: 4 });
  const HOODIE = garment("g-hoodie", { type: "hoodie", color: "black", warmth: 3 });
  const TEE = garment("g-tee", { type: "t_shirt", color: "white", warmth: 1 });
  const closet = [TOP, BOTTOM, SHOES, DRESS, JACKET, HOODIE, TEE];
  const answer = (outfit: GenerateOutfitResponse extends infer R ? (R extends { outfit: infer O } ? O : never) : never) =>
    ok<GenerateOutfitResponse>({ status: "ok", suggestion_id: "s-x", outfit, score: 0.5, reasoning: "Because.", weather: MILD });
  const shown = async (outfit: Parameters<typeof answer>[0]) => {
    const g = gateway({ generateOutfit: vi.fn(async () => answer(outfit)) }, closet);
    const result = await loadToday(g, DATE);
    if (!result.ok || result.value.kind !== "outfit") throw new Error(JSON.stringify(result));
    return { items: result.value.outfit.items, g };
  };

  it("shows a dress with shoes as two pieces, and asks the database for exactly those garments", async () => {
    const { items, g } = await shown({ dress: "g-dress", shoes: "g-shoes" });
    expect(items.map((i) => [i.slot, i.label, i.id])).toEqual([["dress", "Dress", "g-dress"], ["shoes", "Shoes", "g-shoes"]]);
    expect(g.loadGarments).toHaveBeenCalledWith(["g-dress", "g-shoes"]);
  });

  it("shows a jacket first, labeled by what it is, above the top, bottom and shoes", async () => {
    const { items } = await shown({ top: "g-top", bottom: "g-bottom", shoes: "g-shoes", layer: "g-jacket" });
    expect(items.map((i) => [i.slot, i.label])).toEqual([["layer", "Jacket"], ["top", "Top"], ["bottom", "Bottom"], ["shoes", "Shoes"]]);
  });

  it("shows a hoodie over a t-shirt as the layer, and a jacket over a dress", async () => {
    const hoodie = await shown({ top: "g-tee", bottom: "g-bottom", shoes: "g-shoes", layer: "g-hoodie" });
    expect(hoodie.items.map((i) => [i.slot, i.label, i.id])).toEqual([
      ["layer", "Hoodie", "g-hoodie"], ["top", "Top", "g-tee"], ["bottom", "Bottom", "g-bottom"], ["shoes", "Shoes", "g-shoes"],
    ]);
    const dress = await shown({ dress: "g-dress", shoes: "g-shoes", layer: "g-jacket" });
    expect(dress.items.map((i) => i.slot)).toEqual(["layer", "dress", "shoes"]);
  });

  it("marks which pieces go to the laundry: not the shoes, not the jacket", async () => {
    const { items } = await shown({ top: "g-top", bottom: "g-bottom", shoes: "g-shoes", layer: "g-jacket" });
    expect(Object.fromEntries(items.map((i) => [i.slot, i.goesToLaundry]))).toEqual({ layer: false, top: true, bottom: true, shoes: false });
    const hoodie = await shown({ top: "g-tee", bottom: "g-bottom", shoes: "g-shoes", layer: "g-hoodie" });
    expect(hoodie.items.find((i) => i.slot === "layer")!.goesToLaundry).toBe(true);
  });

  it("reopens a saved outfit with a layer or a dress the same way, without generating a new one", async () => {
    for (const ids of [["g-top", "g-bottom", "g-shoes", "g-jacket"], ["g-dress", "g-shoes"], ["g-dress", "g-shoes", "g-jacket"]]) {
      const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { garment_ids: ids })])) }, closet);
      const result = await loadToday(g, DATE);
      expect(g.generateOutfit).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: true, value: { kind: "outfit" } });
      if (result.ok && result.value.kind === "outfit") expect(result.value.outfit.items.map((i) => i.id).sort()).toEqual([...ids].sort());
    }
  });

  it("makes a new outfit when a piece of the saved one was deleted, instead of showing it with a hole", async () => {
    const withoutJacket = closet.filter((c) => c.id !== "g-jacket");
    const g = gateway(
      { loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { garment_ids: ["g-top", "g-bottom", "g-shoes", "g-jacket"] })])) },
      withoutJacket,
    );
    await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalled();
  });

  it("makes a new outfit when the saved garments do not form an outfit, or a piece went to the laundry", async () => {
    const odd = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { garment_ids: ["g-dress", "g-top", "g-shoes"] })])) }, closet);
    await loadToday(odd, DATE);
    expect(odd.generateOutfit).toHaveBeenCalled();
    const dirtyJacket = closet.map((c) => (c.id === "g-jacket" ? { ...c, status: "dirty" as const } : c));
    const g = gateway({ loadSuggestions: vi.fn(async () => ok([suggestion("s-1", { garment_ids: ["g-top", "g-bottom", "g-shoes", "g-jacket"] })])) }, dirtyJacket);
    await loadToday(g, DATE);
    expect(g.generateOutfit).toHaveBeenCalled();
  });
});

describe("the message after wearing an outfit", () => {
  const item = (slot: "layer" | "dress" | "top" | "bottom" | "shoes", label: string, goesToLaundry: boolean) => ({
    id: label, slot, label, name: label, detail: "", photoUrl: null, goesToLaundry,
  });

  it("names exactly the pieces that go to the laundry", () => {
    expect(wornMessage()).toBe("Wearing this today. The top and bottom are now dirty.");
    expect(wornMessage([item("top", "Top", true), item("bottom", "Bottom", true), item("shoes", "Shoes", false)])).toBe(
      "Wearing this today. The top and bottom are now dirty.",
    );
    expect(wornMessage([item("layer", "Jacket", false), item("dress", "Dress", true), item("shoes", "Shoes", false)])).toBe(
      "Wearing this today. The dress is now dirty.",
    );
    expect(wornMessage([item("layer", "Hoodie", true), item("top", "Top", true), item("bottom", "Bottom", true), item("shoes", "Shoes", false)])).toBe(
      "Wearing this today. The hoodie, top and bottom are now dirty.",
    );
  });

  it("says nothing about the laundry when nothing goes there", () => {
    expect(wornMessage([item("shoes", "Shoes", false), item("layer", "Coat", false)])).toBe("Wearing this today.");
  });
});
