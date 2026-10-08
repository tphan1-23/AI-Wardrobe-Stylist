---
class: SWE-AI
course: CSCI 4397 / 6397
status: active
tags: [project, capstone, swe-ai, plan]
---

# Work Plan — Milestone 2 and beyond

Single place for "who does what, on which branch, in what order". Read this first in every session (human or Claude). Update it in the same commit as the work. Decisions behind it: [[AI Wardrobe - Requirements & Decisions]]. AI plan: [[AI Logic Ownership]].

**Goal now:** Milestone 2 — core feature + automated test suite (>80% coverage), delivered as teammate-reviewed PRs. Real due date unconfirmed; assume immediate.

## People and laptops
| Who | Works on | Owns |
|---|---|---|
| **Manuel** (tech lead) + **Claude** | `feat/ai-core` (this repo's main machine) | All AI logic: tag schema/validation, vision prompt, scoring, preference learning, quiz mapping, evaluation, their tests. Contracts in `supabase/functions/_shared/types.ts`. |
| **Thanh** + her Claude | `feat/expo-app` (her laptop) | Product/plumbing: Expo app, auth, households, upload/closet/laundry/quiz/suggestion UI, Supabase project setup, migrations, CI. |

Commits are authored by whoever owns the slice (their own git identity). Team convention: no `Co-Authored-By: Claude` trailers; log AI use in your AI Audit Log instead.

## Branch map (2026-10-08)
`main` has everything from PR #1 (Milestone 2: auth + household, merged 2026-10-04): tooling and contracts, the 0001 migration, CI, the Expo app, the design, the coverage report. Branches below are open work. Several older branches (`chore/tooling-contracts`, `feat/data-layer`, `feat/expo-app`, `feat/household-service`, `feat/m2-final`, `fix/missing-profile`) are already contained in `main` and can be deleted.

| Branch | Based on | Author | Status | Contents |
|---|---|---|---|---|
| `main` | — | — | PR #1 merged | auth + household, schema 0001, design, CI, coverage report |
| `feat/personal-closets` | main | Thanh | pushed, PR not opened; `0002` not yet applied on Supabase | D18: personal closets + optional households, `0002_personal_closets.sql`, leave household, members list, stronger passwords. 86 tests, reviewed by Manuel (see below) |
| `feat/ai-core-d18` | personal-closets | Manuel + Claude | pushed, PR not opened | The AI core (scoring, preference learning, tag validation, Gemini client, `generate-outfit`/`update-preferences` handlers, weather parser) adapted to D18. 208 tests. Open after `feat/personal-closets` merges |
| `feat/ai-core` | old data-layer | Manuel + Claude | superseded by `feat/ai-core-d18` | Pre-D18 version; do not merge |

PR order: `feat/personal-closets` → `main` first (Manuel reviews with **Files changed → Review changes → Approve before merging**), then `feat/ai-core-d18` → `main` (Thanh reviews the same way).

## Milestone 2 PR (graded) — assignment rules
Turn in **ONE pull request** on GitHub that:
1. is approved on GitHub by a team member **other than** the one who submitted it;
2. contains **ONE core feature** of the project;
3. includes a **test suite** (unit and/or integration) for that feature's functions;
4. includes a **test coverage analysis** showing the tests cover **at least 80% of the code in the feature**.

**Decision D17 (2026-10-03):** the graded feature is **auth + household** (sign up / log in / log out, create or join a household, set the weather location). One focused PR from `feat/expo-app`, with the household logic from `feat/household-service` merged into it. Manuel submits, Thanh approves (swap if you prefer — the only rule is submitter ≠ approver). The AI core (`feat/ai-core`: scoring, preference learning, tagging, handlers, Gemini client) is **not** part of this PR; it is saved for a later milestone.

Checklist before opening the PR:
- [ ] `vitest.config.ts` has the `esbuild: { tsconfigRaw: "{}" }` line (already on `feat/household-service`); CI is green on a clean checkout.
- [ ] Household screens (create/join, set location) + onboarding gate in `App.tsx` using `onboardingStep` (Thanh).
- [ ] Coverage report for the feature files only (`frontend/src/services/auth.ts`, `household.ts`, `householdGateway.ts`) committed as `docs/m2-coverage.md`, with the numbers and how to reproduce them.
- [ ] PR description: feature, how it was verified, coverage summary, what is not covered (React screens) and why, AI-use disclosure.
- [ ] The other teammate reviews and approves on GitHub (a real review, not a rubber stamp).

Other branches (`chore/tooling-contracts`, `feat/data-layer`, `feat/ai-core`) are foundation or later-milestone work; merge them in whatever order suits, but they are not the graded submission.

## What `feat/expo-app` should deliver (Thanh)
**Progress (2026-10-04):** step 1 done (Expo SDK 57 app). Step 2 done (`frontend/src/services/supabase.ts`, reads `frontend/.env.local`). Step 3 done: `0001_init.sql` was applied by hand in the Supabase SQL Editor with no error reported (it also applied cleanly in a local PGlite check). Step 4 done and **verified on a device**: `services/auth.ts` + `AuthScreen`/`useSession`. Step 5 done and **verified on devices** (Thanh and Manuel): the household logic is Manuel's (`services/household.ts` + `householdGateway.ts`, merged from `feat/household-service`, D17); the screens are Thanh's: `useOverview`, `HouseholdScreen` (create/join), `LocationScreen`, `HomeScreen`, and the onboarding gate in `App.tsx` (household, then location, then ready). 53 tests, 100% coverage on the three feature files (`docs/m2-coverage.md`). Next: steps 6 and 7 after the Milestone 2 PR. The graded Milestone 2 feature is auth + household (D17).

**Fixed (2026-10-04, `fix/missing-profile`):** an account with no profile row used to show the raw message "Cannot coerce the result to a single JSON object". `householdGateway` now uses `.maybeSingle()` and `loadOverview` shows "Your profile could not be found. Log out and sign in again." (or "Your household could not be found."). Test added; 54 tests, 100% coverage.

**Personal closets (2026-10-08, `feat/personal-closets`, D18):** households are now optional. Sign-up goes straight to location, then the app; the home screen offers "Create or join a household", shows members, and has a working "Leave household" (with confirmation). Garments are owned by `owner_id`; photos live at `<owner user id>/<file>`. `0002_personal_closets.sql` applied cleanly on a local PGlite database with Supabase stand-ins, and a 24-step check passed (sharing, read-only for members, leave, last member deletes household, storage paths). **Not yet run on the real Supabase project:** run `0002_personal_closets.sql` once in Dashboard → SQL Editor, then `notify pgrst, 'reload schema';`. Also: sign-up now requires 8–72 chars with upper, lower, number and symbol (log-in keeps the 8-char minimum); the same rules are set in the Supabase dashboard. 86 tests, 100% coverage on the feature files.

**App name:** the Expo app is branded **DressWell** (display name and slug in `frontend/app.json`); the repo and docs keep the working title AI Wardrobe Stylist.

**Running the app (Thanh):** create `frontend/.env.local` (gitignored) with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, then `cd frontend && npx expo start --tunnel -c` and scan the QR code in Expo Go. Gotchas found:
- The URL must be the bare project URL (`https://<ref>.supabase.co`). Pasting the REST address ending in `/rest/v1/` makes sign-up fail with "invalid path specified in request URL".
- Use the anon/publishable key only, never the service_role/secret key.
- On a guest Wi-Fi (devices isolated) plain LAN mode cannot reach the laptop; use `--tunnel` or a phone hotspot.
- Expo reads env files only at startup, so restart after editing them.
- Supabase's GitHub integration typically applies migrations only from the production branch (main), which is likely why nothing ran. Until `feat/data-layer` is merged, run `supabase/migrations/0001_init.sql` by hand in Dashboard -> SQL Editor (once; a second run fails with "type already exists"). If it errors, split it: lines 1-149 first (everything the app needs), then the storage section (line 151 to the end) on its own.
- Accounts created before the migration have no profile row (the trigger did not exist yet). Backfill once: `insert into users (id, name) select id, coalesce(raw_user_meta_data ->> 'name', '') from auth.users on conflict (id) do nothing;`
- If tables exist but the app still says it cannot find them, run `notify pgrst, 'reload schema';`
- With "Confirm email" on in Supabase, sign-up returns no session and the app shows "check your email".

Order matters; stop at any point with a working, tested slice.
1. Create the Expo TypeScript app in `frontend/` (replace the `.gitkeep` placeholders as files appear). Run on iPhone via Expo Go.
2. Supabase client (`@supabase/supabase-js`, AsyncStorage session) reading `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Make the Supabase project (free tier), run `supabase/migrations/0001_init.sql`, **report whether it applies cleanly** (the SQL has never run against a real database). Fix the migration via PR if not.
4. Auth: email + password sign up / log in. Profile row is created automatically by trigger.
5. Household: create (`rpc create_household`) or join by invite code (`rpc join_household`); profile name + location.
6. Upload: `expo-image-picker` → upload to private bucket `garments` at `<owner user id>/<uuid>.jpg` (D18) → call `analyze-garment` (use a stub returning fixed tags until the real function exists) → review/edit screen → insert garment with `owner_id` = the signed-in user.
7. Closet list (own closet; household members' closets read-only, D18) with clean/dirty toggle on your own items.
Later: quiz screen, daily suggestion screen (call `generate-outfit`, accept via `rpc accept_suggestion`, thumbs up/down → `update-preferences`, re-roll on thumbs down).

**Share the types, don't copy them.** Import from `supabase/functions/_shared/` (e.g. `tag-schema.ts`, `types.ts`). Metro needs repo-root access: configure `watchFolders` in `metro.config.js` (or a path alias). Never redefine tag lists in the app; the migration test and the AI core depend on one source of truth.

## What `feat/ai-core` delivers (Manuel + Claude)
1. Scoring engine — done (`_shared/scoring.ts`).
2. Preference learning: quiz → initial `preference_vector`; feedback update rule.
3. Tag validation/normalization for model output.
4. `analyze-garment` / `generate-outfit` / `update-preferences` edge functions as thin wrappers over the pure modules (**proposed split — Manuel to confirm**; Thanh codes against the contracts and stubs until they land).
5. Eval plan + tuning log in [[AI Logic Ownership]].

## Boundaries
- Do not change `_shared/` AI modules or `types.ts` without Manuel; contract changes go through a PR and must update `docs/api_endpoints.md`.
- Do not change the schema without updating `types.ts` and the sync test (`tests/migration.test.ts`).
- Tests: `npm test`, `npm run test:coverage` (gate 80% on `_shared`), `npm run typecheck`. CI runs the same.

## Contract changes (read before coding against `types.ts`)
Pull `feat/ai-core` (or its merge) to get these; they affect the app.
- **`GenerateOutfitResponse`** has a third status, `exhausted` (re-roll ran out of unseen combinations). Handle `ok` / `incomplete` / `exhausted` in the suggestion screen.
- **`AnalyzeGarmentResponse`** is now `{ tags: Partial<GarmentTags>, confidence, needs_review, warnings }`. Fields the model got wrong or missed are absent from `tags`; fields that are absent or low-confidence are listed in `needs_review`. **The review screen must highlight those fields and require the user to fill/confirm them before saving**, and a stub of `analyze-garment` should return this shape (e.g. all four tags present, `needs_review: []`).

## D18 review (2026-10-08, Manuel)
- `0002_personal_closets.sql` reviewed: update policy keeps `owner_id` fixed (no ownership transfer); only the owner can insert/update/delete garments and photos; reads go through one function (`visible_closet_owner_ids`: yourself + household members); `create`/`join` refuse when already in a household; the last member leaving deletes the household. Verified by Thanh on in-memory Postgres; **not yet run on the real Supabase project.**
- Photos now live under `<owner user id>/<file>`, not `<household id>/…` (earlier notes in this file and in `api_endpoints.md` still say household; the `0002` policy is the truth).
- `types.ts`: `Garment.household_id`/`added_by` → `owner_id`; `UserProfile.household_id` nullable.
- AI core adapted on `feat/ai-core-d18`: `generate-outfit` reads only the user's own garments (`getOwnGarments(userId)`), no longer requires a household; `update-preferences` learns only from garments the user owns. Tests added for: no household, a housemate's clothes are never suggested, a housemate's garment id in a stored suggestion is ignored. 208 tests.
- Consequence to be aware of: closets are smaller than a shared household closet, so item repetition is higher (see the limitations in `AI Logic Ownership.md`). Letting users borrow a housemate's clothes would be a new decision.

## Notes for the app (from AI core)
- **Quiz seeding needs no edge function:** import `quizToPreferences` from `_shared/preferences.ts`, then upsert the result into `preference_vector` (own rows, allowed by RLS) and save the answers in `users.quiz_preferences`. `temp_comfort` is read from `quiz_preferences` by `generate-outfit`.
- Both `generate-outfit` and `update-preferences` read the user from the auth token, so the app does not pass a user id. `update-preferences` accepts feedback once per suggestion (409 afterwards).
- `generate-outfit` errors to handle: 409 (set a location first), 502 (weather down), plus the three result statuses. **No household is needed (D18).**

## Review of `feat/expo-app` (2026-10-03, Manuel)
- Good: auth logic is pure with an injected client, input validation and error mapping are tested, status in the Work Plan is honest about what is unverified.
- **Blocker for CI:** on a clean checkout (root `npm ci` only, as CI does) `tests/auth.test.ts` fails to load: Vite finds `frontend/tsconfig.json`, which extends `expo/tsconfig.base`, and `expo` is not installed at the root. Verified fix (one line in `vitest.config.ts`, then 30 tests pass and the branch merges cleanly with `feat/ai-core`, 100 tests at the time): add `esbuild: { tsconfigRaw: "{}" },` inside `defineConfig`. It must be a string; an object does not stop the lookup.
- Not verified: the screens on a device and the migration against a real Supabase project.

## Edge functions: run, deploy, test (Manuel + Claude)
The three functions (`analyze-garment`, `generate-outfit`, `update-preferences`) are thin Deno wrappers (`supabase/functions/*/index.ts`, shared `_deno/serve.ts`) over unit-tested code in `_shared/`. Tools run through `npx` (no global install): `npx deno ...`, `npx supabase ...`.
- **Type-check the Deno files:** `npx deno check --config supabase/functions/deno.json supabase/functions/*/index.ts`
- **Run one locally** (needs SUPABASE_URL / SUPABASE_ANON_KEY in the environment): `npx deno run --config supabase/functions/deno.json --allow-net --allow-env supabase/functions/update-preferences/index.ts` (listens on :8000).
- **Deploy** (one-time `npx supabase login` in a terminal; the project ref is the subdomain of `EXPO_PUBLIC_SUPABASE_URL`):
  1. `set -a; . ./.env; set +a`
  2. `npx supabase secrets set GEMINI_API_KEY="$GEMINI_API_KEY" OPENWEATHER_API_KEY="$OPENWEATHER_API_KEY" --project-ref <ref>` (name the two secrets explicitly; do **not** use `--env-file .env`, it would also upload the test account password)
  3. `npx supabase functions deploy analyze-garment generate-outfit update-preferences --project-ref <ref> --use-api`
- **Test without any screens:** create a throwaway account in the app, put `TEST_EMAIL` and `TEST_PASSWORD` in `.env`, then `node scripts/e2e.ts <folder with photos>`. It signs in, uploads photos, tags them with the real AI, saves garments, asks for an outfit, sends feedback, re-rolls, accepts, and checks that the security rules reject forged writes. It exits non-zero on any failure and cleans up after itself (`E2E_KEEP=1` to keep the data).
- **Contract for the app:** call `POST {SUPABASE_URL}/functions/v1/<name>` with `Authorization: Bearer <user session token>` (supabase-js: `supabase.functions.invoke`). Error codes: 401 not signed in, 403 photo not in your folder, 404 photo missing, 409 set a location first / feedback already given, 429 AI limit reached (let the user type the tags), 502 AI or weather unavailable.

## Status for the next session (2026-10-08, Manuel + Claude)
Read this first if you are a Claude session picking up work.
- **Edge functions are deployed** on the Supabase project (`analyze-garment`, `generate-outfit`, `update-preferences`), with `GEMINI_API_KEY` and `OPENWEATHER_API_KEY` set as project secrets. They reject callers without a login (verified: 401). **Verified end to end as a signed-in user on 2026-10-08: `node scripts/e2e.ts <photos folder>` passed 39 of 39 checks** against the real project (sign in, profile + location, 3 security-rule rejections, 7 photos uploaded + tagged by the real AI + saved, outfit generated from the user's own closet only, thumbs-down learning, second feedback refused with 409, re-roll, accept marks items worn, cleanup). Afterwards the account had 0 leftover garments, suggestions, preference rows and photos. The script needs `TEST_EMAIL` / `TEST_PASSWORD` in the git-ignored `.env`; it is safe on a real account (removes only what it creates, restores preference weights, always cleans up). **Not covered by it:** sharing between two household members (needs a second account) and the Google/Apple/reset flows. **Manually verified (Manuel, iPhone, Expo Go, 2026-10-08):** Google sign-in works against the real project. **Apple sign-in is not usable yet** (needs the paid Apple Developer Program and Supabase provider setup). **Confirmed on the real project (2026-10-08):** both auth triggers exist (`on_auth_user_created`, `on_auth_user_updated`), so migration `0003` is applied; a brand-new account's automatic profile row has not been observed yet (the next new account, e.g. the second test account for the household-sharing test, will show it). Reset by emailed code is not confirmed end to end.
- **Gemini runs on a billing-enabled Google project (D20)**; free-tier limits (20 requests/day/model) no longer apply. Keep a budget alert on it, keep the key server-side, rotate the key that was pasted into a chat.
- **Decision numbers:** D19 is Thanh's password reset + Google/Apple sign-in; D20 is the Gemini billing decision (renumbered to avoid a clash).
- **Branches and PR order (stacked):** `feat/personal-closets` (D18) -> `feat/forgot-password-social-login` (D19) -> `feat/ai-core-d18` (AI core, functions, e2e). Trial-merged together: 274 tests pass, typecheck clean, only the notes and the `include` list in `tsconfig.json` conflict. Each PR needs an **approval on the Files changed tab before merging**.
- **App contract:** the screens should call the functions with `supabase.functions.invoke("analyze-garment" | "generate-outfit" | "update-preferences", { body })`; error codes are in "Edge functions: run, deploy, test". On a 429 from `analyze-garment`, let the user type the tags.
- **Running the app on an iPhone:** newer Expo Go has no "enter URL" box; scan the QR code with the Camera app. `npx expo start --tunnel` needs `@expo/ngrok` in the project's `node_modules`: `npm install --no-save @expo/ngrok@^4.1.0` inside `frontend/` (do not add it to `package.json`).
- **"Your profile could not be found" after a successful sign-in** means the account has no `public.users` row (it was created before the sign-up trigger existed). Repair in the Supabase SQL editor (safe to repeat): `insert into public.users (id, name) select id, coalesce(nullif(raw_user_meta_data ->> 'name', ''), nullif(raw_user_meta_data ->> 'full_name', ''), '') from auth.users on conflict (id) do nothing;` Confirmed working on Manuel's account on 2026-10-08.
- **Emails** (sign-up confirmation, password reset) arrive in spam (Gmail SMTP, accepted until Milestone 3).
- **Tagging results** (23 real product photos, flash models): strict type 95 / color 86 / season 73 / warmth 95 %; see `AI Logic Ownership.md`. The model fallback chain lives in `_shared/gemini.ts`.

## Known unknowns (blockers to watch)
- Supabase project not created; migration and RLS untested on a real database.
- Gemini model/version and key not chosen; edge functions not deployed (Deno not installed locally).
- Real Milestone 2 due date and rubric not confirmed.
- `docs/architecture.md` and `docs/api_endpoints.md` still describe the pre-D1–D18 design.
- `feat/ai-core` still reads garments by `household_id`; it must switch to `owner_id` after D18 (Manuel).
