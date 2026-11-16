import { describe, expect, it } from "vitest";
import {
  LAUNDRY_EXEMPT_TYPES,
  LIGHT_TOP_TYPES,
  OUTERWEAR_TYPES,
  OVER_TOP_TYPES,
  ROLE_LABELS,
  ROLE_ORDER,
  baseRole,
  goesToLaundry,
  outfitIds,
  rolesOf,
  type RolePiece,
} from "../supabase/functions/_shared/outfit.ts";
import { LAYER_AT_OR_BELOW_C, layerReason, scoreOutfit, type OutfitInput } from "../supabase/functions/_shared/scoring.ts";
import { GARMENT_TYPES, slotForType, type GarmentType } from "../supabase/functions/_shared/tag-schema.ts";
import type { Garment, WeatherSnapshot } from "../supabase/functions/_shared/types.ts";

let n = 0;
function g(id: string, type: GarmentType, extra: Partial<Garment> = {}): Garment {
  n += 1;
  return {
    id, owner_id: "u", image_path: `u/${n}.jpg`, type, colors: ["gray"], seasons: ["all"], warmth: 2,
    status: "clean", last_worn_date: null, ...extra,
  };
}
const piece = (id: string, type: GarmentType, warmth = 2): RolePiece => ({ id, type, warmth });

const WARM: WeatherSnapshot = { temp_c: 26, feels_like_c: 26, is_precipitating: false };
const COOL: WeatherSnapshot = { temp_c: 10, feels_like_c: 10, is_precipitating: false };
const RAIN_WARM: WeatherSnapshot = { temp_c: 24, feels_like_c: 24, is_precipitating: true };
const RAIN_COOL: WeatherSnapshot = { temp_c: 8, feels_like_c: 8, is_precipitating: true };

const input = (garments: Garment[], over: Partial<OutfitInput> = {}): OutfitInput => ({
  garments, weather: WARM, preferences: [], tempComfort: "neutral", date: "2026-10-05", ...over,
});
const ok = (r: ReturnType<typeof scoreOutfit>) => {
  if (r.status !== "ok") throw new Error(`expected ok, got ${r.status}: ${r.reasoning}`);
  return r;
};

describe("outfit roles", () => {
  it("gives every garment type a role, and accessories none", () => {
    for (const type of GARMENT_TYPES) {
      const role = baseRole(type);
      if (type === "accessory") expect(role).toBeNull();
      else expect(["top", "bottom", "shoes", "dress", "layer", "tights"]).toContain(role);
    }
    expect(baseRole("dress")).toBe("dress");
    expect(baseRole("jacket")).toBe("layer");
    expect(baseRole("coat")).toBe("layer");
    expect(baseRole("hoodie")).toBe("top");
    expect(baseRole("sweater")).toBe("top");
    expect(baseRole("jeans")).toBe("bottom");
    expect(baseRole("skirt")).toBe("bottom");
    expect(baseRole("boots")).toBe("shoes");
    expect(baseRole("tights")).toBe("tights");
    expect(baseRole("leggings")).toBe("bottom"); // leggings are worn as trousers; tights are the under-layer
  });

  it("only uses garment types that exist", () => {
    for (const t of [...OUTERWEAR_TYPES, ...OVER_TOP_TYPES, ...LIGHT_TOP_TYPES]) expect(GARMENT_TYPES).toContain(t);
    // A hoodie or sweater is never also a light top, and a light top is always a top.
    for (const t of OVER_TOP_TYPES) expect(LIGHT_TOP_TYPES).not.toContain(t);
    for (const t of LIGHT_TOP_TYPES) expect(slotForType(t)).toBe("top");
  });

  it("labels and orders every role, outer layer first and shoes last", () => {
    expect([...ROLE_ORDER]).toEqual(["layer", "dress", "top", "bottom", "tights", "shoes"]);
    for (const role of ROLE_ORDER) expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
  });

  it("does not send shoes or outerwear to the laundry after one wear, but everything else", () => {
    expect([...LAUNDRY_EXEMPT_TYPES].sort()).toEqual(["boots", "coat", "dress_shoes", "jacket", "sandals", "sneakers"]);
    expect(goesToLaundry("jacket")).toBe(false);
    expect(goesToLaundry("coat")).toBe(false);
    expect(goesToLaundry("sneakers")).toBe(false);
    for (const t of ["t_shirt", "hoodie", "sweater", "jeans", "dress", "skirt"] as GarmentType[]) expect(goesToLaundry(t)).toBe(true);
  });
});

