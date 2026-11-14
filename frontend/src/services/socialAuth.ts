// Sign in / sign up with Google. Pure TypeScript with injected clients
// so it can be unit-tested without a device (see tests/socialAuth.test.ts).
//
// Google creates the account on first use, so one button covers sign-up and
// log-in. It runs Supabase's OAuth flow in a system browser. (Apple sign-in was
// dropped, decision D23: it needs the paid Apple Developer Program.)

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
}

// The slice of expo-web-browser that this module uses.
export interface AuthBrowser {
  openAuthSessionAsync(url: string, redirectUrl: string): Promise<{ type: string; url?: string }>;
}

export type SocialResult = { ok: true } | { ok: false; error: string; cancelled: boolean };

const cancelled: SocialResult = { ok: false, error: "", cancelled: true };
const failed = (error: string): SocialResult => ({ ok: false, error, cancelled: false });

const GOOGLE_FAILED = "Google sign-in did not finish. Please try again.";

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
