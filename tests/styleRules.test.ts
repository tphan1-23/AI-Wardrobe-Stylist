// Tights under bare legs, and the soft style rules (bulk under a jacket, color count, formality), D28.
import { describe, expect, it } from "vitest";
import { outfitIds, rolesOf, showsLegs, type RolePiece } from "../supabase/functions/_shared/outfit.ts";
import { legsCold, scoreOutfit, TIGHTS_AT_OR_BELOW_C, type OutfitInput } from "../supabase/functions/_shared/scoring.ts";
import {
  BULKY_UNDER_JACKET_PENALTY,
  EXTRA_ACCENT_PENALTY,
  FORMALITY,
  FORMALITY_CLASH_PENALTY,
  accentCount,
  bulkPenalty,
  colorPenalty,
  formalityPenalty,
  stylePenalty,
} from "../supabase/functions/_shared/style.ts";
import { GARMENT_TYPES, type Color, type GarmentType } from "../supabase/functions/_shared/tag-schema.ts";
import { validateTags } from "../supabase/functions/_shared/tag-validation.ts";
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
const COLD: WeatherSnapshot = { temp_c: 4, feels_like_c: 4, is_precipitating: false }; // planned warmth 4
const FREEZING: WeatherSnapshot = { temp_c: -3, feels_like_c: -3, is_precipitating: false }; // planned warmth 5

const input = (garments: Garment[], over: Partial<OutfitInput> = {}): OutfitInput => ({
  garments, weather: WARM, preferences: [], tempComfort: "neutral", date: "2026-10-05", ...over,
});
const ok = (r: ReturnType<typeof scoreOutfit>) => {
  if (r.status !== "ok") throw new Error(`expected ok, got ${r.status}: ${r.reasoning}`);
  return r;
};

describe("tights as a garment type", () => {
  it("is a type the AI can name, with the usual other names for it understood", () => {
    expect(GARMENT_TYPES).toContain("tights");
    for (const word of ["tights", "Pantyhose", "stockings", "hosiery", "fleece tights"]) {
      expect(validateTags({ type: word, colors: ["black"], seasons: ["winter"], warmth: 3 }).tags.type).toBe("tights");
    }
    // Leggings stay leggings: they are worn as trousers.
    expect(validateTags({ type: "leggings", colors: ["black"], seasons: ["all"], warmth: 2 }).tags.type).toBe("leggings");
  });

  it("has a bare-legs rule: only a dress, skirt or shorts", () => {
    for (const type of ["dress", "skirt", "shorts"] as GarmentType[]) expect(showsLegs(type)).toBe(true);
    for (const type of ["jeans", "trousers", "sweatpants", "leggings", "tights"] as GarmentType[]) expect(showsLegs(type)).toBe(false);
  });
});

describe("tights in a saved outfit", () => {
  it("are valid under a skirt, under shorts and under a dress", () => {
    const skirt = rolesOf([piece("t", "t_shirt"), piece("b", "skirt"), piece("x", "tights"), piece("s", "boots")]);
    expect(skirt?.get("x")).toBe("tights");
    expect(rolesOf([piece("t", "t_shirt"), piece("b", "shorts"), piece("x", "tights"), piece("s", "boots")])).not.toBeNull();
    expect(rolesOf([piece("d", "dress"), piece("x", "tights"), piece("s", "boots")])?.get("x")).toBe("tights");
  });

  it("are not valid under jeans, trousers or leggings, and only one pair at a time", () => {
    for (const bottom of ["jeans", "trousers", "leggings", "sweatpants"] as GarmentType[]) {
      expect(rolesOf([piece("t", "t_shirt"), piece("b", bottom), piece("x", "tights"), piece("s", "boots")])).toBeNull();
    }
    expect(rolesOf([piece("d", "dress"), piece("x", "tights"), piece("y", "tights"), piece("s", "boots")])).toBeNull();
  });

  it("are not an outfit by themselves", () => {
    expect(rolesOf([piece("x", "tights"), piece("s", "boots")])).toBeNull();
  });

  it("are stored after the other pieces, so older outfits still read the same", () => {
    expect(outfitIds({ top: "t", bottom: "b", shoes: "s", layer: "l", tights: "x" })).toEqual(["t", "b", "s", "l", "x"]);
    expect(outfitIds({ dress: "d", shoes: "s", tights: "x" })).toEqual(["d", "s", "x"]);
    expect(outfitIds({ top: "t", bottom: "b", shoes: "s" })).toEqual(["t", "b", "s"]);
  });
});