describe("rolesOf (what each garment of a saved outfit is)", () => {
  const roles = (pieces: RolePiece[]) => {
    const r = rolesOf(pieces);
    return r === null ? null : Object.fromEntries(r);
  };

  it("accepts the classic outfit", () => {
    expect(roles([piece("a", "t_shirt"), piece("b", "jeans"), piece("c", "sneakers")])).toEqual({ a: "top", b: "bottom", c: "shoes" });
  });

  it("accepts a dress with shoes, and a jacket or coat on top of either kind of outfit", () => {
    expect(roles([piece("d", "dress"), piece("s", "sandals")])).toEqual({ d: "dress", s: "shoes" });
    expect(roles([piece("d", "dress"), piece("s", "boots"), piece("j", "jacket")])).toEqual({ d: "dress", s: "shoes", j: "layer" });
    expect(roles([piece("a", "hoodie"), piece("b", "jeans"), piece("c", "sneakers"), piece("j", "coat")])).toEqual({
      a: "top", b: "bottom", c: "shoes", j: "layer",
    });
  });

  it("makes the hoodie or sweater the layer when it is worn over a lighter top", () => {
    expect(roles([piece("t", "t_shirt"), piece("h", "hoodie"), piece("b", "jeans"), piece("s", "sneakers")])).toEqual({
      t: "top", h: "layer", b: "bottom", s: "shoes",
    });
    expect(roles([piece("t", "blouse"), piece("w", "sweater"), piece("b", "skirt"), piece("s", "boots")])).toEqual({
      t: "top", w: "layer", b: "bottom", s: "shoes",
    });
  });

  it("rejects sets that are not an outfit", () => {
    const bad: [string, RolePiece[]][] = [
      ["no shoes", [piece("a", "t_shirt"), piece("b", "jeans")]],
      ["two pairs of shoes", [piece("a", "t_shirt"), piece("b", "jeans"), piece("c", "boots"), piece("d", "sneakers")]],
      ["no bottom", [piece("a", "t_shirt"), piece("c", "boots")]],
      ["no top", [piece("b", "jeans"), piece("c", "boots")]],
      ["a dress with a top", [piece("d", "dress"), piece("a", "t_shirt"), piece("c", "boots")]],
      ["a dress with a bottom", [piece("d", "dress"), piece("b", "jeans"), piece("c", "boots")]],
      ["two dresses", [piece("d", "dress"), piece("e", "dress"), piece("c", "boots")]],
      ["an accessory", [piece("a", "t_shirt"), piece("b", "jeans"), piece("c", "boots"), piece("x", "accessory")]],
      ["two light tops", [piece("a", "t_shirt"), piece("e", "shirt"), piece("b", "jeans"), piece("c", "boots")]],
      ["two hoodies or sweaters", [piece("a", "hoodie"), piece("e", "sweater"), piece("b", "jeans"), piece("c", "boots")]],
      ["three tops", [piece("a", "t_shirt"), piece("e", "shirt"), piece("h", "hoodie"), piece("b", "jeans"), piece("c", "boots")]],
      ["two layers", [piece("a", "t_shirt"), piece("h", "hoodie"), piece("j", "jacket"), piece("b", "jeans"), piece("c", "boots")]],
      ["two jackets", [piece("a", "t_shirt"), piece("j", "jacket"), piece("k", "coat"), piece("b", "jeans"), piece("c", "boots")]],
      ["nothing", []],
    ];
    for (const [label, pieces] of bad) expect(rolesOf(pieces), label).toBeNull();
  });
});

