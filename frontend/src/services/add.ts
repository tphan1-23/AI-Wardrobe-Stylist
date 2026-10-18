// Adding a garment: upload the photo, ask the AI for tags, let the person review and
// fix them, then save. Pure TypeScript with an injected gateway so it is unit-tested
// without React Native or a network (see tests/add.test.ts).
//
// Proposing tags is the AI core's job (`analyze-garment`, owned by Manuel + Claude);
// this file uploads, asks, keeps the review state and saves. The rule it enforces
// (D4): the person must fill in or confirm every field the AI was unsure about
// before a garment is saved.
import {
  COLORS,
  GARMENT_TYPES,
  SEASONS,
  WARMTH_MAX,
  WARMTH_MIN,
  isColor,
  isGarmentType,
  isSeason,
  isWarmth,
  type Warmth,
} from "../../../supabase/functions/_shared/tag-schema.ts";
import type { AnalyzeGarmentResponse, GarmentTags, UUID } from "../../../supabase/functions/_shared/types.ts";
import type { GatewayResult, Result } from "./household.ts";

export const TAG_FIELDS = ["type", "color", "season", "warmth"] as const satisfies readonly (keyof GarmentTags)[];
export type TagField = (typeof TAG_FIELDS)[number];

// analyze-garment accepts these (about 5 MB at most).
export const PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export interface AddGateway {
  // Uploads to the private bucket; fails if the path is already taken.
  uploadPhoto(path: string, data: ArrayBuffer, contentType: string): Promise<GatewayResult<unknown>>;
  removePhoto(path: string): Promise<GatewayResult<unknown>>;
  analyze(path: string): Promise<GatewayResult<AnalyzeGarmentResponse>>;
  insertGarment(row: GarmentInsert): Promise<GatewayResult<unknown>>;
}

export interface GarmentInsert extends GarmentTags {
  owner_id: UUID;
  image_path: string;
}

export interface PickedPhoto {
  data: ArrayBuffer;
  // File extension of the picked image, with or without a dot ("jpg", ".HEIC").
  extension: string;
}

// ---- Photo paths ------------------------------------------------------------

export function normalizeExtension(extension: string): string {
  const clean = extension.trim().toLowerCase().replace(/^\./, "");
  return clean === "jpeg" ? "jpg" : clean;
}

