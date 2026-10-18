// Today's outfit: load or generate the suggestion, show it, and send the answer
// (wear it, or ask for another). Pure TypeScript with an injected gateway so it is
// unit-tested without React Native or a network (see tests/today.test.ts).
//
// Choosing the outfit is the AI core's job (`generate-outfit`, owned by Manuel +
// Claude); this file only asks for it, remembers today's pick and reports feedback.
import {
  slotForType,
  type Color,
  type GarmentType,
  type Season,
  type Slot,
  type Warmth,
} from "../../../supabase/functions/_shared/tag-schema.ts";
import type {
  FeedbackValue,
  GenerateOutfitResponse,
  ISODate,
  UUID,
} from "../../../supabase/functions/_shared/types.ts";
import type { GatewayError, GatewayResult, Result } from "./household.ts";

export type OutfitSlot = Exclude<Slot, "other">;
export const OUTFIT_SLOTS: OutfitSlot[] = ["top", "bottom", "shoes"];

// The most rejected outfits `generate-outfit` accepts in one request.
export const MAX_EXCLUDED = 50;

export interface GarmentRow {
  id: UUID;
  type: GarmentType;
  color: Color;
  season: Season;
  warmth: Warmth;
  status: "clean" | "dirty";
  image_path: string;
}

export interface SuggestionRow {
  id: UUID;
  date: ISODate;
  garment_ids: UUID[];
  feedback: FeedbackValue | null;
  accepted: boolean;
  created_at: string;
}

export interface TodayGateway {
  // The user's own suggestions for one day, oldest first.
  loadSuggestions(date: ISODate): Promise<GatewayResult<SuggestionRow[]>>;
  loadGarments(ids: UUID[]): Promise<GatewayResult<GarmentRow[]>>;
  // Short-lived links to private photos, keyed by storage path.
  signPhotos(paths: string[]): Promise<GatewayResult<Record<string, string>>>;
  generateOutfit(date: ISODate, excludeSuggestionIds: UUID[]): Promise<GatewayResult<GenerateOutfitResponse>>;
  sendFeedback(suggestionId: UUID, feedback: FeedbackValue): Promise<GatewayResult<unknown>>;
  // Marks the suggestion accepted and its garments as worn today.
  acceptSuggestion(suggestionId: UUID): Promise<GatewayResult<unknown>>;
}

export interface OutfitItem {
  id: UUID;
  slot: OutfitSlot;
  name: string;
  detail: string;
  photoUrl: string | null;
}

export interface OutfitView {
  suggestionId: UUID;
  items: Record<OutfitSlot, OutfitItem>;
  // Only a freshly generated outfit has one: the reason is not stored with the suggestion.
  reasoning: string | null;
  accepted: boolean;
}

export type TodayState =
  | { kind: "outfit"; outfit: OutfitView }
  | { kind: "incomplete"; missing: OutfitSlot[]; reasoning: string }
  | { kind: "exhausted"; reasoning: string };

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

// ---- Labels -----------------------------------------------------------------

const TYPE_LABELS: Record<GarmentType, string> = {
  t_shirt: "t-shirt",
  tank_top: "tank top",
  shirt: "shirt",
  blouse: "blouse",
  sweater: "sweater",
  hoodie: "hoodie",
  jeans: "jeans",
  trousers: "trousers",
  shorts: "shorts",
  skirt: "skirt",
  leggings: "leggings",
  sweatpants: "sweatpants",
  sneakers: "sneakers",
  boots: "boots",
  sandals: "sandals",
  dress_shoes: "dress shoes",
  dress: "dress",
  jacket: "jacket",
  coat: "coat",
  accessory: "accessory",
};

const SEASON_LABELS: Record<Season, string> = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
  all: "All seasons",
};

const WARMTH_LABELS: Record<Warmth, string> = {
  1: "Very light",
  2: "Light",
  3: "Medium",
  4: "Warm",
  5: "Very warm",
};

export const SLOT_LABELS: Record<OutfitSlot, string> = { top: "Top", bottom: "Bottom", shoes: "Shoes" };

export function garmentName(garment: Pick<GarmentRow, "color" | "type">): string {
  const color = garment.color.charAt(0).toUpperCase() + garment.color.slice(1);
  return `${color} ${TYPE_LABELS[garment.type]}`;
}

export function garmentDetail(garment: Pick<GarmentRow, "season" | "warmth">): string {
  return `${SEASON_LABELS[garment.season]} · ${WARMTH_LABELS[garment.warmth]}`;
}

// ---- Dates ------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