describe("recommending tights", () => {
  it("is cold for bare legs at or below the threshold, adjusted for how the person runs", () => {
    expect(TIGHTS_AT_OR_BELOW_C).toBe(12);
    expect(legsCold({ ...COOL, feels_like_c: 12 }, "neutral")).toBe(true);
    expect(legsCold({ ...COOL, feels_like_c: 13 }, "neutral")).toBe(false);
    expect(legsCold({ ...COOL, feels_like_c: 14 }, "runs_cold")).toBe(true);
    expect(legsCold({ ...COOL, feels_like_c: 10 }, "runs_hot")).toBe(false);
  });

  const skirtCloset = () => [
    g("tee", "t_shirt"), g("skirt", "skirt"), g("tights", "tights", { warmth: 3 }), g("boots", "boots", { warmth: 3 }),
  ];

  it("puts tights under a skirt when it is cold", () => {
    const result = ok(scoreOutfit(input(skirtCloset(), { weather: COLD })));
    expect(result.outfit).toMatchObject({ top: "tee", bottom: "skirt", shoes: "boots", tights: "tights" });
    expect(result.reasoning).toContain("Added tights");
  });

  it("does not add tights on a warm day", () => {
    const result = ok(scoreOutfit(input(skirtCloset(), { weather: WARM })));
    expect(result.outfit.tights).toBeUndefined();
    expect(result.reasoning).not.toContain("tights");
  });

  it("puts tights under shorts too", () => {
    const closet = [g("tee", "t_shirt"), g("shorts", "shorts"), g("tights", "tights"), g("boots", "boots")];
    expect(ok(scoreOutfit(input(closet, { weather: COLD }))).outfit.tights).toBe("tights");
  });

  it("puts tights under a dress in the cold, and a jacket over it", () => {
    const closet = [g("dress", "dress", { warmth: 3 }), g("tights", "tights", { warmth: 3 }), g("boots", "boots", { warmth: 3 }), g("coat", "coat", { warmth: 4 })];
    const result = ok(scoreOutfit(input(closet, { weather: COLD })));
    expect(result.outfit).toMatchObject({ dress: "dress", tights: "tights", layer: "coat", shoes: "boots" });
  });

  it("never puts tights under jeans, trousers or sweatpants", () => {
    for (const bottom of ["jeans", "trousers", "sweatpants"] as GarmentType[]) {
      const closet = [g("tee", "t_shirt"), g(bottom, bottom), g("tights", "tights"), g("boots", "boots")];
      expect(ok(scoreOutfit(input(closet, { weather: FREEZING }))).outfit.tights).toBeUndefined();
    }
  });

  it("only offers a cold-day skirt with tights, but still uses the skirt when there are no tights at all", () => {
    const noTights = skirtCloset().filter((x) => x.type !== "tights");
    expect(ok(scoreOutfit(input(noTights, { weather: COLD }))).outfit).toMatchObject({ bottom: "skirt" });
  });

  it("lets tights make a skirt count as warmer, so a skirt can win a cold day it would otherwise lose", () => {
    const closet = [
      g("tee", "t_shirt", { warmth: 3 }),
      g("skirt", "skirt", { warmth: 3 }),
      g("tights", "tights", { warmth: 3 }),
      g("jeans", "jeans", { warmth: 3 }),
      g("boots", "boots", { warmth: 3 }),
    ];
    const prefers = [{ tag: "type:skirt", weight: 0.5 }];
    expect(ok(scoreOutfit(input(closet, { weather: COLD, preferences: prefers }))).outfit).toMatchObject({ bottom: "skirt", tights: "tights" });
  });

  it("skips dirty tights like any other dirty garment", () => {
    const closet = skirtCloset().map((x) => (x.type === "tights" ? { ...x, status: "dirty" as const } : x));
    expect(ok(scoreOutfit(input(closet, { weather: COLD }))).outfit.tights).toBeUndefined();
  });

  it("does not repeat an outfit that was rejected, tights included", () => {
    const first = ok(scoreOutfit(input(skirtCloset(), { weather: COLD })));
    const again = scoreOutfit(input(skirtCloset(), { weather: COLD, excludedOutfits: [outfitIds(first.outfit)] }));
    expect(again.status).toBe("exhausted");
  });
});

