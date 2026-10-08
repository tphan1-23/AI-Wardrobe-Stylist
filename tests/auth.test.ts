import { describe, expect, it, vi } from "vitest";
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  checkPasswordRequirements,
  fieldForError,
  confirmSignUp,
  friendlyAuthError,
  normalizeEmail,
  normalizeResetCode,
  requestPasswordReset,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  validateEmail,
  validateName,
  validateNewPassword,
  validatePassword,
  validateResetCode,
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
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue(ok),
    resend: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

const validSignUp = { name: " Thanh ", email: "  Thanh@Example.COM ", password: "Longenough1!" };

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

  it("validates new passwords against every sign-up rule", () => {
    expect(validateNewPassword("")).toMatch(/enter a password/i);
    expect(validateNewPassword("Ab1!")).toMatch(/at least/i);
    expect(validateNewPassword("Ab1!" + "x".repeat(MAX_PASSWORD_LENGTH))).toMatch(/at most/i);
    expect(validateNewPassword("lowercase1!")).toMatch(/uppercase/i);
    expect(validateNewPassword("UPPERCASE1!")).toMatch(/lowercase/i);
    expect(validateNewPassword("NoNumbers!")).toMatch(/number/i);
    expect(validateNewPassword("NoSymbol123")).toMatch(/special/i);
    expect(validateNewPassword("Longenough1!")).toBeNull();
  });

  it("accepts the length limits exactly", () => {
    expect(validateNewPassword("Abcde1!x")).toBeNull();
    expect(validateNewPassword("Ab1!" + "x".repeat(MAX_PASSWORD_LENGTH - 4))).toBeNull();
  });

  it("counts any non-letter, non-digit as a special character", () => {
    for (const symbol of ["~", "`", " ", "€"]) {
      expect(checkPasswordRequirements(`Abcdefg1${symbol}`).requirements.hasSpecialChar).toBe(true);
    }
  });

  it("reports each requirement for a checklist", () => {
    expect(checkPasswordRequirements("abc")).toEqual({
      requirements: {
        hasMinLength: false,
        hasUpperCase: false,
        hasLowerCase: true,
        hasNumber: false,
        hasSpecialChar: false,
      },
      isValid: false,
    });
    expect(checkPasswordRequirements("Longenough1!").isValid).toBe(true);
  });

  it("validates the emailed reset code", () => {
    expect(validateResetCode("")).toMatch(/enter the code/i);
    expect(validateResetCode("   ")).toMatch(/enter the code/i);
    for (const bad of ["12345", "12345a", "12-34", "12345678901", "abcdef"]) {
      expect(validateResetCode(bad)).toMatch(/numbers only/i);
    }
    expect(validateResetCode("123456")).toBeNull();
    expect(validateResetCode(" 123 456 ")).toBeNull();
    expect(normalizeResetCode(" 123 456\n")).toBe("123456");
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
      { ...validSignUp, password: "longenough1" },
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
      password: "Longenough1!",
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

  // "longenough1" fails the sign-up rules; sign-in must still accept it for older accounts.
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

describe("requestPasswordReset", () => {
  it("rejects a bad email without calling the server", async () => {
    const client = fakeClient();
    expect(await requestPasswordReset(client, "nope")).toMatchObject({ ok: false });
    expect(client.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("asks for a code for the normalized email", async () => {
    const client = fakeClient();
    expect(await requestPasswordReset(client, "  A@B.co ")).toEqual({ ok: true });
    expect(client.resetPasswordForEmail).toHaveBeenCalledWith("a@b.co");
  });

  it("returns a friendly message for server errors", async () => {
    const client = fakeClient({
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: { message: "email rate limit exceeded" } }),
    });
    expect(await requestPasswordReset(client, "a@b.co")).toEqual({
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ resetPasswordForEmail: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await requestPasswordReset(client, "a@b.co")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/could not reach/i),
    });
  });
});

describe("resetPassword", () => {
  const input = { email: " A@B.co ", code: " 123 456 ", newPassword: "Longenough1!" };

  it("rejects bad input without calling the server", async () => {
    const client = fakeClient();
    for (const bad of [
      { ...input, email: "" },
      { ...input, code: "" },
      { ...input, code: "abc" },
      { ...input, newPassword: "" },
      { ...input, newPassword: "longenough1" },
    ]) {
      expect(await resetPassword(client, bad)).toMatchObject({ ok: false });
    }
    expect(client.verifyOtp).not.toHaveBeenCalled();
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it("checks the code, then sets the new password", async () => {
    const client = fakeClient();
    expect(await resetPassword(client, input)).toEqual({ ok: true });
    expect(client.verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "recovery" });
    expect(client.updateUser).toHaveBeenCalledWith({ password: "Longenough1!" });
  });

  it("does not change the password when the code is wrong or expired", async () => {
    const client = fakeClient({
      verifyOtp: vi
        .fn()
        .mockResolvedValue({ data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } }),
    });
    expect(await resetPassword(client, input)).toEqual({
      ok: false,
      error: "That code is wrong or has expired. Request a new one.",
    });
    expect(client.updateUser).not.toHaveBeenCalled();
  });

  it("reports a rejected new password, such as one used before", async () => {
    const client = fakeClient({
      updateUser: vi
        .fn()
        .mockResolvedValue({ error: { message: "New password should be different from the old password." } }),
    });
    expect(await resetPassword(client, input)).toEqual({
      ok: false,
      error: "Choose a password you have not used before.",
    });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ verifyOtp: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await resetPassword(client, input)).toMatchObject({ ok: false, error: expect.stringMatching(/could not reach/i) });
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
    ["Password must be at most 72 characters.", "password"],
    ["Password needs an uppercase letter.", "password"],
    ["Password needs a special character.", "password"],
    ["Choose a password you have not used before.", "password"],
    ["Enter the code we sent you.", "code"],
    ["The code is made of numbers only, like 123456.", "code"],
    ["That code is wrong or has expired. Request a new one.", "code"],
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

describe("confirmSignUp", () => {
  const input = { email: " A@B.co ", code: "123 456" };

  it("confirms with the emailed code and leaves the user signed in", async () => {
    const client = fakeClient();
    expect(await confirmSignUp(client, input)).toEqual({ ok: true, status: "signed_in" });
    expect(client.verifyOtp).toHaveBeenCalledWith({ email: "a@b.co", token: "123456", type: "signup" });
  });

  it("checks the input before asking the server", async () => {
    const client = fakeClient();
    expect(await confirmSignUp(client, { ...input, email: "nope" })).toMatchObject({ ok: false });
    expect(await confirmSignUp(client, { ...input, code: "" })).toMatchObject({ ok: false, error: expect.stringContaining("code") });
    expect(await confirmSignUp(client, { ...input, code: "12ab56" })).toMatchObject({ ok: false });
    expect(client.verifyOtp).not.toHaveBeenCalled();
  });

  it("explains a wrong or expired code", async () => {
    const client = fakeClient({
      verifyOtp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: { message: "Token has expired or is invalid" } }),
    });
    expect(await confirmSignUp(client, input)).toEqual({ ok: false, error: "That code is wrong or has expired. Request a new one." });
  });

  it("handles network failures", async () => {
    const client = fakeClient({ verifyOtp: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await confirmSignUp(client, input)).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});

describe("resendSignUpCode", () => {
  it("asks for a new signup code for the normalized email", async () => {
    const client = fakeClient();
    expect(await resendSignUpCode(client, " A@B.co ")).toEqual({ ok: true });
    expect(client.resend).toHaveBeenCalledWith({ type: "signup", email: "a@b.co" });
  });

  it("rejects a bad email without calling the server, and maps errors", async () => {
    const client = fakeClient();
    expect(await resendSignUpCode(client, "")).toMatchObject({ ok: false });
    expect(client.resend).not.toHaveBeenCalled();
    const limited = fakeClient({ resend: vi.fn().mockResolvedValue({ error: { message: "email rate limit exceeded" } }) });
    expect(await resendSignUpCode(limited, "a@b.co")).toEqual({ ok: false, error: "Too many attempts. Please wait a moment and try again." });
    const down = fakeClient({ resend: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(await resendSignUpCode(down, "a@b.co")).toMatchObject({ ok: false, error: expect.stringContaining("Could not reach") });
  });
});
