import { describe, expect, it, vi } from "vitest";
import {
  HISTORY_DAYS,
  daysAgo,
  dayLabel,
  groupByDay,
  historySince,
  loadFavoriteOutfits,
  loadHistory,
  setOutfitFavorite,
  type HistoryGateway,
  type OutfitEntry,
  type OutfitRow,
} from "../frontend/src/services/history.ts";
import type { GatewayResult } from "../frontend/src/services/household.ts";
import type { GarmentRow } from "../frontend/src/services/today.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string): GatewayResult<never> => ({ data: null, error: { message } });

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

const TOP = garment("g-top");
const BOTTOM = garment("g-bottom", { type: "jeans", color: "blue" });
const SHOES = garment("g-shoes", { type: "sneakers", color: "black" });
const COAT = garment("g-coat", { type: "coat", color: "gray" });

const outfit = (id: string, date: string, overrides: Partial<OutfitRow> = {}): OutfitRow => ({
  id,
  date,
  garment_ids: ["g-top", "g-bottom", "g-shoes"],
  favorite: false,
  created_at: `${date}T08:00:00Z`,
  ...overrides,
});

// A Sunday afternoon: Oct 18, 2026.
const NOW = new Date(2026, 9, 18, 15, 0);

function gateway(overrides: Partial<HistoryGateway> = {}, rows: OutfitRow[] = [], closet: GarmentRow[] = [TOP, BOTTOM, SHOES, COAT]): HistoryGateway {
  return {
    loadWorn: vi.fn(async () => ok(rows)),
    loadFavoriteOutfits: vi.fn(async () => ok(rows)),
    loadGarments: vi.fn(async (ids: string[]) => ok(closet.filter((g) => ids.includes(g.id)))),
    signPhotos: vi.fn(async (paths: string[]) => ok(Object.fromEntries(paths.map((p) => [p, `https://photos/${p}`])))),
    setFavorite: vi.fn(async () => ok([{ id: "x" }])),
    ...overrides,
  };
}

