// Prompt for the garment-tagging call. Built from the shared vocabulary so the
// model's allowed answers can never drift from the tag schema.
import { COLORS, GARMENT_TYPES, SEASONS, WARMTH_MAX, WARMTH_MIN } from "./tag-schema.ts";

// Bump on every prompt change and log the accuracy impact in brain/AI Logic Ownership.md.
export const PROMPT_VERSION = "v1";

export function buildVisionPrompt(): string {
  return [
    "You tag a single clothing item from a photo for a wardrobe app.",
    "Answer with ONE JSON object and nothing else, using exactly these keys:",
    `- "type": one of ${GARMENT_TYPES.join(", ")}`,
    `- "color": the dominant color, one of ${COLORS.join(", ")}`,
    `- "season": one of ${SEASONS.join(", ")} (use "all" if it suits any season)`,
    `- "warmth": integer ${WARMTH_MIN} (very light, e.g. tank top, sandals) to ${WARMTH_MAX} (very warm, e.g. heavy sweater, winter boots)`,
    `- "confidence": an object with the keys type, color, season, warmth, each a number from 0 to 1 for how sure you are`,
    "If the photo shows several items, tag the most prominent one. If you cannot tell a field, give your best guess with low confidence.",
    "Do not invent values outside the lists above.",
  ].join("\n");
}
