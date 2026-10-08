import { describe, expect, it, vi } from "vitest";
import {
  formatAppleName,
  parseAuthRedirect,
  signInWithApple,
  signInWithGoogle,
  type AppleCredential,
  type AuthBrowser,
  type SocialAuthClient,
} from "../frontend/src/services/socialAuth.ts";

const REDIRECT = "exp://192.168.1.5:8081/--/auth-callback";
const SUCCESS_URL = `${REDIRECT}#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer`;

function fakeClient(overrides: Partial<SocialAuthClient> = {}): SocialAuthClient {
  return {
    signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://auth.example/authorize" }, error: null }),
    setSession: vi.fn().mockResolvedValue({ error: null }),
    signInWithIdToken: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
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

describe("formatAppleName", () => {
  it("joins the parts that exist", () => {
    expect(formatAppleName({ givenName: " Ana ", familyName: "Ruiz" })).toBe("Ana Ruiz");
    expect(formatAppleName({ givenName: "Ana", familyName: null })).toBe("Ana");
    expect(formatAppleName({ givenName: "  ", familyName: undefined })).toBe("");
    expect(formatAppleName(null)).toBe("");
  });
});

describe("signInWithApple", () => {
  const credential = (overrides: Partial<AppleCredential> = {}): (() => Promise<AppleCredential>) =>
    async () => ({ identityToken: "apple-token", fullName: { givenName: "Ana", familyName: "Ruiz" }, ...overrides });

  it("signs in with the identity token and saves the name Apple shares", async () => {
    const client = fakeClient();
    expect(await signInWithApple(client, credential())).toEqual({ ok: true });
    expect(client.signInWithIdToken).toHaveBeenCalledWith({ provider: "apple", token: "apple-token" });
    expect(client.updateUser).toHaveBeenCalledWith({ data: { name: "Ana Ruiz" } });
  });

  it("does not touch the name when Apple sends none (every sign-in after the first)", async () => {
    const client = fakeClient();
    expect(await signInWithApple(client, credential({ fullName: null }))).toEqual({ ok: true });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it("still succeeds if saving the name fails", async () => {
    const rejects = fakeClient({ updateUser: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await signInWithApple(rejects, credential())).toEqual({ ok: true });
  });

  it("fails without a token and reports server errors", async () => {
    const client = fakeClient();
    expect(await signInWithApple(client, credential({ identityToken: null }))).toMatchObject({
      ok: false,
      cancelled: false,
      error: expect.stringMatching(/did not finish/i),
    });
    expect(client.signInWithIdToken).not.toHaveBeenCalled();

    const denied = fakeClient({ signInWithIdToken: vi.fn().mockResolvedValue({ error: { message: "bad audience" } }) });
    expect(await signInWithApple(denied, credential())).toEqual({ ok: false, error: "bad audience", cancelled: false });
    expect(denied.updateUser).not.toHaveBeenCalled();
  });

  it("treats cancelling the Apple sheet as a cancel and other failures as errors", async () => {
    const client = fakeClient();
    const cancel = async (): Promise<AppleCredential> => {
      throw Object.assign(new Error("canceled"), { code: "ERR_REQUEST_CANCELED" });
    };
    expect(await signInWithApple(client, cancel)).toEqual({ ok: false, error: "", cancelled: true });

    const crash = async (): Promise<AppleCredential> => {
      throw new Error("boom");
    };
    expect(await signInWithApple(client, crash)).toMatchObject({ ok: false, cancelled: false });
    const weird = async (): Promise<AppleCredential> => {
      throw "string error";
    };
    expect(await signInWithApple(client, weird)).toMatchObject({ ok: false, cancelled: false });
    expect(client.signInWithIdToken).not.toHaveBeenCalled();
  });
});
