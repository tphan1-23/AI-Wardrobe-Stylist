// Email + password auth logic. Pure TypeScript with an injected client so it
// can be unit-tested without React Native or a network (see tests/auth.test.ts).

export const MIN_PASSWORD_LENGTH = 8;

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

export function validatePassword(password: string): string | null {
  if (password === "") return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
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
  return message;
}

export type AuthField = "name" | "email" | "password" | "form";

// Which input an error message belongs to, so the screen can mark that field.
export function fieldForError(message: string): AuthField {
  const text = message.toLowerCase();
  if (text.includes("incorrect email or password")) return "password";
  if (text.includes("your name")) return "name";
  if (text.includes("confirm your email")) return "form";
  if (text.includes("email")) return "email";
  if (text.includes("password")) return "password";
  return "form";
}

const NETWORK_ERROR = "Could not reach the server. Check your connection and try again.";

export async function signUp(client: AuthClient, input: SignUpInput): Promise<AuthResult> {
  const problem =
    validateName(input.name) ?? validateEmail(input.email) ?? validatePassword(input.password);
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

export async function signOut(client: AuthClient): Promise<SignOutResult> {
  try {
    const { error } = await client.signOut();
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}
