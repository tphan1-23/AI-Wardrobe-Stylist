// Sign in / sign up with Google or Apple. Pure TypeScript with injected clients
// so it can be unit-tested without a device (see tests/socialAuth.test.ts).
//
// Both providers create the account on first use, so one button covers sign-up
// and log-in. Google runs Supabase's OAuth flow in a system browser; Apple uses
// the native sheet and hands Supabase the identity token.

interface AuthError {
  message: string;
}

// The slice of supabase.auth that this module uses.
export interface SocialAuthClient {
  signInWithOAuth(credentials: {
    provider: "google";
    options: { redirectTo: string; skipBrowserRedirect: boolean };
  }): Promise<{ data: { url: string | null }; error: AuthError | null }>;
  setSession(tokens: { access_token: string; refresh_token: string }): Promise<{ error: AuthError | null }>;
  signInWithIdToken(credentials: { provider: "apple"; token: string }): Promise<{ error: AuthError | null }>;
  updateUser(attributes: { data: Record<string, unknown> }): Promise<{ error: AuthError | null }>;
}

// The slice of expo-web-browser that this module uses.
export interface AuthBrowser {
  openAuthSessionAsync(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>;
}

export interface AppleCredential {
  identityToken: string | null;
  // Apple only sends the name the first time a person signs in with the app.
  fullName: { givenName?: string | null; familyName?: string | null } | null;
}

export type SocialResult = { ok: true } | { ok: false; error: string; cancelled: boolean };

const cancelled: SocialResult = { ok: false, error: "", cancelled: true };
const failed = (error: string): SocialResult => ({ ok: false, error, cancelled: false });

const GOOGLE_FAILED = "Google sign-in did not finish. Please try again.";
const APPLE_FAILED = "Apple sign-in did not finish. Please try again.";

export type RedirectResult =
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string };

// Reads the tokens (or the error) Supabase puts in the URL it redirects back to.
// With the default implicit flow they arrive in the #fragment; errors may arrive
// in either the fragment or the ?query.
export function parseAuthRedirect(url: string): RedirectResult | null {
  const hash = url.indexOf("#");
  const fragment = hash === -1 ? "" : url.slice(hash + 1);
  const beforeHash = hash === -1 ? url : url.slice(0, hash);
  const query = beforeHash.includes("?") ? beforeHash.slice(beforeHash.indexOf("?") + 1) : "";
  const fromFragment = new URLSearchParams(fragment);
  const fromQuery = new URLSearchParams(query);
  const read = (key: string) => fromFragment.get(key) ?? fromQuery.get(key);

  const error = read("error_description") ?? read("error");
  if (error) return { kind: "error", message: error };

  const accessToken = read("access_token");
  const refreshToken = read("refresh_token");
  if (accessToken && refreshToken) return { kind: "session", accessToken, refreshToken };
  return null;
}

export async function signInWithGoogle(
  client: SocialAuthClient,
  browser: AuthBrowser,
  redirectUrl: string,
): Promise<SocialResult> {
  try {
    const { data, error } = await client.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectUrl, skipBrowserRedirect: true },
    });
    if (error || !data.url) return failed(error?.message ?? GOOGLE_FAILED);

    const result = await browser.openAuthSessionAsync(data.url, redirectUrl);
    // Closing the browser sheet is a choice, not an error.
    if (result.type !== "success") return cancelled;
    // Only accept a redirect back to this app, never some other address.
    if (!result.url || !result.url.startsWith(redirectUrl)) return failed(GOOGLE_FAILED);

    const parsed = parseAuthRedirect(result.url);
    if (!parsed) return failed(GOOGLE_FAILED);
    if (parsed.kind === "error") {
      // Choosing "Cancel" on Google's consent screen comes back as access_denied.
      return /denied/i.test(parsed.message) ? cancelled : failed(parsed.message);
    }

    const { error: sessionError } = await client.setSession({
      access_token: parsed.accessToken,
      refresh_token: parsed.refreshToken,
    });
    if (sessionError) return failed(sessionError.message);
    return { ok: true };
  } catch {
    return failed(GOOGLE_FAILED);
  }
}

export function formatAppleName(fullName: AppleCredential["fullName"]): string {
  return [fullName?.givenName, fullName?.familyName]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ");
}

function isAppleCancel(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ERR_REQUEST_CANCELED";
}

export async function signInWithApple(
  client: SocialAuthClient,
  getCredential: () => Promise<AppleCredential>,
): Promise<SocialResult> {
  try {
    const credential = await getCredential();
    if (!credential.identityToken) return failed(APPLE_FAILED);

    const { error } = await client.signInWithIdToken({ provider: "apple", token: credential.identityToken });
    if (error) return failed(error.message);

    // Apple shares the name once, so save it now. The sign-in already worked, so a
    // failure here must not undo it (the profile just keeps an empty name).
    const name = formatAppleName(credential.fullName);
    if (name) await client.updateUser({ data: { name } }).catch(() => undefined);
    return { ok: true };
  } catch (error) {
    return isAppleCancel(error) ? cancelled : failed(APPLE_FAILED);
  }
}
