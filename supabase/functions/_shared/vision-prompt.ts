// Prompt for the garment-tagging call. Built from the shared vocabulary so the
// model's allowed answers can never drift from the tag schema.
import { COLORS, GARMENT_TYPES, MAX_COLORS, SEASONS, WARMTH_MAX, WARMTH_MIN } from "./tag-schema.ts";

// Bump on every prompt change and log the accuracy impact in brain/AI Logic Ownership.md.
export const PROMPT_VERSION = "v3";
// v3 (2026-11-15): "colors" and "seasons" are lists (several colors, several seasons) instead of one "color" and one "season".
//   NOT yet measured against the labelled photos: run scripts/eval-tagging.ts with a Gemini key and log the before/after numbers.
// v2 (2026-11-06): asks for a bounding box of the item ("box") so the app can suggest a crop. Tag wording unchanged.

export function buildVisionPrompt(): string {
  return [
    "You tag a single clothing item from a photo for a wardrobe app.",
    "Answer with ONE JSON object and nothing else, using exactly these keys:",
    `- "type": one of ${GARMENT_TYPES.join(", ")}`,
    `- "colors": a list of 1 to ${MAX_COLORS} colors the item clearly shows, the dominant one first, each one of ${COLORS.join(", ")} (a plain item has just one)`,
    `- "seasons": a list of the seasons it suits, each one of ${SEASONS.join(", ")} (just ["all"] if it suits any season; never "all" together with others)`,
    `- "warmth": integer ${WARMTH_MIN} (very light, e.g. tank top, sandals) to ${WARMTH_MAX} (very warm, e.g. heavy sweater, winter boots)`,
    '- "box": where the tagged item is in the photo as [ymin, xmin, ymax, xmax], four integers from 0 to 1000 (fractions of the image height and width, times 1000), tight around the whole item',
    `- "confidence": an object with the keys type, colors, seasons, warmth, each a number from 0 to 1 for how sure you are`,
    "If the photo shows several items, tag the most prominent one. If you cannot tell a field, give your best guess with low confidence.",
    "Do not invent values outside the lists above.",
  ].join("\n");
}
