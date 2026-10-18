import { describe, expect, it, vi } from "vitest";
import {
  CATEGORY_OPTIONS,
  DEFAULT_FILTERS,
  OWNER_OPTIONS,
  STATUS_OPTIONS,
  countLabel,
  deleteItem,
  filterItems,
  friendlyClosetError,
  isMine,
  loadCloset,
  ownerBadge,
  ownerName,
  saveEdits,
  type ClosetGateway,
  type ClosetRow,
} from "../frontend/src/services/closet.ts";
import { draftFromTags, emptyDraft } from "../frontend/src/services/garment.ts";
import type { GatewayResult, MemberRow } from "../frontend/src/services/household.ts";

const ok = <T>(data: T): GatewayResult<T> => ({ data, error: null });
const err = (message: string): GatewayResult<never> => ({ data: null, error: { message } });

const ME = "user-me";
const row = (id: string, overrides: Partial<ClosetRow> = {}): ClosetRow => ({
  id,
  owner_id: ME,
  type: "t_shirt",
  color: "white",
  season: "all",
  warmth: 2,
  status: "clean",
  image_path: `${overrides.owner_id ?? ME}/${id}.jpg`,
  created_at: "2026-10-01T10:00:00Z",
  ...overrides,
});

const MEMBERS: MemberRow[] = [
  { id: ME, name: "Thanh" },
  { id: "user-ben", name: "ben" },
  { id: "user-blank", name: "  " },
];

function gateway(overrides: Partial<ClosetGateway> = {}, rows: ClosetRow[] = []): ClosetGateway {
  return {
    loadGarments: vi.fn(async () => ok(rows)),
    signPhotos: vi.fn(async (paths: string[]) => ok(Object.fromEntries(paths.map((p) => [p, `https://photos/${p}`])))),
    updateGarment: vi.fn(async () => ok([{ id: "x" }])),
    deleteGarment: vi.fn(async () => ok([{ id: "x" }])),
    removePhoto: vi.fn(async () => ok(null)),
    ...overrides,
  };
}

const closet = [
  row("tee", { type: "t_shirt", created_at: "2026-10-03T10:00:00Z" }),
  row("jeans", { type: "jeans", status: "dirty", created_at: "2026-10-02T10:00:00Z" }),
  row("boots", { type: "boots", owner_id: "user-ben", created_at: "2026-10-04T10:00:00Z" }),
  row("coat", { type: "coat", owner_id: "user-ben", status: "dirty", created_at: "2026-10-01T10:00:00Z" }),
];

describe("filters", () => {
  const ids = (filters: Partial<typeof DEFAULT_FILTERS>) =>
    filterItems(closet, { ...DEFAULT_FILTERS, ...filters }, ME).map((i) => i.id);

  it("shows everything by default", () => {
    expect(ids({})).toEqual(["tee", "jeans", "boots", "coat"]);
  });

  it("filters by category using the outfit slots, with dresses and coats under Other", () => {
    expect(ids({ category: "top" })).toEqual(["tee"]);
    expect(ids({ category: "bottom" })).toEqual(["jeans"]);
    expect(ids({ category: "shoes" })).toEqual(["boots"]);
    expect(ids({ category: "other" })).toEqual(["coat"]);
  });

  it("filters by clean or dirty", () => {
    expect(ids({ status: "clean" })).toEqual(["tee", "boots"]);
    expect(ids({ status: "dirty" })).toEqual(["jeans", "coat"]);
  });

  it("filters by whose garment it is", () => {
    expect(ids({ owner: "mine" })).toEqual(["tee", "jeans"]);
    expect(ids({ owner: "others" })).toEqual(["boots", "coat"]);
  });

  it("combines filters", () => {
    expect(ids({ owner: "others", status: "dirty" })).toEqual(["coat"]);
    expect(ids({ category: "top", status: "dirty" })).toEqual([]);
  });

  it("offers the same choices as the design board", () => {
    expect(CATEGORY_OPTIONS.map((o) => o.label)).toEqual(["All", "Tops", "Bottoms", "Shoes", "Other"]);
    expect(STATUS_OPTIONS.map((o) => o.label)).toEqual(["All", "Clean", "Dirty"]);
    expect(OWNER_OPTIONS.map((o) => o.label)).toEqual(["All", "Mine", "Others"]);
  });
});

describe("labels", () => {
  it("counts items", () => {
    expect(countLabel(0)).toBe("0 items");
    expect(countLabel(1)).toBe("1 item");
    expect(countLabel(12)).toBe("12 items");
  });

  it("knows which garments are the person's own", () => {
    expect(isMine({ owner_id: ME }, ME)).toBe(true);
    expect(isMine({ owner_id: "user-ben" }, ME)).toBe(false);
  });

  it("badges a tile with M for the person's own garments, else the owner's initial", () => {
    expect(ownerBadge({ owner_id: ME }, ME, MEMBERS)).toBe("M");
    expect(ownerBadge({ owner_id: "user-ben" }, ME, MEMBERS)).toBe("B");
    expect(ownerBadge({ owner_id: "user-blank" }, ME, MEMBERS)).toBe("?");
    expect(ownerBadge({ owner_id: "someone-unknown" }, ME, MEMBERS)).toBe("?");
  });

  it("names the owner in plain words", () => {
    expect(ownerName({ owner_id: ME }, ME, MEMBERS)).toBe("You");
    expect(ownerName({ owner_id: "user-ben" }, ME, MEMBERS)).toBe("ben");
    expect(ownerName({ owner_id: "user-blank" }, ME, MEMBERS)).toBe("A household member");
    expect(ownerName({ owner_id: "someone-unknown" }, ME, MEMBERS)).toBe("A household member");
  });

  it("explains database refusals in plain words", () => {
    expect(friendlyClosetError("garment not found or not yours")).toMatch(/belong to someone else/i);
    expect(friendlyClosetError('violates row-level security policy for table "garments"')).toMatch(/belong to someone else/i);
    expect(friendlyClosetError("JWT expired")).toMatch(/session expired/i);
    expect(friendlyClosetError("not authenticated")).toMatch(/session expired/i);
    expect(friendlyClosetError("Something odd")).toBe("Something odd");
  });
});

