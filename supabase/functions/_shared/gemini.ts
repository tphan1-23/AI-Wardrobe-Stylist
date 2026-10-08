// Gemini client for garment tagging. fetch is injected so it is unit-tested
// without a network; the API key only ever goes in a header, never in a URL or error.
import { COLORS, GARMENT_TYPES, SEASONS, WARMTH_MAX, WARMTH_MIN } from "./tag-schema.ts";
import { parseModelOutput } from "./tag-validation.ts";
import { buildVisionPrompt } from "./vision-prompt.ts";
import type { AnalyzeGarmentResponse } from "./types.ts";

// Tried in order. gemini-2.5-* are no longer available to new API keys (HTTP 404), and the free tier
// returns 503 under load, so one model name is not enough.
export const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.7-flash"] as const;
export const DEFAULT_MODEL = DEFAULT_MODELS[0];
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
export const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const MAX_IMAGE_BASE64_CHARS = 7_000_000; // roughly 5 MB of image

export class GeminiError extends Error {
  // quota_exhausted = a per-day limit; retrying the same model is pointless until it resets.
  readonly kind: "bad_image" | "rate_limited" | "quota_exhausted" | "upstream" | "network";
  readonly status?: number;

  // Written out (no parameter properties) so plain Node can run this file.
  constructor(message: string, kind: GeminiError["kind"], status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "network" || (this.status ?? 0) >= 500;
  }
}

export interface GeminiDeps {
  fetch: typeof fetch;
  apiKey: string;
  // One model (no fallback) or an ordered list to fall back through; defaults to DEFAULT_MODELS.
  model?: string;
  models?: readonly string[];
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

// Whether trying the next model could help: overloaded, rate limited, or the model was retired (404).
function canFallBack(error: GeminiError): boolean {
  // Quotas are per model, so another model may still have room.
  return error.retryable || error.status === 404 || error.kind === "quota_exhausted";
}

// Google reports the daily free-tier limit as 429 RESOURCE_EXHAUSTED with a quota id containing "PerDay".
async function isDailyQuota(response: Response): Promise<boolean> {
  try {
    return JSON.stringify(await response.json()).includes("PerDay");
  } catch {
    return false;
  }
}

async function requestModel(deps: GeminiDeps, model: string, image: ImageInput): Promise<unknown> {
  const url = `${GEMINI_BASE_URL}/${model}:generateContent`;
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
    if (response.status === 429) {
      if (await isDailyQuota(response)) throw new GeminiError("daily vision quota used up", "quota_exhausted", 429);
      throw new GeminiError("vision service rate limit reached", "rate_limited", 429);
    }
    throw new GeminiError(`vision service error (HTTP ${response.status})`, "upstream", response.status);
  }

  try {
    return await response.json();
  } catch {
    throw new GeminiError("vision service returned an unreadable response", "upstream", response.status);
  }
}

export async function analyzeImage(deps: GeminiDeps, image: ImageInput): Promise<AnalyzeGarmentResponse> {
  if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(image.mimeType)) {
    throw new GeminiError(`unsupported image type ${image.mimeType}`, "bad_image");
  }
  if (image.base64.length === 0 || image.base64.length > MAX_IMAGE_BASE64_CHARS) {
    throw new GeminiError("image is empty or too large", "bad_image");
  }

  const models = deps.models ?? (deps.model ? [deps.model] : DEFAULT_MODELS);
  let body: unknown;
  for (const [i, model] of models.entries()) {
    try {
      body = await requestModel(deps, model, image);
      break;
    } catch (error) {
      const last = i === models.length - 1;
      if (last || !(error instanceof GeminiError) || !canFallBack(error)) throw error;
    }
  }

  const text = extractText(body);
  if (text === undefined) {
    const result = parseModelOutput("");
    result.warnings = ["the model returned no content (the photo may have been blocked)"];
    return result;
  }
  return parseModelOutput(text);
}