describe("days", () => {
  it("counts back by calendar day, across month and year ends", () => {
    expect(daysAgo(NOW, 0)).toBe("2026-10-18");
    expect(daysAgo(NOW, 1)).toBe("2026-10-17");
    expect(daysAgo(new Date(2026, 2, 2), 3)).toBe("2026-02-27");
    expect(daysAgo(new Date(2026, 0, 2), 5)).toBe("2025-12-28");
  });

  it("covers today and the six days before it", () => {
    expect(HISTORY_DAYS).toBe(7);
    expect(historySince(NOW)).toBe("2026-10-12");
    expect(historySince(new Date(2026, 0, 3))).toBe("2025-12-28");
    expect(historySince()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("labels days in plain words", () => {
    expect(dayLabel("2026-10-18", NOW)).toBe("Today");
    expect(dayLabel("2026-10-17", NOW)).toBe("Yesterday");
    expect(dayLabel("2026-10-16", NOW)).toBe("Fri, Oct 16");
    expect(dayLabel("2026-10-12", NOW)).toBe("Mon, Oct 12");
    expect(dayLabel("2026-10-18")).toMatch(/^(Today|Yesterday|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2})$/);
  });

  it("groups neighbouring outfits of the same day under one label", () => {
    const e = (id: string, date: string): OutfitEntry => ({ id, date, favorite: false, pieces: [], removed: 0 });
    const groups = groupByDay([e("a", "2026-10-18"), e("b", "2026-10-18"), e("c", "2026-10-16")], NOW);
    expect(groups.map((g) => [g.label, g.entries.map((x) => x.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Fri, Oct 16", ["c"]],
    ]);
    expect(groupByDay([], NOW)).toEqual([]);
    expect(groupByDay([e("a", "2026-10-18")])[0]!.entries).toHaveLength(1);
  });
});

describe("loadHistory", () => {
  it("asks for the accepted outfits of the last 7 days and shows each with names and photos, top first", async () => {
    const rows = [outfit("s-2", "2026-10-18", { garment_ids: ["g-shoes", "g-top", "g-bottom"] }), outfit("s-1", "2026-10-15", { favorite: true })];
    const g = gateway({}, rows);
    const result = await loadHistory(g, NOW);

    expect(g.loadWorn).toHaveBeenCalledWith("2026-10-12");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((e) => [e.id, e.favorite, e.removed])).toEqual([["s-2", false, 0], ["s-1", true, 0]]);
    expect(result.value[0]!.pieces).toEqual([
      { garmentId: "g-top", slot: "top", name: "White t-shirt", photoUrl: "https://photos/u/g-top.jpg" },
      { garmentId: "g-bottom", slot: "bottom", name: "Blue jeans", photoUrl: "https://photos/u/g-bottom.jpg" },
      { garmentId: "g-shoes", slot: "shoes", name: "Black sneakers", photoUrl: "https://photos/u/g-shoes.jpg" },
    ]);
  });

  it("loads the garments and photos once for all the outfits", async () => {
    const g = gateway({}, [outfit("a", "2026-10-18"), outfit("b", "2026-10-17")]);
    await loadHistory(g, NOW);
    expect(g.loadGarments).toHaveBeenCalledTimes(1);
    expect(g.signPhotos).toHaveBeenCalledTimes(1);
    expect((g.loadGarments as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toEqual(["g-top", "g-bottom", "g-shoes"]);
  });

  it("shows no outfits when nothing was worn, without asking for any garments", async () => {
    const g = gateway({}, []);
    expect(await loadHistory(g, NOW)).toEqual({ ok: true, value: [] });
    expect(g.loadGarments).not.toHaveBeenCalled();
  });

  it("keeps an outfit whose garments were deleted, and says how many are gone", async () => {
    const g = gateway({}, [outfit("s-1", "2026-10-18")], [TOP]);
    const result = await loadHistory(g, NOW);
    expect(result).toMatchObject({ ok: true, value: [{ id: "s-1", removed: 2, pieces: [{ garmentId: "g-top" }] }] });
  });

  it("keeps an outfit with no garments left at all", async () => {
    const g = gateway({}, [outfit("s-1", "2026-10-18")], []);
    expect(await loadHistory(g, NOW)).toMatchObject({ ok: true, value: [{ id: "s-1", pieces: [], removed: 3 }] });
  });

  it("puts garments that are not a top, bottom or shoes last", async () => {
    const g = gateway({}, [outfit("s-1", "2026-10-18", { garment_ids: ["g-coat", "g-shoes", "g-top"] })]);
    const result = await loadHistory(g, NOW);
    expect(result.ok && result.value[0]!.pieces.map((p) => p.garmentId)).toEqual(["g-top", "g-shoes", "g-coat"]);
  });

  it("still lists the outfits when photo links cannot be made", async () => {
    for (const signPhotos of [
      vi.fn(async () => err("storage down")),
      vi.fn(async () => ok<Record<string, string>>({})),
      vi.fn(async () => { throw new Error("offline"); }),
    ]) {
      const result = await loadHistory(gateway({ signPhotos }, [outfit("s-1", "2026-10-18")]), NOW);
      expect(result).toMatchObject({ ok: true });
      if (result.ok) expect(result.value[0]!.pieces.every((p) => p.photoUrl === null)).toBe(true);
    }
  });

  it("shows server errors, explains a lost session, and reports network failures", async () => {
    expect(await loadHistory(gateway({ loadWorn: vi.fn(async () => err("denied")) }), NOW)).toEqual({ ok: false, error: "denied" });
    expect(await loadHistory(gateway({ loadWorn: vi.fn(async () => err("JWT expired")) }), NOW)).toEqual({
      ok: false,
      error: "Your session expired. Please sign in again.",
    });
    expect(await loadHistory(gateway({ loadWorn: vi.fn(async () => err("not authenticated")) }), NOW)).toMatchObject({ ok: false });
    expect(await loadHistory(gateway({ loadWorn: vi.fn(async () => { throw new Error("offline"); }) }), NOW)).toMatchObject({
      ok: false,
      error: expect.stringContaining("Could not reach"),
    });
    expect(await loadHistory(gateway({ loadWorn: vi.fn(async () => ({ data: null, error: null })) }), NOW)).toMatchObject({
      ok: false,
      error: expect.stringContaining("no data"),
    });
    expect(await loadHistory(gateway({ loadGarments: vi.fn(async () => err("garments denied")) }, [outfit("a", "2026-10-18")]), NOW)).toEqual({
      ok: false,
      error: "garments denied",
    });
  });
});

describe("loadFavoriteOutfits", () => {
  it("lists the favorite outfits with their garments", async () => {
    const g = gateway({}, [outfit("s-1", "2026-09-30", { favorite: true })]);
    const result = await loadFavoriteOutfits(g);
    expect(g.loadFavoriteOutfits).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, value: [{ id: "s-1", favorite: true, pieces: [{ slot: "top" }, { slot: "bottom" }, { slot: "shoes" }] }] });
  });

  it("shows an error from the server", async () => {
    expect(await loadFavoriteOutfits(gateway({ loadFavoriteOutfits: vi.fn(async () => err("denied")) }))).toEqual({ ok: false, error: "denied" });
  });
});

describe("setOutfitFavorite", () => {
  it("adds an outfit to the favorites and removes it again", async () => {
    const g = gateway();
    expect(await setOutfitFavorite(g, "s-1", true)).toEqual({ ok: true, value: true });
    expect(await setOutfitFavorite(g, "s-1", false)).toEqual({ ok: true, value: true });
    expect(g.setFavorite).toHaveBeenNthCalledWith(1, "s-1", true);
    expect(g.setFavorite).toHaveBeenNthCalledWith(2, "s-1", false);
  });

  it("shows the error when it is refused, and reports network failures", async () => {
    expect(await setOutfitFavorite(gateway({ setFavorite: vi.fn(async () => err("outfit not found or not yours")) }), "s-1", true)).toEqual({
      ok: false,
      error: "outfit not found or not yours",
    });
    expect(await setOutfitFavorite(gateway({ setFavorite: vi.fn(async () => { throw new Error("offline"); }) }), "s-1", true)).toMatchObject({
      ok: false,
      error: expect.stringContaining("Could not reach"),
    });
  });
});