// The device's local calendar day, which is the day the person means by "today".
export function todayString(now: Date = new Date()): ISODate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatToday(now: Date = new Date()): string {
  return `${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

// ---- Errors -----------------------------------------------------------------

// Edge-function errors carry the HTTP status (see api_endpoints.md).
export function friendlyTodayError(error: GatewayError): string {
  switch (error.status) {
    case 401:
      return "Your session expired. Please sign in again.";
    case 404:
      return "Your profile could not be found. Log out and sign in again.";
    case 409:
      return "Set your location first: open the Household tab and tap Change next to Location.";
    case 502:
      return "The weather service is unavailable right now. Try again in a minute.";
    default:
      return error.message;
  }
}

async function call<T>(run: () => Promise<GatewayResult<T>>): Promise<Result<T>> {
  try {
    const { data, error } = await run();
    if (error) return { ok: false, error: friendlyTodayError(error) };
    if (data === null || data === undefined) {
      return { ok: false, error: "The server returned no data. Please try again." };
    }
    return { ok: true, value: data };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

// ---- Building the outfit ----------------------------------------------------

// Turns a suggestion into what the screen shows. Returns null when it can no longer
// be shown: a garment was deleted, or it is dirty now (unless the user already wears it today).
async function buildOutfit(
  gateway: TodayGateway,
  suggestion: Pick<SuggestionRow, "id" | "garment_ids" | "accepted">,
  reasoning: string | null,
): Promise<Result<OutfitView | null>> {
  const garments = await call(() => gateway.loadGarments(suggestion.garment_ids));
  if (!garments.ok) return garments;

  const bySlot = new Map<OutfitSlot, GarmentRow>();
  for (const garment of garments.value) {
    const slot = slotForType(garment.type);
    if (slot === "other" || bySlot.has(slot)) return { ok: true, value: null };
    if (garment.status !== "clean" && !suggestion.accepted) return { ok: true, value: null };
    bySlot.set(slot, garment);
  }
  const top = bySlot.get("top");
  const bottom = bySlot.get("bottom");
  const shoes = bySlot.get("shoes");
  if (!top || !bottom || !shoes) return { ok: true, value: null };

  // A photo that will not load is not worth failing the whole screen for.
  let urls: Record<string, string> = {};
  try {
    const signed = await gateway.signPhotos([top, bottom, shoes].map((g) => g.image_path));
    if (!signed.error && signed.data) urls = signed.data;
  } catch {
    urls = {};
  }

  const item = (slot: OutfitSlot, garment: GarmentRow): OutfitItem => ({
    id: garment.id,
    slot,
    name: garmentName(garment),
    detail: garmentDetail(garment),
    photoUrl: urls[garment.image_path] ?? null,
  });
  return {
    ok: true,
    value: {
      suggestionId: suggestion.id,
      items: { top: item("top", top), bottom: item("bottom", bottom), shoes: item("shoes", shoes) },
      reasoning,
      accepted: suggestion.accepted,
    },
  };
}

async function generate(gateway: TodayGateway, date: ISODate, rejectedIds: UUID[]): Promise<Result<TodayState>> {
  const response = await call(() => gateway.generateOutfit(date, rejectedIds.slice(-MAX_EXCLUDED)));
  if (!response.ok) return response;

  const body = response.value;
  if (body.status === "incomplete") {
    return { ok: true, value: { kind: "incomplete", missing: body.missing_slots, reasoning: body.reasoning } };
  }
  if (body.status === "exhausted") return { ok: true, value: { kind: "exhausted", reasoning: body.reasoning } };

  const outfit = await buildOutfit(
    gateway,
    { id: body.suggestion_id, garment_ids: [body.outfit.top, body.outfit.bottom, body.outfit.shoes], accepted: false },
    body.reasoning,
  );
  if (!outfit.ok) return outfit;
  if (!outfit.value) return { ok: false, error: "Could not load your outfit. Please try again." };
  return { ok: true, value: { kind: "outfit", outfit: outfit.value } };
}

// Opening the screen again on the same day shows the same outfit instead of
// generating (and saving) a new one every time. Only a rejected or no-longer-
// wearable outfit is replaced.
export async function loadToday(gateway: TodayGateway, date: ISODate): Promise<Result<TodayState>> {
  const rows = await call(() => gateway.loadSuggestions(date));
  if (!rows.ok) return rows;

  const rejected = rows.value.filter((row) => row.feedback === "down").map((row) => row.id);
  const latest = rows.value[rows.value.length - 1];
  if (latest && latest.feedback !== "down") {
    const outfit = await buildOutfit(gateway, latest, null);
    if (!outfit.ok) return outfit;
    if (outfit.value) return { ok: true, value: { kind: "outfit", outfit: outfit.value } };
  }
  return generate(gateway, date, rejected);
}

// "No, show another": records the thumbs-down (the AI learns from it), then picks a new outfit.
export async function rejectOutfit(
  gateway: TodayGateway,
  date: ISODate,
  suggestionId: UUID,
): Promise<Result<TodayState>> {
  const sent = await sendFeedbackOnce(gateway, suggestionId, "down");
  if (!sent.ok) return sent;
  return loadToday(gateway, date);
}

// "Yes, wear this": marks the garments as worn today, then tells the AI it was a good pick.
export async function wearOutfit(gateway: TodayGateway, suggestionId: UUID): Promise<Result<true>> {
  const accepted = await call(async () => {
    const res = await gateway.acceptSuggestion(suggestionId);
    return { data: res.error ? null : (true as const), error: res.error };
  });
  if (!accepted.ok) return accepted;

  // The outfit is already marked as worn; a failed thumbs-up only loses one lesson.
  await sendFeedbackOnce(gateway, suggestionId, "up");
  return accepted;
}

// Feedback counts once per suggestion, so "already recorded" (409) is not an error.
async function sendFeedbackOnce(
  gateway: TodayGateway,
  suggestionId: UUID,
  feedback: FeedbackValue,
): Promise<Result<true>> {
  try {
    const res = await gateway.sendFeedback(suggestionId, feedback);
    if (res.error && res.error.status !== 409) return { ok: false, error: friendlyTodayError(res.error) };
    return { ok: true, value: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
