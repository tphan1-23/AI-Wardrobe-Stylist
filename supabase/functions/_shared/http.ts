// Pure helpers for the Deno entry files.
import type { HandlerResult } from "./handlers.ts";

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
} as const;

export interface HttpReply {
  status: number;
  body: unknown;
}

export function toReply<T>(result: HandlerResult<T>): HttpReply {
  return result.ok ? { status: 200, body: result.body } : { status: result.status, body: { error: result.error } };
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1]! : null;
}
