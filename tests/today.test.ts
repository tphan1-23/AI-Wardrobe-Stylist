import { describe, expect, it, vi } from "vitest";
import type { GatewayResult } from "../frontend/src/services/household.ts";
import {
  MAX_EXCLUDED,
  formatToday,
  friendlyTodayError,
  garmentDetail,
  garmentName,
  loadToday,
  rejectOutfit,
  todayString,
  wearOutfit,
  type GarmentRow,
  type SuggestionRow,
  type TodayGateway,
} from "../frontend/src/services/today.ts";
import { GARMENT_TYPES, WARMTH_MAX, WARMTH_MIN } from "../supabase/functions/_shared/tag-schema.ts";
import type { GenerateOutfitResponse } from "../supabase/functions/_shared/types.ts";

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

const generated: GenerateOutfitResponse = {
  status: "ok",
  suggestion_id: "s-new",
  outfit: { top: "g-top", bottom: "g-bottom", shoes: "g-shoes" },
  score: 0.5,
  reasoning: "Cool today, so a warmer top.",
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

  it("passes other messages through", () => {
    expect(friendlyTodayError({ message: "Something odd", status: 500 })).toBe("Something odd");
    expect(friendlyTodayError({ message: "Something odd" })).toBe("Something odd");
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
          items: {
            top: { id: "g-top", slot: "top", name: "White t-shirt", detail: "All seasons · Medium", photoUrl: "https://photos/user-1/g-top.jpg" },
            bottom: { id: "g-bottom", slot: "bottom", name: "Blue jeans", detail: "Fall · Warm", photoUrl: "https://photos/user-1/g-bottom.jpg" },
            shoes: { id: "g-shoes", slot: "shoes", name: "Black sneakers", detail: "All seasons · Light", photoUrl: "https://photos/user-1/g-shoes.jpg" },
          },
        },
      },
    });
  });

  it("reports which slots have nothing clean to wear", async () => {
    const g = gateway({
      generateOutfit: vi.fn(async () =>
        ok<GenerateOutfitResponse>({ status: "incomplete", missing_slots: ["shoes"], reasoning: "No clean shoes available." }),
      ),
    });
    expect(await loadToday(g, DATE)).toEqual({
      ok: true,
      value: { kind: "incomplete", missing: ["shoes"], reasoning: "No clean shoes available." },
    });
  });

  it("reports when every combination was already rejected", async () => {
    const g = gateway({
      generateOutfit: vi.fn(async () => ok<GenerateOutfitResponse>({ status: "exhausted", reasoning: "All rejected." })),
    });
    expect(await loadToday(g, DATE)).toEqual({ ok: true, value: { kind: "exhausted", reasoning: "All rejected." } });
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
        expect(result.value.outfit.items.top.photoUrl).toBeNull();
      }
    }
  });

  it("shows the error when the new outfit's garments cannot be read", async () => {
    const g = gateway({ loadGarments: vi.fn(async () => err("denied")) });
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: "denied" });
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
      value: { kind: "outfit", outfit: { suggestionId: "s-1", accepted: false, reasoning: null } },
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
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: "permission denied" });
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
    expect(await loadToday(g, DATE)).toEqual({ ok: false, error: "denied" });
  });

  it("reports network failures and empty answers", async () => {
    const down = gateway({ loadSuggestions: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await loadToday(down, DATE)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    const empty = gateway({ generateOutfit: vi.fn(async () => ({ data: null, error: null })) });
    expect(await loadToday(empty, DATE)).toMatchObject({ ok: false, error: expect.stringContaining("no data") });
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
    expect(await wearOutfit(g, "s-1")).toEqual({ ok: false, error: "suggestion not found" });
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