export function contentTypeFor(extension: string): string {
  switch (normalizeExtension(extension)) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

export function validatePhoto(photo: PickedPhoto): string | null {
  const extension = normalizeExtension(photo.extension);
  if (!(PHOTO_EXTENSIONS as readonly string[]).includes(extension)) {
    return "That photo type is not supported. Use a JPG, PNG, WebP or HEIC photo.";
  }
  if (photo.data.byteLength === 0) return "That photo is empty. Pick another one.";
  if (photo.data.byteLength > MAX_PHOTO_BYTES) return "That photo is too large (5 MB at most). Pick a smaller one.";
  return null;
}

// Photos live in the person's own folder, which is what the storage rules require (D18).
export function photoPath(userId: UUID, id: string, extension: string): string {
  return `${userId}/${id}.${normalizeExtension(extension)}`;
}

// ---- Review state -----------------------------------------------------------

export interface ReviewState {
  photoPath: string;
  tags: Partial<GarmentTags>;
  // Fields the AI left out or was unsure about: the person must fill or confirm each.
  needsReview: TagField[];
  // Fields the person has looked at (edited or tapped "looks right").
  confirmed: TagField[];
  // True when the AI gave no usable answer and every field is typed by hand.
  manual: boolean;
  warnings: string[];
}

function validTags(tags: Partial<GarmentTags>): Partial<GarmentTags> {
  const out: Partial<GarmentTags> = {};
  if (isGarmentType(tags.type)) out.type = tags.type;
  if (isColor(tags.color)) out.color = tags.color;
  if (isSeason(tags.season)) out.season = tags.season;
  if (isWarmth(tags.warmth)) out.warmth = tags.warmth;
  return out;
}

// The AI's answer, made safe: invalid values are dropped, and every field that is
// missing (or invalid) is flagged for review even if the AI did not list it.
export function reviewFromAnalysis(path: string, response: AnalyzeGarmentResponse): ReviewState {
  const tags = validTags(response.tags ?? {});
  const flagged = new Set<TagField>(
    (response.needs_review ?? []).filter((f): f is TagField => (TAG_FIELDS as readonly string[]).includes(f)),
  );
  for (const field of TAG_FIELDS) if (tags[field] === undefined) flagged.add(field);
  return {
    photoPath: path,
    tags,
    needsReview: TAG_FIELDS.filter((f) => flagged.has(f)),
    confirmed: [],
    manual: false,
    warnings: [...(response.warnings ?? [])],
  };
}

// When the AI is unavailable the person types everything (nothing is prefilled).
export function manualReview(path: string, warning: string): ReviewState {
  return { photoPath: path, tags: {}, needsReview: [...TAG_FIELDS], confirmed: [], manual: true, warnings: [warning] };
}

// Changing a value counts as confirming it.
export function setTag<F extends TagField>(state: ReviewState, field: F, value: GarmentTags[F]): ReviewState {
  const valid = validTags({ [field]: value } as Partial<GarmentTags>);
  if (valid[field] === undefined) return state;
  return {
    ...state,
    tags: { ...state.tags, [field]: value },
    confirmed: state.confirmed.includes(field) ? state.confirmed : [...state.confirmed, field],
  };
}

// "Looks right": only possible when there is a value to confirm.
export function confirmTag(state: ReviewState, field: TagField): ReviewState {
  if (state.tags[field] === undefined || state.confirmed.includes(field)) return state;
  return { ...state, confirmed: [...state.confirmed, field] };
}

export function unconfirmedFields(state: ReviewState): TagField[] {
  return state.needsReview.filter((f) => !state.confirmed.includes(f));
}

const FIELD_NAMES: Record<TagField, string> = { type: "type", color: "color", season: "season", warmth: "warmth" };

export function validateReview(state: ReviewState): string | null {
  const missing = TAG_FIELDS.filter((f) => state.tags[f] === undefined);
  if (missing.length > 0) return `Choose the ${missing.map((f) => FIELD_NAMES[f]).join(", ")}.`;
  const unconfirmed = unconfirmedFields(state);
  if (unconfirmed.length > 0) return `Check the ${unconfirmed.map((f) => FIELD_NAMES[f]).join(", ")} before saving.`;
  return null;
}

// What the screens offer for each field (the tag schema is the one source of truth).
export const TYPE_CHOICES = GARMENT_TYPES;
export const COLOR_CHOICES = COLORS;
export const SEASON_CHOICES = SEASONS;
export const WARMTH_CHOICES: Warmth[] = Array.from({ length: WARMTH_MAX - WARMTH_MIN + 1 }, (_, i) => (WARMTH_MIN + i) as Warmth);

// ---- Errors -----------------------------------------------------------------

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

async function guard<T>(run: () => Promise<GatewayResult<T>>): Promise<GatewayResult<T>> {
  try {
    return await run();
  } catch {
    return { data: null, error: { message: NETWORK_ERROR } };
  }
}

// ---- Flow -------------------------------------------------------------------

// Uploads the photo, asks the AI for tags and returns the review state.
// If the AI is busy or down (429, 502) the person still gets a review state, filled in by hand.
// If the photo itself is the problem it is removed again so no orphan is left in storage.
export async function addPhoto(
  gateway: AddGateway,
  userId: UUID,
  photo: PickedPhoto,
  newId: () => string,
): Promise<Result<ReviewState>> {
  const problem = validatePhoto(photo);
  if (problem) return { ok: false, error: problem };

  const path = photoPath(userId, newId(), photo.extension);
  const uploaded = await guard(() => gateway.uploadPhoto(path, photo.data, contentTypeFor(photo.extension)));
  if (uploaded.error) return { ok: false, error: friendlyAddError(uploaded.error.message) };

  const analyzed = await guard(() => gateway.analyze(path));
  if (!analyzed.error && analyzed.data) return { ok: true, value: reviewFromAnalysis(path, analyzed.data) };

  const status = analyzed.error?.status;
  if (status === 429) {
    return { ok: true, value: manualReview(path, "The AI is busy right now, so please enter the tags yourself.") };
  }
  if (status === 502 || status === undefined) {
    // 502: AI service down. No status: network trouble; the photo is uploaded, so typing the tags still works.
    return { ok: true, value: manualReview(path, "The AI could not read this photo, so please enter the tags yourself.") };
  }
  // 400 (unsupported/too large), 403, 404: the photo is no use. Clean it up.
  await guard(() => gateway.removePhoto(path));
  return { ok: false, error: friendlyAddError(analyzed.error?.message ?? "", status) };
}

export function friendlyAddError(message: string, status?: number): string {
  if (status === 400) return "That photo could not be used. Try a smaller JPG, PNG or HEIC photo.";
  if (status === 404) return "The photo did not upload correctly. Please try again.";
  if (status === 401) return "Your session expired. Please sign in again.";
  const text = message.toLowerCase();
  if (text.includes("already exists") || text.includes("duplicate")) return "That photo was already added. Please try again.";
  if (text.includes("payload too large") || text.includes("too large")) return "That photo is too large (5 MB at most).";
  if (text.includes("network") || text.includes("fetch") || text.includes("could not reach")) return NETWORK_ERROR;
  return message || NETWORK_ERROR;
}

// Saves the reviewed garment. The photo stays in storage if saving fails so the person can retry.
export async function saveGarment(gateway: AddGateway, userId: UUID, state: ReviewState): Promise<Result<true>> {
  const problem = validateReview(state);
  if (problem) return { ok: false, error: problem };
  const { type, color, season, warmth } = state.tags as GarmentTags;
  const saved = await guard(() => gateway.insertGarment({ owner_id: userId, image_path: state.photoPath, type, color, season, warmth }));
  if (saved.error) return { ok: false, error: friendlyAddError(saved.error.message, saved.error.status) };
  return { ok: true, value: true };
}

// "Cancel": the photo was never saved as a garment, so remove it from storage.
export async function discardPhoto(gateway: AddGateway, state: Pick<ReviewState, "photoPath">): Promise<void> {
  await guard(() => gateway.removePhoto(state.photoPath));
}
