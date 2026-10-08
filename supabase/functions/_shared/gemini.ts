// Gemini client for garment tagging. fetch is injected so it is unit-tested
// without a network; the API key only ever goes in a header, never in a URL or error.
import { COLORS, GARMENT_TYPES, SEASONS, WARMTH_MAX, WARMTH_MIN } from "./tag-schema.ts";
import { parseModelOutput } from "./tag-validation.ts";
import { buildVisionPrompt } from "./vision-prompt.ts";
import type { AnalyzeGarmentResponse } from "./types.ts";

export const DEFAULT_MODEL = "gemini-2.5-flash";
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const MAX_IMAGE_BASE64_CHARS = 7_000_000; // roughly 5 MB of image

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: "bad_image" | "rate_limited" | "upstream" | "network",
    readonly status?: number,
  ) {
    super(message);
  }
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "network" || (this.status ?? 0) >= 500;
  }
}

export interface GeminiDeps {
  fetch: typeof fetch;
  apiKey: string;
  model?: string;
}

export interface ImageInput {
  base64: string;
  mimeType: string;
}

const str = (values: readonly string[]) => ({ type: "STRING", enum: [...values] });

export function buildGeminiRequest(image: ImageInput) {
  const confidence = { type: "NUMBER" };
  return {
    contents: [
      { parts: [{ text: buildVisionPrompt() }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          type: str(GARMENT_TYPES),
          color: str(COLORS),
          season: str(SEASONS),
          warmth: { type: "INTEGER", minimum: WARMTH_MIN, maximum: WARMTH_MAX },
          confidence: {
            type: "OBJECT",
            properties: { type: confidence, color: confidence, season: confidence, warmth: confidence },
            required: ["type", "color", "season", "warmth"],
          },
        },
        required: ["type", "color", "season", "warmth", "confidence"],
      },
    },
  };
}

export function extractText(response: unknown): string | undefined {
  const candidates = (response as { candidates?: unknown })?.candidates;
  if (!Array.isArray(candidates)) return undefined;
  const parts = (candidates[0] as { content?: { parts?: unknown } } | undefined)?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  const text = parts.map((p) => (typeof (p as { text?: unknown })?.text === "string" ? (p as { text: string }).text : "")).join("");
  return text.trim() === "" ? undefined : text;
}

export async function analyzeImage(deps: GeminiDeps, image: ImageInput): Promise<AnalyzeGarmentResponse> {
  if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(image.mimeType)) {
    throw new GeminiError(`unsupported image type ${image.mimeType}`, "bad_image");
  }
  if (image.base64.length === 0 || image.base64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new GeminiError("image is empty or too large", "bad_image");
  }

  const url = `${GEMINI_BASE_URL}/${deps.model ?? DEFAULT_MODEL}:generateContent`;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": deps.apiKey },
      body: JSON.stringify(buildGeminiRequest(image)),
    });
  } catch {
    throw new GeminiError("could not reach the vision service", "network");
  }

  if (!response.ok) {
    if (response.status === 429) throw new GeminiError("vision service rate limit reached", "rate_limited", 429);
    throw new GeminiError(`vision service error (HTTP ${response.status})`, "upstream", response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GeminiError("vision service returned an unreadable response", "upstream", response.status);
  }

  const text = extractText(body);
  if (text === undefined) {
    const result = parseModelOutput("");
    result.warnings = ["the model returned no content (the photo may have been blocked)"];
    return result;
  }
  return parseModelOutput(text);
}