describe("loadCloset", () => {
  it("lists newest first, each with its photo link", async () => {
    const g = gateway({}, closet);
    const result = await loadCloset(g);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.map((i) => i.id)).toEqual(["boots", "tee", "jeans", "coat"]);
    expect(result.value[0]!.photoUrl).toBe("https://photos/user-ben/boots.jpg");
    expect(g.signPhotos).toHaveBeenCalledWith(closet.map((r) => r.image_path));
  });

  it("does not change the rows it was given", async () => {
    const rows = [...closet];
    await loadCloset(gateway({}, rows));
    expect(rows.map((r) => r.id)).toEqual(["tee", "jeans", "boots", "coat"]);
  });

  it("shows an empty closet", async () => {
    expect(await loadCloset(gateway())).toEqual({ ok: true, value: [] });
  });

  it("still lists the garments when photo links cannot be made", async () => {
    for (const signPhotos of [
      vi.fn(async () => err("storage down")),
      vi.fn(async () => ok<Record<string, string>>({})),
      vi.fn(async () => { throw new Error("offline"); }),
    ]) {
      const result = await loadCloset(gateway({ signPhotos }, closet));
      expect(result).toMatchObject({ ok: true });
      if (result.ok) expect(result.value.every((i) => i.photoUrl === null)).toBe(true);
    }
  });

  it("shows a server error and reports network failures", async () => {
    expect(await loadCloset(gateway({ loadGarments: vi.fn(async () => err("denied")) }))).toEqual({ ok: false, error: "denied" });
    const down = gateway({ loadGarments: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await loadCloset(down)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
    const empty = gateway({ loadGarments: vi.fn(async () => ({ data: null, error: null })) });
    expect(await loadCloset(empty)).toMatchObject({ ok: false, error: expect.stringContaining("no data") });
  });
});

describe("saveEdits", () => {
  const draft = draftFromTags({ type: "jeans", color: "blue", season: "fall", warmth: 4 });

  it("saves the edited tags together with the clean or dirty status", async () => {
    const g = gateway();
    const result = await saveEdits(g, "g-1", draft, "dirty");
    const changes = { type: "jeans", color: "blue", season: "fall", warmth: 4, status: "dirty" };
    expect(result).toEqual({ ok: true, value: changes });
    expect(g.updateGarment).toHaveBeenCalledWith("g-1", changes);
  });

  it("will not save with a tag missing", async () => {
    const g = gateway();
    expect(await saveEdits(g, "g-1", emptyDraft(), "clean")).toEqual({ ok: false, error: "Choose every tag before saving." });
    expect(await saveEdits(g, "g-1", { ...draft, color: null }, "clean")).toMatchObject({ ok: false });
    expect(g.updateGarment).not.toHaveBeenCalled();
  });

  it("says so when the garment is not the person's own", async () => {
    const g = gateway({ updateGarment: vi.fn(async () => err("garment not found or not yours")) });
    expect(await saveEdits(g, "g-1", draft, "clean")).toMatchObject({ ok: false, error: expect.stringMatching(/belong to someone else/i) });
  });

  it("reports network failures", async () => {
    const g = gateway({ updateGarment: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await saveEdits(g, "g-1", draft, "clean")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("deleteItem", () => {
  const item = { id: "g-1", image_path: "user-me/g-1.jpg" };

  it("deletes the garment first, then its photo", async () => {
    const calls: string[] = [];
    const g = gateway({
      deleteGarment: vi.fn(async () => (calls.push("garment"), ok([{ id: "g-1" }]))),
      removePhoto: vi.fn(async () => (calls.push("photo"), ok(null))),
    });
    expect(await deleteItem(g, item)).toEqual({ ok: true, value: true });
    expect(calls).toEqual(["garment", "photo"]);
    expect(g.deleteGarment).toHaveBeenCalledWith("g-1");
    expect(g.removePhoto).toHaveBeenCalledWith("user-me/g-1.jpg");
  });

  it("keeps the photo when the garment could not be deleted", async () => {
    const g = gateway({ deleteGarment: vi.fn(async () => err("garment not found or not yours")) });
    expect(await deleteItem(g, item)).toMatchObject({ ok: false });
    expect(g.removePhoto).not.toHaveBeenCalled();
  });

  it("succeeds even when the photo cannot be removed, because the garment is gone", async () => {
    for (const removePhoto of [vi.fn(async () => err("storage down")), vi.fn(async () => { throw new Error("offline"); })]) {
      expect(await deleteItem(gateway({ removePhoto }), item)).toEqual({ ok: true, value: true });
    }
  });

  it("reports a network failure while deleting", async () => {
    const g = gateway({ deleteGarment: vi.fn(async () => { throw new Error("offline"); }) });
    expect(await deleteItem(g, item)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});
