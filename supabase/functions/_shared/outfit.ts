// What an outfit is made of, shared by the scoring engine (server) and the screens (app).
// Pure, no I/O.
//
// An outfit is shoes plus ONE of:
//   - a top and a bottom, or
//   - a dress (a one-piece outfit),
// plus an optional LAYER on top when it is cold or wet: a jacket or coat, or a hoodie/sweater worn over a
// lighter top. Older suggestions have exactly top, bottom and shoes, which is still valid.
import { GARMENT_TYPES, slotForType, type GarmentType } from "./tag-schema.ts";
import type { Outfit, UUID } from "./types.ts";

export type OutfitRole = "layer" | "dress" | "top" | "bottom" | "shoes";

// Top to bottom, the order the screens show an outfit in.
export const ROLE_ORDER: readonly OutfitRole[] = ["layer", "dress", "top", "bottom", "shoes"];

export const ROLE_LABELS: Record<OutfitRole, string> = {
  layer: "Layer",
  dress: "Dress",
  top: "Top",
  bottom: "Bottom",
  shoes: "Shoes",
};

// Always an outer layer.
export const OUTERWEAR_TYPES: readonly GarmentType[] = ["jacket", "coat"];
// Tops that can also be the layer, worn over a lighter top.
export const OVER_TOP_TYPES: readonly GarmentType[] = ["hoodie", "sweater"];
// The lighter tops a hoodie or sweater can be worn over.
export const LIGHT_TOP_TYPES: readonly GarmentType[] = ["t_shirt", "tank_top", "shirt", "blouse"];

export const isOuterwear = (type: GarmentType) => OUTERWEAR_TYPES.includes(type);
export const isOverTop = (type: GarmentType) => OVER_TOP_TYPES.includes(type);
export const isLightTop = (type: GarmentType) => LIGHT_TOP_TYPES.includes(type);

// Shoes and outerwear are not washed after every wear, so wearing an outfit does not mark them dirty
// (the database function accept_suggestion, migration 0010, lists exactly these types).
export const LAUNDRY_EXEMPT_TYPES: readonly GarmentType[] = GARMENT_TYPES.filter(
  (type) => slotForType(type) === "shoes" || isOuterwear(type),
);

export function goesToLaundry(type: GarmentType): boolean {
  return !LAUNDRY_EXEMPT_TYPES.includes(type);
}

// The role a garment type can have on its own: a hoodie or sweater is a top here (it may become the layer
// when it is worn over a lighter top, see rolesOf). Accessories are not part of an outfit.
export function baseRole(type: GarmentType): OutfitRole | null {
  if (type === "dress") return "dress";
  if (isOuterwear(type)) return "layer";
  const slot = slotForType(type);
  return slot === "top" || slot === "bottom" || slot === "shoes" ? slot : null;
}

export interface RolePiece {
  id: UUID;
  type: GarmentType;
  warmth: number;
}

// Which role each garment of a saved outfit plays, or null when the set is not a valid outfit.
// Valid: shoes + (top + bottom | dress) + at most one layer. Two tops are valid only as a light top with a
// hoodie or sweater over it (and then there is no jacket or coat).
export function rolesOf(pieces: readonly RolePiece[]): Map<UUID, OutfitRole> | null {
  const roles = new Map<UUID, OutfitRole>();
  const tops: RolePiece[] = [];
  let dress = 0;
  let bottoms = 0;
  let shoes = 0;
  let layers = 0;

  for (const piece of pieces) {
    const role = baseRole(piece.type);
    if (role === null) return null;
    if (role === "top") tops.push(piece);
    else {
      if (role === "dress") dress++;
      if (role === "bottom") bottoms++;
      if (role === "shoes") shoes++;
      if (role === "layer") layers++;
      roles.set(piece.id, role);
    }
  }

  if (tops.length === 2) {
    const over = tops.filter((p) => isOverTop(p.type));
    const light = tops.filter((p) => isLightTop(p.type));
    // Exactly one hoodie/sweater over exactly one lighter top, and no second layer.
    if (over.length !== 1 || light.length !== 1 || layers > 0) return null;
    roles.set(over[0]!.id, "layer");
    roles.set(light[0]!.id, "top");
    layers++;
  } else if (tops.length === 1) {
    roles.set(tops[0]!.id, "top");
  }

  // Three or more tops are never an outfit: a set needs exactly one top (or a top plus its layer, handled above).
  const topCount = tops.length === 2 ? 1 : tops.length;
  const base = dress === 1 && topCount === 0 && bottoms === 0 ? true : dress === 0 && topCount === 1 && bottoms === 1;
  if (!base || shoes !== 1 || layers > 1 || dress > 1) return null;
  return roles;
}

// The garment ids to store for an outfit: [dress or top, bottom, shoes, layer]. Old suggestions are
// [top, bottom, shoes], so the first three keep their place.
export function outfitIds(outfit: Outfit): UUID[] {
  const ids: UUID[] = [];
  const first = outfit.dress ?? outfit.top;
  if (first) ids.push(first);
  if (outfit.bottom) ids.push(outfit.bottom);
  ids.push(outfit.shoes);
  if (outfit.layer) ids.push(outfit.layer);
  return ids;
}