describe("a hoodie under a jacket", () => {
  const hoodieCloset = () => [
    g("heavy", "hoodie", { warmth: 4, colors: ["gray"] }),
    g("light", "hoodie", { warmth: 3, colors: ["black"] }),
    g("jeans", "jeans", { warmth: 3 }),
    g("sneakers", "sneakers", { warmth: 3 }),
    g("jacket", "jacket", { warmth: 3 }),
  ];
  // The heavy hoodie is the one the person likes; only the bulk rule can stand in its way.
  const likesHeavy = [{ tag: "color:gray", weight: 1 }];

  it("prefers a light hoodie under a jacket to a heavy one, even when the heavy one is liked more", () => {
    const result = ok(scoreOutfit(input(hoodieCloset(), { weather: COLD, preferences: likesHeavy })));
    expect(result.outfit).toMatchObject({ top: "light", layer: "jacket" });
  });

  it("still allows a light hoodie with a jacket", () => {
    const closet = hoodieCloset().filter((x) => x.id !== "heavy");
    expect(ok(scoreOutfit(input(closet, { weather: COLD }))).outfit).toMatchObject({ top: "light", layer: "jacket" });
  });

  it("allows a heavy hoodie under a jacket when it is freezing", () => {
    const result = ok(scoreOutfit(input(hoodieCloset(), { weather: FREEZING, preferences: likesHeavy })));
    expect(result.outfit).toMatchObject({ top: "heavy", layer: "jacket" });
  });

  it("still uses the heavy hoodie when it is the only top (a soft rule, never a ban)", () => {
    const closet = hoodieCloset().filter((x) => x.id !== "light");
    expect(ok(scoreOutfit(input(closet, { weather: COLD }))).outfit).toMatchObject({ top: "heavy", layer: "jacket" });
  });

  it("only counts a real jacket or coat as the layer over the top", () => {
    const heavy = g("heavy", "hoodie", { warmth: 5 });
    expect(bulkPenalty(heavy, g("coat", "coat"), 4)).toBe(BULKY_UNDER_JACKET_PENALTY);
    expect(bulkPenalty(heavy, g("jacket", "jacket"), 4)).toBe(BULKY_UNDER_JACKET_PENALTY);
    expect(bulkPenalty(heavy, g("over", "sweater"), 4)).toBe(0);
    expect(bulkPenalty(heavy, undefined, 4)).toBe(0);
    expect(bulkPenalty(undefined, g("coat", "coat"), 4)).toBe(0);
    expect(bulkPenalty(g("light", "hoodie", { warmth: 3 }), g("coat", "coat"), 4)).toBe(0);
    expect(bulkPenalty(heavy, g("coat", "coat"), 5)).toBe(0);
  });
});

