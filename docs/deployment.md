# Deployment and operations runbook

How the system is set up, deployed, verified and kept safe. Written for a teammate or reviewer who needs to reproduce
it. The app runs on **Expo Go** for now (decision D22); a hosted web build or a built app is undecided and listed at the
end.

## 1. What runs where

| Part | Where | Deployed how |
|---|---|---|
| Database, Auth, Storage | Supabase project (free tier, production only) | migrations in `supabase/migrations/`, applied by hand |
| Edge functions `analyze-garment`, `generate-outfit`, `update-preferences` | same Supabase project | `supabase functions deploy`, from `main` |
| Mobile app (Expo, branded DressWell) | each person's iPhone in Expo Go | `npx expo start --tunnel -c` from `frontend/` |
| Vision model | Gemini API, billing-enabled Google Cloud project (D20) | key stored as a Supabase secret |
| Weather | OpenWeatherMap free tier | key stored as a Supabase secret |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | on every pull request and push to `main`: `npm ci`, type check, tests with the 80% coverage gate |

There is one Supabase project and no staging copy, so every change to it is a production change. The rules in
section 7 exist because of that.

## 2. Configuration

Never commit real values. `.env.example` lists every variable.

| Variable | Where it lives | Used by |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `frontend/.env.local` (git-ignored) | the app. The anon key is public by design; security comes from row-level security and function grants |
| `GEMINI_API_KEY`, `OPENWEATHER_API_KEY` | Supabase secrets (`supabase secrets set NAME=value`) and, for local scripts, the git-ignored `.env` | edge functions, evaluation scripts |
| `TEST_EMAIL`, `TEST_PASSWORD` (and `TEST2_*`) | git-ignored `.env` | the end-to-end scripts; throwaway accounts |

Set secrets by name. Do **not** use `--env-file .env`, which would also upload the test password.

## 3. Database migrations

Migrations `0001` to `0008` are the source of truth for the schema:

| # | What |
|---|---|
| 0001 | base schema, row-level security, private photo bucket, sign-up trigger |
| 0002 | personal closets and optional households (D18) |
| 0003 | profile names from Google/Apple sign-in (D19) |
| 0004 | `ensure_profile()` repairs a missing profile |
| 0005 | favorites on garments and suggestions |
| 0006 | `suggestions.kind` (`today` or `explore`) for Style Swipe |
| 0007 | wearing an outfit marks it dirty except shoes (D21) |
| 0008 | signed-out callers can no longer run our functions |

**Applying a migration:** review and merge the PR, paste the file into Supabase **SQL Editor**, run it, then run
`notify pgrst, 'reload schema';`. Then run the migration-history repair so Supabase's own bookkeeping matches:
`npx supabase migration repair --status applied <version>`. (The CLI asks for explicit confirmation before it changes
the production project; an agent or a script must be told `--yes` by a person.) Migrations 0001 to 0008 were applied by
hand and recorded this way on 2026-11-06; `list_migrations` shows all eight.

Write migrations so they are safe to run twice and change only what they say. Tests in `tests/migration.test.ts` read the
SQL and fail on forbidden statements.

## 4. Deploying the edge functions

From `main` only, after the PR is approved and merged:

```bash
npx supabase functions deploy analyze-garment generate-outfit update-preferences \
  --project-ref <project ref> --use-api
```

The project ref is the subdomain of `EXPO_PUBLIC_SUPABASE_URL`. You need `npx supabase login` once. Deploy only the
functions that changed. Type-check first: `npx deno check --config supabase/functions/deno.json supabase/functions/*/index.ts`.

**After deploying**, check the live function, not just the tests: call it as a signed-in test user and look at the
response (the weather, the `box`, the `kind` stored). Every deploy since 2026-10-18 was checked this way and cleaned up
its test rows.

## 5. Running and testing the app

```bash
cd frontend
npx expo start --tunnel -c
```

Scan the QR code with the iPhone Camera app. **Use the tunnel:** Google sign-in only works through it (a plain LAN
server asks Supabase for a redirect address it rejects, so the browser lands on `localhost:3000`). The tunnel needs
`npm install --no-save @expo/ngrok@^4.1.0` inside `frontend/` (do not add it to `package.json`; a later
`npm install` removes it, so reinstall).

