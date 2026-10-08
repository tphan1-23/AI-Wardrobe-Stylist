import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_MODEL,
  DEFAULT_MODELS,
  GeminiError,
  MAX_IMAGE_BASE64_CHARS,
  analyzeImage,
  buildGeminiRequest,
  extractText,
} from "../supabase/functions/_shared/gemini.ts";
import { COLORS, GARMENT_TYPES, SEASONS } from "../supabase/functions/_shared/tag-schema.ts";

const KEY = "secret-test-key-123";
const image = { base64: "aGVsbG8=", mimeType: "image/jpeg" };
const tags = { type: "jeans", color: "navy", season: "all", warmth: 3, confidence: { type: 0.9, color: 0.9, season: 0.8, warmth: 0.7 } };
const geminiBody = (text: string) => ({ candidates: [{ content: { parts: [{ text }] } }] });
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("buildGeminiRequest", () => {
  const req = buildGeminiRequest(image);

  it("sends the prompt and the image, deterministic and JSON-only", () => {
    const parts = req.contents[0]!.parts;
    expect(parts[0]).toHaveProperty("text");
    expect(parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: "aGVsbG8=" } });
    expect(req.generationConfig.temperature).toBe(0);
    expect(req.generationConfig.responseMimeType).toBe("application/json");
  });

  it("constrains the answer to the tag vocabulary", () => {
    const p = req.generationConfig.responseSchema.properties;
    expect(p.type.enum).toEqual(GARMENT_TYPES);
    expect(p.color.enum).toEqual(COLORS);
    expect(p.season.enum).toEqual(SEASONS);
    expect(p.warmth).toMatchObject({ minimum: 1, maximum: 5 });
    expect(req.generationConfig.responseSchema.required).toContain("confidence");
  });
});

describe("extractText", () => {
  it("joins text parts and ignores everything else", () => {
    expect(extractText({ candidates: [{ content: { parts: [{ text: "{" }, { inlineData: 1 }, { text: "}" }] } }] })).toBe("{}");
  });
  it.each([null, undefined, {}, { candidates: [] }, { candidates: [{}] }, { candidates: [{ content: { parts: [{ text: "  " }] } }] }, "x"])(
    "returns undefined for %j",
    (bad) => expect(extractText(bad)).toBeUndefined(),
  );
});