describe("how many colors an outfit has", () => {
  const c = (type: GarmentType, ...colors: Color[]) => g(`${type}-${colors.join("")}-${++n}`, type, { colors });

  it("counts only accent colors: neutrals and blue jeans are free", () => {
    expect(accentCount([c("t_shirt", "black"), c("trousers", "navy"), c("sneakers", "white")])).toBe(0);
    expect(accentCount([c("t_shirt", "red"), c("jeans", "blue"), c("sneakers", "white")])).toBe(1);
    expect(accentCount([c("t_shirt", "red"), c("trousers", "blue"), c("sneakers", "white")])).toBe(2); // blue trousers are not denim
    expect(accentCount([c("t_shirt", "red"), c("skirt", "red"), c("boots", "brown")])).toBe(1); // the same color twice
  });

  it("counts a patterned piece as two accents, and only looks at the main color", () => {
    expect(accentCount([c("t_shirt", "multicolor"), c("jeans", "blue")])).toBe(2);
    expect(accentCount([c("t_shirt", "black", "red")])).toBe(0);
  });

  it("takes a little off for each accent beyond two", () => {
    expect(colorPenalty([c("t_shirt", "red"), c("skirt", "green")])).toBe(0);
    expect(colorPenalty([c("t_shirt", "red"), c("skirt", "green"), c("boots", "yellow")])).toBeCloseTo(EXTRA_ACCENT_PENALTY, 10);
    expect(colorPenalty([c("t_shirt", "multicolor"), c("skirt", "green")])).toBeCloseTo(EXTRA_ACCENT_PENALTY, 10);
  });

  it("prefers calmer colors when a liked loud top would make three accents", () => {
    const closet = [
      g("red-tee", "t_shirt", { colors: ["red"] }),
      g("black-tee", "t_shirt", { colors: ["black"] }),
      g("green-trousers", "trousers", { colors: ["green"] }),
      g("yellow-sneakers", "sneakers", { colors: ["yellow"] }),
    ];
    const result = ok(scoreOutfit(input(closet, { preferences: [{ tag: "color:red", weight: 0.3 }] })));
    expect(result.outfit.top).toBe("black-tee");
  });
});

describe("matching formality", () => {
  it("has a level for every type except accessories", () => {
    for (const type of GARMENT_TYPES) {
      if (type === "accessory") expect(FORMALITY[type]).toBeUndefined();
      else expect([1, 2, 3]).toContain(FORMALITY[type]);
    }
  });

  it("only objects when a casual piece meets a dressy one", () => {
    expect(formalityPenalty([g("a", "hoodie"), g("b", "jeans"), g("c", "sneakers")])).toBe(0);
    expect(formalityPenalty([g("a", "shirt"), g("b", "trousers"), g("c", "dress_shoes")])).toBe(0);
    expect(formalityPenalty([g("a", "blouse"), g("b", "trousers"), g("c", "dress_shoes")])).toBe(0);
    expect(formalityPenalty([g("a", "hoodie"), g("b", "jeans"), g("c", "dress_shoes")])).toBe(FORMALITY_CLASH_PENALTY);
    expect(formalityPenalty([g("a", "blouse"), g("b", "sweatpants"), g("c", "sneakers")])).toBe(FORMALITY_CLASH_PENALTY);
    expect(formalityPenalty([g("a", "accessory")])).toBe(0);
    expect(formalityPenalty([])).toBe(0);
  });

  it("picks sneakers over dress shoes with a hoodie, even when the dress shoes are liked a bit more", () => {
    const closet = [g("hoodie", "hoodie"), g("jeans", "jeans"), g("sneakers", "sneakers"), g("loafers", "dress_shoes")];
    const result = ok(scoreOutfit(input(closet, { preferences: [{ tag: "type:dress_shoes", weight: 0.3 }] })));
    expect(result.outfit.shoes).toBe("sneakers");
  });

  it("still wears the only shoes it has", () => {
    const closet = [g("hoodie", "hoodie"), g("jeans", "jeans"), g("loafers", "dress_shoes")];
    expect(ok(scoreOutfit(input(closet))).outfit.shoes).toBe("loafers");
  });
});

describe("the total", () => {
  it("adds the three rules up", () => {
    const pieces = [g("a", "hoodie", { warmth: 4 }), g("b", "jeans"), g("c", "dress_shoes"), g("d", "jacket")];
    expect(stylePenalty({ pieces, top: pieces[0], layer: pieces[3], targetWarmth: 4 })).toBeCloseTo(
      FORMALITY_CLASH_PENALTY + BULKY_UNDER_JACKET_PENALTY,
      10,
    );
    expect(stylePenalty({ pieces: [g("a", "t_shirt")], targetWarmth: 2 })).toBe(0);
  });
});