describe("outfitIds (what is stored with a suggestion)", () => {
  it("keeps the old order for top, bottom and shoes, and adds the new pieces around it", () => {
    expect(outfitIds({ top: "t", bottom: "b", shoes: "s" })).toEqual(["t", "b", "s"]);
    expect(outfitIds({ dress: "d", shoes: "s" })).toEqual(["d", "s"]);
    expect(outfitIds({ top: "t", bottom: "b", shoes: "s", layer: "l" })).toEqual(["t", "b", "s", "l"]);
    expect(outfitIds({ dress: "d", shoes: "s", layer: "l" })).toEqual(["d", "s", "l"]);
  });
});

describe("when the weather calls for a layer", () => {
  it("is when it is cool (at or below the limit, adjusted for how the person runs) or wet", () => {
    expect(layerReason(WARM, "neutral")).toBeNull();
    expect(layerReason(COOL, "neutral")).toBe("cool");
    expect(layerReason(RAIN_WARM, "neutral")).toBe("wet");
    expect(layerReason(RAIN_COOL, "neutral")).toBe("cool and wet");
    const at = (t: number): WeatherSnapshot => ({ temp_c: t, feels_like_c: t, is_precipitating: false });
    expect(layerReason(at(LAYER_AT_OR_BELOW_C), "neutral")).toBe("cool");
    expect(layerReason(at(LAYER_AT_OR_BELOW_C + 0.1), "neutral")).toBeNull();
    // Someone who runs cold gets a layer sooner, someone who runs hot later.
    expect(layerReason(at(17), "runs_cold")).toBe("cool");
    expect(layerReason(at(17), "neutral")).toBeNull();
    expect(layerReason(at(13), "runs_hot")).toBeNull();
    expect(layerReason(at(12), "runs_hot")).toBe("cool");
  });
});

describe("dress outfits", () => {
  const dressCloset = () => [g("dress", "dress"), g("shoes", "sandals")];

  it("recommends a dress with shoes when that is all there is", () => {
    const r = ok(scoreOutfit(input(dressCloset())));
    expect(r.outfit).toEqual({ dress: "dress", shoes: "shoes" });
  });

  it("can pick a dress over a top and bottom, or the other way, depending on taste", () => {
    const closet = [g("dress", "dress", { colors: ["pink"] }), g("tee", "t_shirt", { colors: ["blue"] }), g("jeans", "jeans", { colors: ["blue"] }), g("shoes", "sneakers")];
    const likesDress = ok(scoreOutfit(input(closet, { preferences: [{ tag: "type:dress", weight: 1 }, { tag: "color:pink", weight: 1 }] })));
    expect(likesDress.outfit).toEqual({ dress: "dress", shoes: "shoes" });
    const dislikesDress = ok(scoreOutfit(input(closet, { preferences: [{ tag: "type:dress", weight: -1 }, { tag: "color:pink", weight: -1 }] })));
    expect(dislikesDress.outfit).toEqual({ top: "tee", bottom: "jeans", shoes: "shoes" });
  });

  it("needs shoes: a dress alone is incomplete, and the dress stands in for the top and the bottom", () => {
    expect(scoreOutfit(input([g("dress", "dress")]))).toMatchObject({ status: "incomplete", missing_slots: ["shoes"] });
    expect(scoreOutfit(input([g("tee", "t_shirt"), g("shoes", "boots")]))).toMatchObject({ status: "incomplete", missing_slots: ["bottom"] });
    expect(scoreOutfit(input([g("jeans", "jeans"), g("shoes", "boots")]))).toMatchObject({ status: "incomplete", missing_slots: ["top"] });
    expect(scoreOutfit(input([]))).toMatchObject({ status: "incomplete", missing_slots: ["top", "bottom", "shoes"] });
    expect(scoreOutfit(input([g("dress", "dress"), g("tee", "t_shirt")]))).toMatchObject({ status: "incomplete", missing_slots: ["shoes"] });
  });

  it("ignores a dirty dress, but uses it for a Style Swipe idea", () => {
    const dirty = [g("dress", "dress", { status: "dirty" }), g("shoes", "sandals")];
    expect(scoreOutfit(input(dirty)).status).toBe("incomplete");
    expect(ok(scoreOutfit(input(dirty, { includeDirty: true }))).outfit).toEqual({ dress: "dress", shoes: "shoes" });
  });

  it("re-rolls to the other outfit when the dress one is rejected, and runs out when nothing is left", () => {
    const closet = [g("dress", "dress"), g("tee", "t_shirt"), g("jeans", "jeans"), g("shoes", "sneakers")];
    const first = ok(scoreOutfit(input(closet)));
    const ids = outfitIds(first.outfit);
    const second = ok(scoreOutfit(input(closet, { excludedOutfits: [ids] })));
    expect(outfitIds(second.outfit).slice().sort()).not.toEqual(ids.slice().sort());
    const third = scoreOutfit(input(closet, { excludedOutfits: [ids, outfitIds(second.outfit)] }));
    expect(third.status).toBe("exhausted");
  });
});