describe("analyzeImage", () => {
  it("returns validated tags for a normal answer, calling the right URL with the key only in a header", async () => {
    const fetchMock = vi.fn(async () => reply(200, geminiBody(JSON.stringify(tags))));
    const result = await analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image);
    expect(result.tags).toEqual({ type: "jeans", color: "navy", season: "all", warmth: 3 });
    expect(result.needs_review).toEqual([]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("uses a custom model and cleans up fenced or sloppy output", async () => {
    const fetchMock = vi.fn(async () => reply(200, geminiBody("```json\n" + JSON.stringify({ ...tags, color: "Grey" }) + "\n```")));
    const result = await analyzeImage({ fetch: fetchMock as never, apiKey: KEY, model: "gemini-test" }, image);
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain("/gemini-test:generateContent");
    expect(result.tags.color).toBe("gray");
  });

  it("flags every field when the model returns nothing usable", async () => {
    for (const body of [{ candidates: [] }, { promptFeedback: { blockReason: "SAFETY" } }]) {
      const result = await analyzeImage({ fetch: (async () => reply(200, body)) as never, apiKey: KEY }, image);
      expect(result.tags).toEqual({});
      expect(result.needs_review).toHaveLength(4);
      expect(result.warnings[0]).toContain("no content");
    }
  });

  it("maps rate limiting to a retryable error", async () => {
    const err = await analyzeImage({ fetch: (async () => reply(429, { error: { message: "quota" } })) as never, apiKey: KEY }, image).catch((e) => e);
    expect(err).toBeInstanceOf(GeminiError);
    expect(err).toMatchObject({ kind: "rate_limited", status: 429, retryable: true });
  });

  it("separates client errors from server errors", async () => {
    const bad = await analyzeImage({ fetch: (async () => reply(400, { error: { message: "bad key " + KEY } })) as never, apiKey: KEY }, image).catch((e) => e);
    expect(bad).toMatchObject({ kind: "upstream", status: 400, retryable: false });
    expect(bad.message).not.toContain(KEY);
    const down = await analyzeImage({ fetch: (async () => reply(503, {})) as never, apiKey: KEY }, image).catch((e) => e);
    expect(down).toMatchObject({ kind: "upstream", status: 503, retryable: true });
  });

  it("handles network failures and unreadable responses", async () => {
    const net = await analyzeImage({ fetch: (async () => { throw new TypeError("fetch failed " + KEY); }) as never, apiKey: KEY }, image).catch((e) => e);
    expect(net).toMatchObject({ kind: "network", retryable: true });
    expect(net.message).not.toContain(KEY);
    const garbage = await analyzeImage({ fetch: (async () => new Response("<html>", { status: 200 })) as never, apiKey: KEY }, image).catch((e) => e);
    expect(garbage).toMatchObject({ kind: "upstream" });
  });

  it("rejects bad images before spending a request", async () => {
    const fetchMock = vi.fn();
    const deps = { fetch: fetchMock as never, apiKey: KEY };
    for (const bad of [
      { base64: "aGk=", mimeType: "application/pdf" },
      { base64: "", mimeType: "image/png" },
      { base64: "a".repeat(MAX_IMAGE_BASE64_CHARS + 1), mimeType: "image/png" },
    ]) {
      await expect(analyzeImage(deps, bad)).rejects.toMatchObject({ kind: "bad_image", retryable: false });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("model fallback", () => {
  const modelOf = (call: unknown) => (call as [string])[0].match(/models\/([^:]+):/)![1];
  const ok = () => reply(200, geminiBody(JSON.stringify(tags)));

  it("falls back to the next model when one is overloaded (503)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(503, {})).mockResolvedValueOnce(ok());
    const result = await analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image);
    expect(result.tags.type).toBe("jeans");
    expect(fetchMock.mock.calls.map(modelOf)).toEqual([DEFAULT_MODELS[0], DEFAULT_MODELS[1]]);
  });

  it("falls back when a model is retired for new keys (404) or rate limited (429), and when the network drops", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(404, { error: { message: "no longer available to new users" } }))
      .mockResolvedValueOnce(reply(429, {}))
      .mockResolvedValueOnce(ok());
    expect((await analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image)).tags.type).toBe("jeans");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("down")).mockResolvedValueOnce(ok());
    expect((await analyzeImage({ fetch: flaky as never, apiKey: KEY }, image)).tags.type).toBe("jeans");
  });

  it("recognizes the daily free-tier limit, does not call it retryable, and still tries the next model", async () => {
    const daily = { error: { status: "RESOURCE_EXHAUSTED", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } };
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(429, daily)).mockResolvedValueOnce(ok());
    expect((await analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image)).tags.type).toBe("jeans");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const allUsed = vi.fn(async () => reply(429, daily));
    const err = await analyzeImage({ fetch: allUsed as never, apiKey: KEY }, image).catch((e) => e);
    expect(err).toMatchObject({ kind: "quota_exhausted", status: 429, retryable: false });
    expect(allUsed).toHaveBeenCalledTimes(DEFAULT_MODELS.length);
  });

  it("treats a per-minute 429 as retryable and an unreadable 429 body as per-minute", async () => {
    const perMinute = { error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier" }] }] } };
    const a = await analyzeImage({ fetch: (async () => reply(429, perMinute)) as never, apiKey: KEY, model: "m" }, image).catch((e) => e);
    expect(a).toMatchObject({ kind: "rate_limited", retryable: true });
    const b = await analyzeImage({ fetch: (async () => new Response("<html>", { status: 429 })) as never, apiKey: KEY, model: "m" }, image).catch((e) => e);
    expect(b).toMatchObject({ kind: "rate_limited", retryable: true });
  });

  it("does not fall back on a bad request (400): that is our bug, not capacity", async () => {
    const fetchMock = vi.fn(async () => reply(400, { error: { message: "bad schema" } }));
    await expect(analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up with the last error after trying every model", async () => {
    const fetchMock = vi.fn(async () => reply(503, {}));
    await expect(analyzeImage({ fetch: fetchMock as never, apiKey: KEY }, image)).rejects.toMatchObject({ status: 503, retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_MODELS.length);
  });

  it("a single `model` means no fallback, and `models` sets the order", async () => {
    const single = vi.fn(async () => reply(503, {}));
    await expect(analyzeImage({ fetch: single as never, apiKey: KEY, model: "only-this" }, image)).rejects.toBeInstanceOf(GeminiError);
    expect(single).toHaveBeenCalledTimes(1);
    const ordered = vi.fn().mockResolvedValueOnce(reply(503, {})).mockResolvedValueOnce(ok());
    await analyzeImage({ fetch: ordered as never, apiKey: KEY, models: ["first", "second"] }, image);
    expect(ordered.mock.calls.map(modelOf)).toEqual(["first", "second"]);
  });
});