**Checks you can run:**

| Command | What it proves |
|---|---|
| `npm run typecheck` | TypeScript, root and `frontend/` (run `npx tsc --noEmit` in `frontend/` too) |
| `npm run test:coverage` | 574 unit tests, 80% gate (we are at 100% of lines and functions on tested files) |
| `node scripts/e2e.ts <photos folder>` | the AI path on the real project: sign in, security rules, 7 photos tagged by the real model, outfit, learning, accept, cleanup. Last pass 38 of 38 (2026-11-06). A few cents of Gemini credit |
| `node scripts/e2e-household.ts` | two-account household sharing and security rules, 34 of 34. No AI calls |
| `node scripts/eval-tagging.ts <results.json> [--strict]` | tagging accuracy against `eval/tagging-labels.json` |
| `npx expo export --platform ios` | the iOS bundle builds |

## 6. Dashboard settings that live outside the repo

Record any change here, because the code cannot show it.

- **Authentication, Email:** sign-up confirmation keeps the default **link** (the Expo Go app cannot open it, and the
  Site URL is still `http://localhost:3000`; testers tap the link and go back to the app). The password-reset template
  shows `{{ .Token }}` so the code is typed into the app. Emails go through a dedicated Gmail account over SMTP and land
  in spam until a domain with SPF, DKIM and DMARC is set up.
- **Authentication, URL Configuration:** the redirect list contains `exp://**` (Expo Go) and `dresswell://**`. Remove
  `exp://**` before any public release.
- **Authentication, Providers:** Google is on (OAuth client in Google Cloud). Apple is off: a real Apple sign-in needs
  the paid Apple Developer Program.
- **Password rules:** 8 to 72 characters with upper, lower, number and symbol at sign-up (the app and the dashboard agree).
- **Leaked-password protection** is off; it needs a paid plan.

## 7. Safety rules for the production project

These came from real incidents and findings:

1. **Say it in the team chat before running delete or reset SQL.** On 2026-10-08 every profile row disappeared after
   manual SQL; the cause was found, `ensure_profile()` repairs the symptom, and the rule is written in `brain/Work Plan.md`.
2. **Schema changes only as reviewed migration files.** No ad-hoc DDL in the dashboard.
3. **Check the security advisor after any change to functions or policies.** On 2026-11-06 it showed that the public
   key could run all our database functions (one of them created households for anyone); migration 0008 closed it, and a
   live test confirmed signed-out calls now get "permission denied" while signed-in calls still work.
4. **Read-only first.** The team's AI tooling reaches Supabase through a read-only connection; changes are applied by a
   person, or by a command the person explicitly confirms.
5. **Keep keys server-side.** The Gemini key never goes in the app or the repo. The Gemini project is billing-enabled
   (D20): keep a budget alert on it.

## 7a. Roll back

- **A bad function deploy:** redeploy the previous commit of the function from git (`git checkout <good commit> --
  supabase/functions` on a branch, deploy, then restore through a PR).
- **A bad migration:** write a new migration that undoes it and go through the normal PR. Migrations here only add or
  tighten, never delete data.
- **A bad app build:** the app is not distributed as a build; Expo Go loads whatever the dev server serves, so stopping or
  fixing the server is the rollback.

## 8. Known gaps and open decisions

- **Hosting for non-developers.** Today everyone needs the dev server and Expo Go. Options: a hosted web build (the app
  already builds for web with `react-dom` and `react-native-web`, but is untested in a browser), or a built iOS app
  (needs the paid Apple Developer Program). Undecided (D22).
- **Email deliverability and the Site URL** (emails in spam, confirmation link goes to `localhost:3000`) are fixed once a
  real address and sending domain exist.
- **Automated deploys.** CI runs checks on every PR; deploying the functions is a manual, confirmed step. A workflow that
  deploys on merge to `main` is possible (needs a Supabase access token as a repository secret) but not built.
- **Abuse limits.** `analyze-garment` has no per-user daily cap; with billing enabled, a cap is advisable before a public
  release.
- Five unused template tables (`tasks`, `labels`, `task_labels`, `comments`, `activity_log`) existed in the project from
  a starter template; they were empty and are removed (see `brain/Work Plan.md`).
