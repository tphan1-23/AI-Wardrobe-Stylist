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

## Branch map
| Branch | Based on | Author | Status | Contents |
|---|---|---|---|---|
| `main` | — | — | docs + brain only | |
| `chore/tooling-contracts` | main | Manuel | pushed, PR not opened | TypeScript + Vitest (80% gate), tag schema, shared types/contracts |
| `feat/data-layer` | tooling-contracts | Thanh | pushed, PR not opened | `0001_init.sql` (tables, RLS, storage, `create_household`/`join_household`/`accept_suggestion`), `.env.example`, CI |
| `feat/ai-core` | data-layer | Manuel + Claude | in progress | scoring engine (done), preference learning (next), tag validation, tests |
| `feat/expo-app` | data-layer | Thanh | in progress | Expo app in `frontend/`; steps 1, 2 and 4 done (see progress below) |

Chain: `chore/tooling-contracts` → `feat/data-layer` → (`feat/ai-core`, `feat/expo-app`). Work on branches that descend from `feat/data-layer` so the types, schema and CI are present. If you rebase/merge, pull `origin/feat/data-layer` first.

## PR and review order
1. `chore/tooling-contracts` → `main` (Thanh reviews).
2. `feat/data-layer` → `main` after 1 merges (Manuel reviews).
3. `feat/ai-core` → `main` (Thanh reviews).
4. `feat/expo-app` → `main` (Manuel reviews).
Nobody merges their own PR. Review comments should be real; the course grades the review record.

## What `feat/expo-app` should deliver (Thanh)
**Progress (2026-10-03):** step 1 done (Expo SDK 57 app). Step 2 done (`frontend/src/services/supabase.ts`, reads `frontend/.env.local`). Step 4 done and **verified on a device** (sign-up and log-in work in Expo Go): `services/auth.ts` (pure logic, injected client) + `AuthScreen`/`useSession`; 21 unit tests. Step 5 done in code, **not yet verified on a device**: `services/household.ts` (create/join household via the RPCs, load profile and household, save name/location) + `useProfile`, `HouseholdScreen`, `HomeScreen` (shows invite code, saves location); 24 more unit tests. Both services are at 100% coverage under the 80% gate (54 tests total). **Step 3 is still open:** `0001_init.sql` has not yet been applied to the real Supabase project, so household screens fail with "Could not find the table public.users" until it is. The migration was tested locally against embedded Postgres (PGlite, with stand-ins for `auth`/`storage`) and applies cleanly, including the signup trigger, `create_household`, `join_household` and the bad-code error; the `storage.objects` policies could not be verified outside Supabase. Next: apply and confirm the migration, verify step 5 on the phone, then steps 6 and 7. Closet + clean/dirty (step 7) is the planned single core feature for the Milestone 2 PR.

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
6. Upload: `expo-image-picker` → upload to private bucket `garments` at `<household_id>/<uuid>.jpg` → call `analyze-garment` (use a stub returning fixed tags until the real function exists) → review/edit screen → insert garment.
7. Closet list with clean/dirty toggle.
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

## Known unknowns (blockers to watch)
- Supabase project not created; migration and RLS untested on a real database.
- Gemini model/version and key not chosen; edge functions not deployed (Deno not installed locally).
- Real Milestone 2 due date and rubric not confirmed.
- `docs/architecture.md` and `docs/api_endpoints.md` still describe the pre-D1–D16 design.