describe("layers", () => {
  const base = () => [g("tee", "t_shirt"), g("jeans", "jeans"), g("shoes", "sneakers")];

  it("adds a jacket when it is cool, and none on a warm dry day", () => {
    const closet = [...base(), g("jacket", "jacket", { warmth: 3 })];
    expect(ok(scoreOutfit(input(closet, { weather: COOL }))).outfit).toEqual({ top: "tee", bottom: "jeans", shoes: "shoes", layer: "jacket" });
    expect(ok(scoreOutfit(input(closet, { weather: WARM }))).outfit).toEqual({ top: "tee", bottom: "jeans", shoes: "shoes" });
  });

  it("adds a jacket in the rain even when it is warm, and says why", () => {
    const closet = [...base(), g("jacket", "jacket")];
    const r = ok(scoreOutfit(input(closet, { weather: RAIN_WARM })));
    expect(r.outfit.layer).toBe("jacket");
    expect(r.reasoning).toContain("Added a jacket because it is wet.");
    const cool = ok(scoreOutfit(input(closet, { weather: COOL })));
    expect(cool.reasoning).toContain("Added a jacket because it is cool.");
    expect(ok(scoreOutfit(input(closet, { weather: RAIN_COOL }))).reasoning).toContain("because it is cool and wet");
  });

  it("wears a hoodie over a lighter top when it is cool, but never just because it is wet", () => {
    const closet = [...base(), g("hoodie", "hoodie", { warmth: 3 })];
    expect(ok(scoreOutfit(input(closet, { weather: COOL }))).outfit).toEqual({ top: "tee", bottom: "jeans", shoes: "shoes", layer: "hoodie" });
    expect(ok(scoreOutfit(input(closet, { weather: RAIN_WARM }))).outfit.layer).toBeUndefined();
  });

  it("prefers a jacket to a hoodie in the rain, and a hoodie is fine when there is no jacket", () => {
    const both = [...base(), g("hoodie", "hoodie", { warmth: 3 }), g("jacket", "jacket", { warmth: 3 })];
    expect(ok(scoreOutfit(input(both, { weather: RAIN_COOL }))).outfit.layer).toBe("jacket");
    const hoodieOnly = [...base(), g("hoodie", "hoodie", { warmth: 3 })];
    expect(ok(scoreOutfit(input(hoodieOnly, { weather: RAIN_COOL }))).outfit.layer).toBe("hoodie");
  });

  it("gives a jacket the edge over an equally warm hoodie in the rain (and not in dry cool weather)", () => {
    // Same warmth, and the hoodie's id sorts first, so only the rain bonus can make the jacket win.
    const both = [...base(), g("a-hoodie", "hoodie", { warmth: 4 }), g("z-jacket", "jacket", { warmth: 4 })];
    expect(ok(scoreOutfit(input(both, { weather: RAIN_COOL }))).outfit.layer).toBe("z-jacket");
    const dryCool: WeatherSnapshot = { temp_c: 8, feels_like_c: 8, is_precipitating: false };
    expect(ok(scoreOutfit(input(both, { weather: dryCool }))).outfit.layer).toBe("a-hoodie");
  });

  it("goes without a layer when it has none to wear", () => {
    const r = ok(scoreOutfit(input(base(), { weather: RAIN_COOL })));
    expect(r.outfit.layer).toBeUndefined();
    expect(r.reasoning).not.toContain("Added");
  });

  it("never wears a hoodie or sweater over another hoodie or sweater, or over itself", () => {
    // Only hoodies and sweaters as tops: no lighter top to go under, so one of them is simply the top.
    const closet = [g("hoodie", "hoodie", { warmth: 3 }), g("sweater", "sweater", { warmth: 3 }), g("jeans", "jeans"), g("shoes", "boots")];
    const r = ok(scoreOutfit(input(closet, { weather: COOL })));
    expect(r.outfit.layer).toBeUndefined();
    expect(["hoodie", "sweater"]).toContain(r.outfit.top);
    // A single hoodie cannot be both the top and the layer.
    const single = [g("hoodie", "hoodie"), g("jeans", "jeans"), g("shoes", "boots")];
    const s = ok(scoreOutfit(input(single, { weather: COOL })));
    expect(s.outfit).toEqual({ top: "hoodie", bottom: "jeans", shoes: "shoes" });
  });

  it("puts a jacket over a hoodie or sweater top", () => {
    const closet = [g("hoodie", "hoodie", { warmth: 3 }), g("jeans", "jeans"), g("shoes", "boots"), g("coat", "coat", { warmth: 4 })];
    expect(ok(scoreOutfit(input(closet, { weather: COOL }))).outfit).toEqual({ top: "hoodie", bottom: "jeans", shoes: "shoes", layer: "coat" });
  });

  it("wears a lighter top under a layer than it would without one", () => {
    const weather: WeatherSnapshot = { temp_c: 6, feels_like_c: 6, is_precipitating: false }; // warmth target 4, 3 under a layer
    const tops = [g("warm-top", "shirt", { warmth: 4 }), g("lighter-top", "shirt", { warmth: 3 })];
    const rest = [g("jeans", "jeans", { warmth: 4 }), g("shoes", "boots", { warmth: 4 })];
    const noJacket = ok(scoreOutfit(input([...tops, ...rest], { weather })));
    expect(noJacket.outfit.top).toBe("warm-top");
    const withJacket = ok(scoreOutfit(input([...tops, ...rest, g("jacket", "jacket", { warmth: 4 })], { weather })));
    expect(withJacket.outfit.top).toBe("lighter-top");
    expect(withJacket.outfit.layer).toBe("jacket");
  });

  it("adds a layer to a dress outfit: a jacket or coat, never a hoodie or sweater", () => {
    const closet = [g("dress", "dress"), g("shoes", "boots"), g("jacket", "jacket", { warmth: 3 })];
    expect(ok(scoreOutfit(input(closet, { weather: COOL }))).outfit).toEqual({ dress: "dress", shoes: "shoes", layer: "jacket" });
    expect(ok(scoreOutfit(input(closet, { weather: WARM }))).outfit).toEqual({ dress: "dress", shoes: "shoes" });
    const sweaterOnly = [g("dress", "dress"), g("shoes", "boots"), g("sweater", "sweater")];
    expect(ok(scoreOutfit(input(sweaterOnly, { weather: COOL }))).outfit).toEqual({ dress: "dress", shoes: "shoes" });
  });

  it("does not pick a light dress over a warm top and bottom on a freezing day", () => {
    // Found by looking at real recommendations: the dress used to get the lighter under-a-layer target and won by a hair.
    const freezing: WeatherSnapshot = { temp_c: -2, feels_like_c: -2, is_precipitating: false };
    const closet = [
      g("dress", "dress", { warmth: 3 }), g("sweater", "sweater", { warmth: 4 }), g("tee", "t_shirt", { warmth: 1 }),
      g("jeans", "jeans", { warmth: 4 }), g("boots", "boots", { warmth: 5 }), g("coat", "coat", { warmth: 5 }),
    ];
    const r = ok(scoreOutfit(input(closet, { weather: freezing })));
    expect(r.outfit.dress).toBeUndefined();
    expect(r.outfit.layer).toBe("coat");
    expect(r.outfit.bottom).toBe("jeans");
    // A warm enough dress still can win.
    const warmDress = [...closet.filter((c) => c.id !== "dress"), g("wool-dress", "dress", { warmth: 5 })];
    expect(ok(scoreOutfit(input(warmDress, { weather: freezing }))).outfit.dress).toBe("wool-dress");
  });

  it("only uses a clean jacket, but a Style Swipe idea may use a dirty one", () => {
    const closet = [...base(), g("jacket", "jacket", { status: "dirty" })];
    expect(ok(scoreOutfit(input(closet, { weather: COOL }))).outfit.layer).toBeUndefined();
    expect(ok(scoreOutfit(input(closet, { weather: COOL, includeDirty: true }))).outfit.layer).toBe("jacket");
  });

  it("falls back to the outfit without the jacket once every outfit with it was rejected", () => {
    const closet = [...base(), g("jacket", "jacket")];
    const first = ok(scoreOutfit(input(closet, { weather: COOL })));
    expect(first.outfit.layer).toBe("jacket");
    const second = ok(scoreOutfit(input(closet, { weather: COOL, excludedOutfits: [outfitIds(first.outfit)] })));
    expect(second.outfit).toEqual({ top: "tee", bottom: "jeans", shoes: "shoes" });
    expect(scoreOutfit(input(closet, { weather: COOL, excludedOutfits: [outfitIds(first.outfit), outfitIds(second.outfit)] })).status).toBe("exhausted");
  });

  it("is deterministic", () => {
    const closet = [...base(), g("jacket", "jacket"), g("hoodie", "hoodie"), g("dress", "dress")];
    expect(scoreOutfit(input(closet, { weather: COOL }))).toEqual(scoreOutfit(input(closet, { weather: COOL })));
  });
});

