// Calling the Supabase edge functions (analyze-garment, generate-outfit, update-preferences)
// and keeping the HTTP status of a failure so screens can explain it in plain words.
// Typed structurally so it can be tested with a fake client (tests/todayGateway.test.ts).
import type { GatewayError, GatewayResult } from "./household.ts";

// What supabase-js returns when an edge function answers with an error status:
// `context` is the HTTP response (FunctionsHttpError), absent when the request never got through.
export interface FunctionsError {
  message: string;
  context?: { status?: unknown; json?: () => Promise<unknown> };
}

export interface FunctionsClientLike {
  functions: { invoke(name: string, options: { body: unknown }): Promise<{ data: unknown; error: FunctionsError | null }> };
}

export const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

// Reads the status and the server's own message out of a failed function call.
export async function functionError(error: FunctionsError): Promise<GatewayError> {
  const status = typeof error.context?.status === "number" ? error.context.status : undefined;
  // No status means the request never reached the function (offline, DNS, timeout).
  if (status === undefined) return { message: NETWORK_ERROR };
  let message = error.message;
  try {
    const body = await error.context?.json?.();
    const text = (body as { error?: unknown } | null)?.error;
    if (typeof text === "string") message = text;
  } catch {
    // keep the generic message
  }
  return { message, status };
}

export async function invokeFunction<T>(
  client: FunctionsClientLike,
  name: string,
  body: unknown,
): Promise<GatewayResult<T>> {
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) return { data: null, error: await functionError(error) };
  return { data: data as T, error: null };
}
