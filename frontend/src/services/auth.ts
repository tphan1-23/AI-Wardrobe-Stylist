// Email + password auth logic. Pure TypeScript with an injected client so it
// can be unit-tested without React Native or a network (see tests/auth.test.ts).

export interface PasswordRequirements {
  hasMinLength: boolean;
  hasUpperCase: boolean;
  hasLowerCase: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export interface PasswordValidationResult {
  requirements: PasswordRequirements;
  isValid: boolean;
}

interface AuthUser {
  id: string;
  email?: string | null;
}

export interface AuthSession {
  user: AuthUser;
}

interface AuthError {
  message: string;
}

interface AuthResponse {
  data: { user: AuthUser | null; session: AuthSession | null };
  error: AuthError | null;
}

// The slice of supabase.auth that this module uses.
export interface AuthClient {
  signUp(credentials: {
    email: string;
    password: string;
    options?: { data?: Record<string, unknown> };
  }): Promise<AuthResponse>;
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResponse>;
  signOut(): Promise<{ error: AuthError | null }>;
  // Password reset by emailed code: request it, trade it for a session, set the new password.
  resetPasswordForEmail(email: string): Promise<{ error: AuthError | null }>;
  verifyOtp(params: { email: string; token: string; type: "recovery" }): Promise<AuthResponse>;
  updateUser(attributes: { password?: string; data?: Record<string, unknown> }): Promise<{ error: AuthError | null }>;
}

export type AuthResult =
  | { ok: true; status: "signed_in" | "confirmation_required" }
  | { ok: false; error: string };

export type SignOutResult = { ok: true } | { ok: false; error: string };

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  name: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): string | null {
  const value = normalizeEmail(email);
  if (value === "") return "Enter your email address.";
  if (!EMAIL_PATTERN.test(value)) return "Enter a valid email address.";
  return null;
}

export const MIN_PASSWORD_LENGTH = 8;
// Supabase rejects passwords longer than 72 characters.
export const MAX_PASSWORD_LENGTH = 72;

// Basic check used on sign-in, so accounts made before the stricter rules can still log in.
export function validatePassword(password: string): string | null {
  if (password === "") return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

// Each sign-up rule on its own, so the screen can show a checklist.
export function checkPasswordRequirements(password: string): PasswordValidationResult {
  const requirements: PasswordRequirements = {
    hasMinLength:
      password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH,
    hasUpperCase: /[A-Z]/.test(password),
    hasLowerCase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[^A-Za-z0-9]/.test(password),
  };
  const isValid = Object.values(requirements).every(Boolean);
  return { requirements, isValid };
}

// Stricter check for new accounts: returns the first unmet rule as a message.
export function validateNewPassword(password: string): string | null {
  const basic = validatePassword(password);
  if (basic) return basic;
  const { requirements } = checkPasswordRequirements(password);
  if (!requirements.hasMinLength) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (!requirements.hasUpperCase) return "Password needs an uppercase letter.";
  if (!requirements.hasLowerCase) return "Password needs a lowercase letter.";
  if (!requirements.hasNumber) return "Password needs a number.";
  if (!requirements.hasSpecialChar) return "Password needs a special character.";
  return null;
}

// The emailed reset code is numeric; Supabase's length is configurable (default 6).
const RESET_CODE_PATTERN = /^\d{6,10}$/;

export function normalizeResetCode(code: string): string {
  return code.replace(/\s/g, "");
}

export function validateResetCode(code: string): string | null {
  const value = normalizeResetCode(code);
  if (value === "") return "Enter the code we sent you.";
  if (!RESET_CODE_PATTERN.test(value)) return "The code is made of numbers only, like 123456.";
  return null;
}

export function validateName(name: string): string | null {
  return name.trim() === "" ? "Enter your name." : null;
}

export function friendlyAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("invalid login credentials")) return "Incorrect email or password.";
  if (text.includes("already registered")) return "An account with this email already exists.";
  if (text.includes("email not confirmed")) return "Confirm your email, then sign in.";
  if (text.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (text.includes("token has expired or is invalid")) {
    return "That code is wrong or has expired. Request a new one.";
  }
  if (text.includes("different from the old password")) {
    return "Choose a password you have not used before.";
  }
  return message;
}

export type AuthField = "name" | "email" | "password" | "code" | "form";

// Which input an error message belongs to, so the screen can mark that field.
export function fieldForError(message: string): AuthField {
  const text = message.toLowerCase();
  if (text.includes("incorrect email or password")) return "password";
  if (text.includes("your name")) return "name";
  if (text.includes("confirm your email")) return "form";
  if (text.includes("code")) return "code";
  if (text.includes("email")) return "email";
  if (text.includes("password")) return "password";
  return "form";
}

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

export async function signUp(client: AuthClient, input: SignUpInput): Promise<AuthResult> {
  const problem =
    validateName(input.name) ?? validateEmail(input.email) ?? validateNewPassword(input.password);
  if (problem) return { ok: false, error: problem };

  try {
    // The name goes into user metadata; a database trigger copies it to the profile row.
    const { data, error } = await client.signUp({
      email: normalizeEmail(input.email),
      password: input.password,
      options: { data: { name: input.name.trim() } },
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    // No session means the project requires email confirmation first.
    return { ok: true, status: data.session ? "signed_in" : "confirmation_required" };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function signIn(client: AuthClient, input: SignInInput): Promise<AuthResult> {
  const problem = validateEmail(input.email) ?? validatePassword(input.password);
  if (problem) return { ok: false, error: problem };

  try {
    const { error } = await client.signInWithPassword({
      email: normalizeEmail(input.email),
      password: input.password,
    });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true, status: "signed_in" };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export type ResetResult = { ok: true } | { ok: false; error: string };

// Emails a one-time code. Supabase answers the same whether or not the address
// has an account, so this never reveals which emails are registered.
export async function requestPasswordReset(client: AuthClient, email: string): Promise<ResetResult> {
  const problem = validateEmail(email);
  if (problem) return { ok: false, error: problem };

  try {
    const { error } = await client.resetPasswordForEmail(normalizeEmail(email));
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

// Trades the emailed code for a session, then sets the new password. The new
// password must meet the same rules as sign-up. Success leaves the user signed in.
export async function resetPassword(client: AuthClient, input: ResetPasswordInput): Promise<ResetResult> {
  const problem =
    validateEmail(input.email) ?? validateResetCode(input.code) ?? validateNewPassword(input.newPassword);
  if (problem) return { ok: false, error: problem };

  try {
    const verified = await client.verifyOtp({
      email: normalizeEmail(input.email),
      token: normalizeResetCode(input.code),
      type: "recovery",
    });
    if (verified.error) return { ok: false, error: friendlyAuthError(verified.error.message) };

    const { error } = await client.updateUser({ password: input.newPassword });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

export async function signOut(client: AuthClient): Promise<SignOutResult> {
  try {
    const { error } = await client.signOut();
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
