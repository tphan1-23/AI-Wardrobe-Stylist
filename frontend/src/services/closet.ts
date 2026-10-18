// The closet: list the garments a person can see, filter them, edit or delete their own, and
// mark them clean or dirty (decisions D3 and D18). Pure TypeScript with an injected gateway so it
// is unit-tested without React Native or a network (see tests/closet.test.ts).
//
// Household members' garments are visible but never editable: the database refuses changes to
// anyone else's garment, and the screen does not offer them.
import { slotForType, type Color, type GarmentType, type Season, type Warmth } from "../../../supabase/functions/_shared/tag-schema.ts";
import type { GarmentStatus, UUID } from "../../../supabase/functions/_shared/types.ts";
import { NETWORK_ERROR } from "./edgeFunctions.ts";
import { isComplete, type GarmentDraft } from "./garment.ts";
import type { GatewayResult, MemberRow, Result } from "./household.ts";

export interface ClosetRow {
  id: UUID;
  owner_id: UUID;
  type: GarmentType;
  color: Color;
  season: Season;
  warmth: Warmth;
  status: GarmentStatus;
  image_path: string;
  created_at: string;
}

export interface ClosetItem extends ClosetRow {
  photoUrl: string | null;
}

export interface GarmentChanges {
  type: GarmentType;
  color: Color;
  season: Season;
  warmth: Warmth;
  status: GarmentStatus;
}

export interface ClosetGateway {
  // Everything the person may see: their own garments and their household members' (D18).
  loadGarments(): Promise<GatewayResult<ClosetRow[]>>;
  signPhotos(paths: string[]): Promise<GatewayResult<Record<string, string>>>;
  // These fail when the garment is not the caller's (the database changes zero rows).
  updateGarment(id: UUID, changes: GarmentChanges): Promise<GatewayResult<unknown>>;
  deleteGarment(id: UUID): Promise<GatewayResult<unknown>>;
  removePhoto(path: string): Promise<GatewayResult<unknown>>;
}

// ---- Filters ----------------------------------------------------------------

export type CategoryFilter = "all" | "top" | "bottom" | "shoes" | "other";
export type StatusFilter = "all" | GarmentStatus;
export type OwnerFilter = "all" | "mine" | "others";

export interface ClosetFilters {
  category: CategoryFilter;
  status: StatusFilter;
  owner: OwnerFilter;
}

export const DEFAULT_FILTERS: ClosetFilters = { category: "all", status: "all", owner: "all" };

export const CATEGORY_OPTIONS: { value: CategoryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "top", label: "Tops" },
  { value: "bottom", label: "Bottoms" },
  { value: "shoes", label: "Shoes" },
  { value: "other", label: "Other" },
];

export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
];

export const OWNER_OPTIONS: { value: OwnerFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "others", label: "Others" },
];

export const isMine = (item: Pick<ClosetRow, "owner_id">, myId: UUID): boolean => item.owner_id === myId;

export function filterItems<T extends ClosetRow>(items: T[], filters: ClosetFilters, myId: UUID): T[] {
  return items.filter((item) => {
    if (filters.category !== "all" && slotForType(item.type) !== filters.category) return false;
    if (filters.status !== "all" && item.status !== filters.status) return false;
    if (filters.owner === "mine" && !isMine(item, myId)) return false;
    if (filters.owner === "others" && isMine(item, myId)) return false;
    return true;
  });
}

export const countLabel = (count: number): string => `${count} ${count === 1 ? "item" : "items"}`;

// The small badge on a tile: "M" for the person's own garments, otherwise the owner's initial.
export function ownerBadge(item: Pick<ClosetRow, "owner_id">, myId: UUID, members: MemberRow[]): string {
  if (isMine(item, myId)) return "M";
  const name = members.find((m) => m.id === item.owner_id)?.name.trim() ?? "";
  return name === "" ? "?" : name.charAt(0).toUpperCase();
}

export function ownerName(item: Pick<ClosetRow, "owner_id">, myId: UUID, members: MemberRow[]): string {
  if (isMine(item, myId)) return "You";
  const name = members.find((m) => m.id === item.owner_id)?.name.trim() ?? "";
  return name === "" ? "A household member" : name;
}

// ---- Errors -----------------------------------------------------------------

export function friendlyClosetError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("row-level security") || text.includes("not found or not yours")) {
    return "That garment could not be changed. It may belong to someone else or was already deleted.";
  }
  if (text.includes("jwt") || text.includes("not authenticated")) return "Your session expired. Please sign in again.";
  return message;
}

async function call<T>(run: () => Promise<GatewayResult<T>>): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, error: friendlyClosetError(error.message) };
    if (data === null || data === undefined) {
      return { ok: false, error: "The server returned no data. Please try again." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

const succeeded = async (run: () => Promise<GatewayResult<unknown>>): Promise<Result<true>> =>
  call(async () => {
    const res = await run();
    return { data: res.error ? null : (true as const), error: res.error };
  });

// ---- Loading, editing, deleting ----------------------------------------------

// Newest first, each with its photo link. A photo that will not load is not worth failing the closet for.
export async function loadCloset(gateway: ClosetGateway): Promise<Result<ClosetItem[]>> {
  const rows = await call(() => gateway.loadGarments());
  if (!rows.ok) return rows;

  let urls: Record<string, string> = {};
  try {
    const signed = await gateway.signPhotos(rows.value.map((row) => row.image_path));
    if (!signed.error && signed.data) urls = signed.data;
  } catch {
    urls = {};
  }

  const items = [...rows.value]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({ ...row, photoUrl: urls[row.image_path] ?? null }));
  return { ok: true, value: items };
}

// Saves the edited tags and the clean/dirty status of one of the person's own garments.
export async function saveEdits(
  gateway: ClosetGateway,
  id: UUID,
  draft: GarmentDraft,
  status: GarmentStatus,
): Promise<Result<GarmentChanges>> {
  if (!isComplete(draft)) return { ok: false, error: "Choose every tag before saving." };
  const changes: GarmentChanges = { type: draft.type, color: draft.color, season: draft.season, warmth: draft.warmth, status };
  const saved = await succeeded(() => gateway.updateGarment(id, changes));
  return saved.ok ? { ok: true, value: changes } : saved;
}

// Deletes the garment, then its photo. The garment is what matters: if the photo cannot be
// removed it only stays in the person's own folder, so that is not reported.
export async function deleteItem(gateway: ClosetGateway, item: Pick<ClosetRow, "id" | "image_path">): Promise<Result<true>> {
  const deleted = await succeeded(() => gateway.deleteGarment(item.id));
  if (!deleted.ok) return deleted;
  try {
    await gateway.removePhoto(item.image_path);
  } catch {
    // leave the photo behind
  }
  return deleted;
}
