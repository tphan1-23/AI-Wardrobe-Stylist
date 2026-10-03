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
**Progress (2026-10-03):** step 1 done (Expo SDK 57 app). Step 2 done (`frontend/src/services/supabase.ts`, reads `frontend/.env.local`). Step 4 done in code: `services/auth.ts` (pure logic, injected client) + `AuthScreen`/`HomeScreen`/`useSession`; 21 unit tests, 100% coverage on `auth.ts`, added to the 80% gate. **Not yet verified on a device or against a real Supabase project** (step 3 migration run still to confirm). Next: step 3 report, step 5 household, then 6 and 7. Closet + clean/dirty (step 7) is the planned single core feature for the Milestone 2 PR.

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