describe("random closets and weather (invariants)", () => {
  function mulberry32(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("always returns a valid outfit with a layer only when the weather calls for one", () => {
    const rand = mulberry32(2026);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)]!;
    let withLayer = 0;
    let withDress = 0;
    for (let run = 0; run < 600; run++) {
      const closet = Array.from({ length: 4 + Math.floor(rand() * 20) }, (_, i) =>
        g(`g${run}-${i}`, pick(GARMENT_TYPES), {
          warmth: pick([1, 2, 3, 4, 5] as const),
          status: rand() < 0.25 ? "dirty" : "clean",
          last_worn_date: rand() < 0.5 ? null : `2026-09-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}`,
        }),
      );
      const weather: WeatherSnapshot = { temp_c: rand() * 40 - 8, feels_like_c: rand() * 40 - 8, is_precipitating: rand() < 0.35 };
      const comfort = pick(["runs_cold", "neutral", "runs_hot"] as const);
      const result = scoreOutfit(input(closet, { weather, tempComfort: comfort }));
      if (result.status !== "ok") continue;

      const byId = new Map(closet.map((x) => [x.id, x]));
      const ids = outfitIds(result.outfit);
      const pieces = ids.map((id) => byId.get(id)!);
      expect(new Set(ids).size).toBe(ids.length);
      expect(pieces.every((p) => p.status === "clean")).toBe(true);
      const roles = rolesOf(pieces);
      expect(roles, JSON.stringify(result.outfit)).not.toBeNull();
      expect(roles!.get(result.outfit.shoes)).toBe("shoes");

      if (result.outfit.layer !== undefined) {
        withLayer++;
        expect(layerReason(weather, comfort)).not.toBeNull();
        expect(result.outfit.layer).not.toBe(result.outfit.top);
        expect(roles!.get(result.outfit.layer)).toBe("layer");
        // Only a jacket or coat is ever put over a dress.
        if (result.outfit.dress !== undefined) expect(OUTERWEAR_TYPES).toContain(byId.get(result.outfit.layer)!.type);
      } else {
        expect(result.reasoning).not.toContain("Added a");
      }
      if (result.outfit.dress !== undefined) {
        withDress++;
        expect(result.outfit.top).toBeUndefined();
        expect(result.outfit.bottom).toBeUndefined();
      }
      // A rejected outfit never comes back.
      const again = scoreOutfit(input(closet, { weather, tempComfort: comfort, excludedOutfits: [ids] }));
      if (again.status === "ok") expect(outfitIds(again.outfit).slice().sort()).not.toEqual(ids.slice().sort());
    }
    // The run really exercised both new behaviours.
    expect(withLayer).toBeGreaterThan(20);
    expect(withDress).toBeGreaterThan(20);
  });
});
