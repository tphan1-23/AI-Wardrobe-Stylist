// Outfit history: the outfits a person wore in the last 7 days (the ones they accepted with
// "Yes, wear this" on the Today screen, decision D3), and their favorite outfits. A worn outfit
// can be marked as a favorite and removed from the favorites again. Pure TypeScript with an
// injected gateway so it is unit-tested without React Native or a network (see tests/history.test.ts).
import { slotForType } from "../../../supabase/functions/_shared/tag-schema.ts";
import type { ISODate, UUID } from "../../../supabase/functions/_shared/types.ts";
import { NETWORK_ERROR } from "./edgeFunctions.ts";
import { garmentName } from "./garment.ts";
import type { GatewayResult, Result } from "./household.ts";
import { OUTFIT_SLOTS, formatToday, todayString, type GarmentRow, type OutfitSlot } from "./today.ts";

// Today and the six days before it.
export const HISTORY_DAYS = 7;

export interface OutfitRow {
  id: UUID;
  date: ISODate;
  garment_ids: UUID[];
  favorite: boolean;
  created_at: string;
}

export interface HistoryGateway {
  // The person's accepted suggestions from `since` on, newest first.
  loadWorn(since: ISODate): Promise<GatewayResult<OutfitRow[]>>;
  // The person's favorite outfits, newest first.
  loadFavoriteOutfits(): Promise<GatewayResult<OutfitRow[]>>;
  loadGarments(ids: UUID[]): Promise<GatewayResult<GarmentRow[]>>;
  signPhotos(paths: string[]): Promise<GatewayResult<Record<string, string>>>;
  // Fails when the suggestion is not the caller's (the database changes zero rows).
  setFavorite(id: UUID, favorite: boolean): Promise<GatewayResult<unknown>>;
}

export interface OutfitPiece {
  garmentId: UUID;
  slot: OutfitSlot;
  name: string;
  photoUrl: string | null;
}

export interface OutfitEntry {
  id: UUID;
  date: ISODate;
  favorite: boolean;
  pieces: OutfitPiece[];
  // How many of the outfit's garments have since been deleted from the closet.
  removed: number;
}

// ---- Days -------------------------------------------------------------------

// The device's calendar day `days` before `now`.
export function daysAgo(now: Date, days: number): ISODate {
  return todayString(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

export const historySince = (now: Date = new Date()): ISODate => daysAgo(now, HISTORY_DAYS - 1);

function parseDay(date: ISODate): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

// "Today", "Yesterday", or "Sat, Oct 17".
export function dayLabel(date: ISODate, now: Date = new Date()): string {
  if (date === daysAgo(now, 0)) return "Today";
  if (date === daysAgo(now, 1)) return "Yesterday";
  return formatToday(parseDay(date));
}

export interface DayGroup {
  date: ISODate;
  label: string;
  entries: OutfitEntry[];
}

// Entries are already newest first; this only groups neighbours that share a day.
export function groupByDay(entries: OutfitEntry[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, label: dayLabel(entry.date, now), entries: [entry] });
  }
  return groups;
}

// ---- Loading ----------------------------------------------------------------

async function call<T>(run: () => Promise<GatewayResult<T>>): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) {
      const text = error.message.toLowerCase();
      if (text.includes("jwt") || text.includes("not authenticated")) {
        return { ok: false, error: "Your session expired. Please sign in again." };
      }
      return { ok: false, error: error.message };
    }
    if (data === null || data === undefined) {
      return { ok: false, error: "The server returned no data. Please try again." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

const slotOrder = (slot: ReturnType<typeof slotForType>) => {
  const index = OUTFIT_SLOTS.indexOf(slot as OutfitSlot);
  return index === -1 ? OUTFIT_SLOTS.length : index;
};

// Loads the garments and photos of all the outfits once, then builds one entry per outfit.
// A photo that will not load, or a garment that was deleted, does not fail the list.
async function entriesFor(gateway: HistoryGateway, rows: OutfitRow[]): Promise<Result<OutfitEntry[]>> {
  const ids = [...new Set(rows.flatMap((row) => row.garment_ids))];
  if (ids.length === 0) return { ok: true, value: rows.map((row) => ({ id: row.id, date: row.date, favorite: row.favorite, pieces: [], removed: 0 })) };

  const garments = await call(() => gateway.loadGarments(ids));
  if (!garments.ok) return garments;

  let urls: Record<string, string> = {};
  try {
    const signed = await gateway.signPhotos(garments.value.map((g) => g.image_path));
    if (!signed.error && signed.data) urls = signed.data;
  } catch {
    urls = {};
  }

  const byId = new Map(garments.value.map((g) => [g.id, g]));
  const entries = rows.map((row) => {
    const found = row.garment_ids.flatMap((id) => {
      const garment = byId.get(id);
      return garment ? [garment] : [];
    });
    const pieces = found
      .map((garment) => ({
        garmentId: garment.id,
        slot: slotForType(garment.type),
        name: garmentName(garment),
        photoUrl: urls[garment.image_path] ?? null,
      }))
      .sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot))
      .map((piece) => ({ ...piece, slot: piece.slot as OutfitSlot }));
    return { id: row.id, date: row.date, favorite: row.favorite, pieces, removed: row.garment_ids.length - found.length };
  });
  return { ok: true, value: entries };
}

export async function loadHistory(gateway: HistoryGateway, now: Date = new Date()): Promise<Result<OutfitEntry[]>> {
  const rows = await call(() => gateway.loadWorn(historySince(now)));
  if (!rows.ok) return rows;
  return entriesFor(gateway, rows.value);
}

export async function loadFavoriteOutfits(gateway: HistoryGateway): Promise<Result<OutfitEntry[]>> {
  const rows = await call(() => gateway.loadFavoriteOutfits());
  if (!rows.ok) return rows;
  return entriesFor(gateway, rows.value);
}

// Adds a worn outfit to the favorites, or removes it from them.
export async function setOutfitFavorite(gateway: HistoryGateway, id: UUID, favorite: boolean): Promise<Result<true>> {
  return call(async () => {
    const res = await gateway.setFavorite(id, favorite);
    return { data: res.error ? null : (true as const), error: res.error };
  });
}
