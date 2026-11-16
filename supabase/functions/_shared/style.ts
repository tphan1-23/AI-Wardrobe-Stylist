// How well the pieces of an outfit go together (decision D28). Pure, no I/O, used by the scoring engine.
//
// These are SOFT rules: each one takes a small amount off an outfit's score, so it only changes the pick when there is
// a comparable alternative, and never stops an outfit when the closet offers nothing else. They are rules of thumb from
// fashion writing (the three-colour guideline, matching formality, not bulking up under a jacket), not facts, and none
// of them has been measured on real wearers. The numbers are ours to tune; see brain/AI Logic Ownership.md.
import { isOuterwear } from "./outfit.ts";
import type { Color, GarmentType } from "./tag-schema.ts";
import type { Garment } from "./types.ts";

// ---- Formality ---------------------------------------------------------------

// 1 = casual, 2 = smart casual (fine nearly anywhere), 3 = dressy. A garment type with no entry (an accessory)
// is left out of the comparison.
export const FORMALITY: Partial<Record<GarmentType, 1 | 2 | 3>> = {
  t_shirt: 1, tank_top: 1, hoodie: 1, sweatpants: 1, leggings: 1, shorts: 1, sneakers: 1, sandals: 1,
  shirt: 2, sweater: 2, jeans: 2, trousers: 2, skirt: 2, boots: 2, jacket: 2, coat: 2, dress: 2, tights: 2,
  blouse: 3, dress_shoes: 3,
};

// A casual piece with a dressy one (a hoodie with dress shoes, sweatpants with a blouse) looks mismatched. One step
// apart is the normal range of an everyday outfit, so only the widest gap counts.
export const FORMALITY_CLASH_PENALTY = 0.12;

export function formalityPenalty(pieces: readonly Garment[]): number {
  const levels = pieces.map((g) => FORMALITY[g.type]).filter((l): l is 1 | 2 | 3 => l !== undefined);
  if (levels.length === 0) return 0;
  return Math.max(...levels) - Math.min(...levels) >= 2 ? FORMALITY_CLASH_PENALTY : 0;
}

// ---- Colors ------------------------------------------------------------------

// These go with almost anything. Blue is not here, but blue jeans are treated as neutral below (denim goes with everything).
export const NEUTRAL_COLORS: readonly Color[] = ["black", "white", "gray", "navy", "beige", "brown"];

// The usual guideline is about three colors in an outfit. Neutrals are free, so up to two accent colors are fine.
export const MAX_ACCENT_COLORS = 2;
export const EXTRA_ACCENT_PENALTY = 0.08;

// A multicolor piece (stripes, a print) already carries several colors, so it counts as two accents.
const MULTICOLOR_ACCENTS = 2;

export function accentCount(pieces: readonly Garment[]): number {
  const accents = new Set<string>();
  for (const piece of pieces) {
    const main = piece.colors[0];
    if (main === undefined || NEUTRAL_COLORS.includes(main)) continue;
    if (piece.type === "jeans" && main === "blue") continue;
    if (main === "multicolor") for (let i = 0; i < MULTICOLOR_ACCENTS; i++) accents.add(`multicolor-${i}`);
    else accents.add(main);
  }
  return accents.size;
}

export function colorPenalty(pieces: readonly Garment[]): number {
  return Math.max(0, accentCount(pieces) - MAX_ACCENT_COLORS) * EXTRA_ACCENT_PENALTY;
}

// ---- Bulk under a jacket -------------------------------------------------------

// A warm, thick top (warmth 4 or 5: a heavy hoodie or sweater) under a jacket or coat looks and feels bulky and
// overheats indoors. A light hoodie (3 or less) under a jacket is fine, and so is a thick one when it is freezing.
export const BULKY_TOP_WARMTH = 4;
export const BULKY_UNDER_JACKET_PENALTY = 0.2;
// The planned warmth at which even a thick top under a jacket is simply what you need.
export const FREEZING_TARGET = 5;

export function bulkPenalty(top: Garment | undefined, layer: Garment | undefined, targetWarmth: number): number {
  if (!top || !layer || !isOuterwear(layer.type)) return 0;
  if (targetWarmth >= FREEZING_TARGET) return 0;
  return top.warmth >= BULKY_TOP_WARMTH ? BULKY_UNDER_JACKET_PENALTY : 0;
}

// ---- Putting it together ---------------------------------------------------------

export interface StyleCheck {
  pieces: readonly Garment[];
  top?: Garment;
  layer?: Garment;
  targetWarmth: number;
}

// The total taken off an outfit's score.
export function stylePenalty({ pieces, top, layer, targetWarmth }: StyleCheck): number {
  return formalityPenalty(pieces) + colorPenalty(pieces) + bulkPenalty(top, layer, targetWarmth);
}
