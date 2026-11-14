import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  OAUTH_REDIRECT_URL,
  parseAuthRedirect,
  signInWithGoogle,
  type AuthBrowser,
  type SocialAuthClient,
} from "../frontend/src/services/socialAuth.ts";

const REDIRECT = "exp://192.168.1.5:8081/--/auth-callback";
const SUCCESS_URL = `${REDIRECT}#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer`;

function fakeClient(overrides: Partial<SocialAuthClient> = {}): SocialAuthClient {
  return {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://auth.example/authorize" }, error: null }),
    setSession: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

const browserReturning = (result: { type: string; url?: string }): AuthBrowser => ({
  openAuthSessionAsync: vi.fn().mockResolvedValue(result),
});

describe("parseAuthRedirect", () => {
  it("reads the tokens from the fragment", () => {
    expect(parseAuthRedirect(SUCCESS_URL)).toEqual({ kind: "session", accessToken: "at", refreshToken: "rt" });
  });

  it("reads an error from the fragment or the query, preferring the description", () => {
    expect(parseAuthRedirect(`${REDIRECT}#error=access_denied&error_description=User+denied+access`)).toEqual({
      kind: "error",
      message: "User denied access",
    });
    expect(parseAuthRedirect(`${REDIRECT}?error=server_error`)).toEqual({ kind: "error", message: "server_error" });
  });

  it("returns null when there are no usable tokens", () => {
    expect(parseAuthRedirect(REDIRECT)).toBeNull();
    expect(parseAuthRedirect(`${REDIRECT}#access_token=at`)).toBeNull();
    expect(parseAuthRedirect(`${REDIRECT}?code=abc`)).toBeNull();
  });
});

describe("signInWithGoogle", () => {
  it("opens the sign-in page, then stores the returned session", async () => {
    const client = fakeClient();
    const browser = browserReturning({ type: "success", url: SUCCESS_URL });
    expect(await signInWithGoogle(client, browser, REDIRECT)).toEqual({ ok: true });
    expect(client.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: REDIRECT, skipBrowserRedirect: true },
    });
    expect(browser.openAuthSessionAsync).toHaveBeenCalledWith("https://auth.example/authorize", REDIRECT);
    expect(client.setSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" });
  });

  it("treats closing the browser as a cancel, not an error", async () => {
    const client = fakeClient();
    for (const type of ["cancel", "dismiss", "locked"]) {
      expect(await signInWithGoogle(client, browserReturning({ type }), REDIRECT)).toEqual({
        ok: false,
        error: "",
        cancelled: true,
      });
    }
    expect(client.setSession).not.toHaveBeenCalled();
  });

  it("treats Google's 'access denied' as a cancel but shows other errors", async () => {
    const denied = browserReturning({ type: "success", url: `${REDIRECT}#error=access_denied` });
    expect(await signInWithGoogle(fakeClient(), denied, REDIRECT)).toMatchObject({ ok: false, cancelled: true });
    const broken = browserReturning({ type: "success", url: `${REDIRECT}#error_description=Unable+to+exchange` });
    expect(await signInWithGoogle(fakeClient(), broken, REDIRECT)).toEqual({
      ok: false,
      error: "Unable to exchange",
      cancelled: false,
    });
  });

  it("refuses a redirect that is not back to this app, or has no tokens", async () => {
    const client = fakeClient();
    for (const result of [
      { type: "success", url: "https://evil.example/#access_token=at&refresh_token=rt" },
      { type: "success" },
      { type: "success", url: REDIRECT },
    ]) {
      expect(await signInWithGoogle(client, browserReturning(result), REDIRECT)).toMatchObject({
        ok: false,
        cancelled: false,
        error: expect.stringMatching(/did not finish/i),
      });
    }
    expect(client.setSession).not.toHaveBeenCalled();
  });

  it("reports errors starting the flow and storing the session", async () => {
    const noUrl = fakeClient({ signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: null }) });
    expect(await signInWithGoogle(noUrl, browserReturning({ type: "cancel" }), REDIRECT)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/did not finish/i),
    });
    const rejected = fakeClient({
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: null }, error: { message: "provider is not enabled" } }),
    });
    expect(await signInWithGoogle(rejected, browserReturning({ type: "cancel" }), REDIRECT)).toEqual({
      ok: false,
      error: "provider is not enabled",
      cancelled: false,
    });
    const badSession = fakeClient({ setSession: vi.fn().mockResolvedValue({ error: { message: "bad jwt" } }) });
    expect(
      await signInWithGoogle(badSession, browserReturning({ type: "success", url: SUCCESS_URL }), REDIRECT),
    ).toEqual({ ok: false, error: "bad jwt", cancelled: false });
  });

  it("handles unexpected failures", async () => {
    const client = fakeClient({ signInWithOAuth: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await signInWithGoogle(client, browserReturning({ type: "cancel" }), REDIRECT)).toMatchObject({
      ok: false,
      cancelled: false,
      error: expect.stringMatching(/did not finish/i),
    });
  });
});

describe("the sign-in return address", () => {
  const appJson = JSON.parse(readFileSync(new URL("../frontend/app.json", import.meta.url), "utf8")) as { expo: { scheme: string } };
  const screen = readFileSync(new URL("../frontend/src/pages/AuthScreen.tsx", import.meta.url), "utf8");

  it("is the app's own scheme, so it does not depend on a network address or the tunnel", () => {
    expect(OAUTH_REDIRECT_URL).toBe(`${appJson.expo.scheme}://auth-callback`);
    expect(OAUTH_REDIRECT_URL).not.toMatch(/^exp:/);
    expect(OAUTH_REDIRECT_URL).not.toMatch(/\d+\.\d+\.\d+\.\d+|localhost|exp\.direct/);
  });

  it("is what the Google button sends, not an address built from how the phone loaded the project", () => {
    expect(screen).toContain("OAUTH_REDIRECT_URL");
    expect(screen).not.toMatch(/createURL/);
  });

  it("is accepted by the redirect check in signInWithGoogle, and only an address starting with it is trusted", async () => {
    const client: SocialAuthClient = {
      signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://accounts.example/auth" }, error: null }),
      setSession: vi.fn().mockResolvedValue({ error: null }),
    };
    const good: AuthBrowser = {
      openAuthSessionAsync: vi.fn().mockResolvedValue({ type: "success", url: `${OAUTH_REDIRECT_URL}#access_token=a&refresh_token=r` }),
    };
    expect(await signInWithGoogle(client, good, OAUTH_REDIRECT_URL)).toEqual({ ok: true });
    expect(client.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true },
    });
    expect(good.openAuthSessionAsync).toHaveBeenCalledWith("https://accounts.example/auth", OAUTH_REDIRECT_URL);
    const elsewhere: AuthBrowser = {
      openAuthSessionAsync: vi.fn().mockResolvedValue({ type: "success", url: "https://evil.example/#access_token=a&refresh_token=r" }),
    };
    expect((await signInWithGoogle(client, elsewhere, OAUTH_REDIRECT_URL)).ok).toBe(false);
  });
});
