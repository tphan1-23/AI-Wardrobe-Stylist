**Title:** Forgot-password reset and Google / Apple sign-in (D19)

**Base:** `main` (open this after PR 1 is merged) · **Branch:** `feat/forgot-password-social-login` · **Author:** Thanh · **Reviewer:** Manuel

## What this changes

- **Forgot password.** A "Forgot your password?" link on log-in. `requestPasswordReset` emails a one-time code;
  `resetPassword` checks the code, then sets the new password under the same rules as sign-up. A wrong or expired code
  never changes the password. A code is used instead of an email link because links into Expo Go change with the network address.
- **Google and Apple sign-in.** One button covers sign-up and log-in. Google uses Supabase OAuth in the system browser and
  only accepts a redirect back to the app; Apple uses the native sheet and `signInWithIdToken`. Cancelling is not an error.
  Apple only sends the name once, so the app saves it with `updateUser`.
- `supabase/migrations/0003_social_login_names.sql`: a profile name now comes from Google's `full_name` or Apple. It only
  fills a still-empty profile name and never overwrites an existing one.
- The reset screen stays up until the new password is saved (entering the code signs the user in first).

## How it was checked

- Typecheck clean and **118 tests pass, 100% coverage** on the feature files (checked by the reviewer from a clean install).
- Migration `0003` checked on in-memory Postgres; read by the reviewer: it only touches the user's own profile name.
- **Google sign-in verified on a real device:** run in Expo Go on an iPhone against the real Supabase project (2026-10-08),
  the Google login completes and the app loads.
- Reviewer note: the Google redirect check matches the *start* of the address; an exact match on the path would be stricter.

## Not verified yet (please read)

- **Apple sign-in is not usable yet.** The code is in this PR, but the Apple side is not set up (it needs the paid Apple
  Developer Program and the Apple provider configured in Supabase), so it has **not been tested** and the button should not
  be relied on. Listed in the Milestone 3 checklist: ship it or drop it.
- **Forgot-password reset has not been confirmed end to end on a device.**
- **Profile row for accounts that predate the trigger:** one existing account on the real project showed "Your profile
  could not be found" after logging in because it had no row in `users`; it was fixed with the one-time backfill documented in
  `brain/Work Plan.md`. Both sign-up triggers (`on_auth_user_created`, `on_auth_user_updated`) are confirmed present on the
  real project, which also shows migration `0003` is applied. A brand-new account getting its profile automatically has not
  been observed yet; the next new account will show it.
- Password-reset emails go out through a dedicated Gmail account over SMTP (the free plan cannot edit the default template
  without custom SMTP) and **land in spam**. Accepted until Milestone 3, when a real domain with SPF/DKIM fixes it
  (checklist in `brain/Work Plan.md`).

## For the reviewer

Please open **Files changed**, then **Review changes**, then **Approve** (or request changes) **before** anyone merges.
The approver must be someone other than the person who opened the PR.
