import { describe, expect, it, vi } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  fieldForError,
  friendlyAuthError,
  normalizeEmail,
  signIn,
  signOut,
  signUp,
  validateEmail,
  validateName,
  validatePassword,
  type AuthClient,
} from "../frontend/src/services/auth.ts";

const user = { id: "u1", email: "a@b.co" };
const session = { user };
const ok = { data: { user, session }, error: null };

function fakeClient(overrides: Partial<AuthClient> = {}): AuthClient {
  return {
    signUp: vi.fn().mockResolvedValue(ok),
    signInWithPassword: vi.fn().mockResolvedValue(ok),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

const validSignUp = { name: " Thanh ", email: "  Thanh@Example.COM ", password: "longenough1" };

describe("validation", () => {
  it("normalizes email", () => {
    expect(normalizeEmail("  A@B.Co ")).toBe("a@b.co");
  });

  it("validates email", () => {
    expect(validateEmail("   ")).toMatch(/enter your email/i);
    expect(validateEmail("not-an-email")).toMatch(/valid email/i);
    expect(validateEmail("a@b")).toMatch(/valid email/i);
    expect(validateEmail("a@b.co")).toBeNull();
  });

  it("validates password", () => {
    expect(validatePassword("")).toMatch(/enter a password/i);
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/at least/i);
    expect(validatePassword("x".repeat(MIN_PASSWORD_LENGTH))).toBeNull();
  });

  it("validates name", () => {
    expect(validateName("  ")).toMatch(/enter your name/i);
    expect(validateName("Thanh")).toBeNull();
  });
});

describe("friendlyAuthError", () => {
  it.each([
    ["Invalid login credentials", /incorrect email or password/i],
    ["User already registered", /already exists/i],
    ["Email not confirmed", /confirm your email/i],
    ["email rate limit exceeded", /too many attempts/i],
  ])("maps %s", (message, expected) => {
    expect(friendlyAuthError(message)).toMatch(expected);
  });

  it("passes unknown messages through", () => {
    expect(friendlyAuthError("Something odd")).toBe("Something odd");
  });
});

describe("signUp", () => {
  it("rejects bad input without calling the server", async () => {
    const client = fakeClient();
    for (const input of [
      { ...validSignUp, name: "" },
      { ...validSignUp, email: "nope" },
      { ...validSignUp, password: "short" },
    ]) {
      const result = await signUp(client, input);
      expect(result.ok).toBe(false);
    }
    expect(client.signUp).not.toHaveBeenCalled();
  });

  it("sends a normalized email and the name as metadata", async () => {
    const client = fakeClient();
    const result = await signUp(client, validSignUp);
    expect(result).toEqual({ ok: true, status: "signed_in" });
    expect(client.signUp).toHaveBeenCalledWith({
      email: "thanh@example.com",
      password: "longenough1",
      options: { data: { name: "Thanh" } },
    });
  });

  it("reports when email confirmation is required (no session)", async () => {
    const client = fakeClient({
      signUp: vi.fn().mockResolvedValue({ data: { user, session: null }, error: null }),
    });
    expect(await signUp(client, validSignUp)).toEqual({ ok: true, status: "confirmation_required" });
  });

  it("returns a friendly message for server errors", async () => {
    const client = fakeClient({
      signUp: vi
        .fn()
        .mockResolvedValue({ data: { user: null, session: null }, error: { message: "User already registered" } }),
    });
    const result = await signUp(client, validSignUp);
    expect(result).toEqual({ ok: false, error: "An account with this email already exists." });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ signUp: vi.fn().mockRejectedValue(new Error("offline")) });
    const result = await signUp(client, validSignUp);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/could not reach/i) });
  });
});

describe("signIn", () => {
  const input = { email: " A@B.co ", password: "longenough1" };

  it("rejects bad input without calling the server", async () => {
    const client = fakeClient();
    expect((await signIn(client, { ...input, email: "" })).ok).toBe(false);
    expect((await signIn(client, { ...input, password: "" })).ok).toBe(false);
    expect(client.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signs in with a normalized email", async () => {
    const client = fakeClient();
    expect(await signIn(client, input)).toEqual({ ok: true, status: "signed_in" });
    expect(client.signInWithPassword).toHaveBeenCalledWith({ email: "a@b.co", password: "longenough1" });
  });

  it("returns a friendly message for wrong credentials", async () => {
    const client = fakeClient({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: null, session: null }, error: { message: "Invalid login credentials" } }),
    });
    expect(await signIn(client, input)).toEqual({ ok: false, error: "Incorrect email or password." });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ signInWithPassword: vi.fn().mockRejectedValue(new Error("offline")) });
    expect((await signIn(client, input)).ok).toBe(false);
  });
});

describe("signOut", () => {
  it("succeeds", async () => {
    expect(await signOut(fakeClient())).toEqual({ ok: true });
  });

  it("returns server errors", async () => {
    const client = fakeClient({ signOut: vi.fn().mockResolvedValue({ error: { message: "boom" } }) });
    expect(await signOut(client)).toEqual({ ok: false, error: "boom" });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ signOut: vi.fn().mockRejectedValue(new Error("offline")) });
    expect((await signOut(client)).ok).toBe(false);
  });
});

describe("fieldForError", () => {
  it.each([
    ["Incorrect email or password.", "password"],
    ["Enter your name.", "name"],
    ["Enter your email address.", "email"],
    ["Enter a valid email address.", "email"],
    ["An account with this email already exists.", "email"],
    ["Enter a password.", "password"],
    ["Password must be at least 8 characters.", "password"],
    ["Confirm your email, then sign in.", "form"],
    ["Too many attempts. Please wait a moment and try again.", "form"],
    ["Could not reach the server. Check your connection and try again.", "form"],
  ])("puts %j on the %s field", (message, field) => {
    expect(fieldForError(message)).toBe(field);
  });

  it("agrees with every message the validators and friendly mapper can produce", () => {
    const messages = [
      validateName(""), validateEmail(""), validateEmail("x"), validatePassword(""), validatePassword("short"),
      friendlyAuthError("Invalid login credentials"), friendlyAuthError("User already registered"),
    ];
    for (const m of messages) expect(fieldForError(m ?? "")).not.toBeUndefined();
    expect(fieldForError(validateName("")!)).toBe("name");
    expect(fieldForError(validateEmail("x")!)).toBe("email");
    expect(fieldForError(validatePassword("short")!)).toBe("password");
    expect(fieldForError(friendlyAuthError("Invalid login credentials"))).toBe("password");
    expect(fieldForError(friendlyAuthError("User already registered"))).toBe("email");
  });
});
