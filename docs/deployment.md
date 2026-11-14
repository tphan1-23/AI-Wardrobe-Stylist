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

Migrations `0001` to `0009` are the source of truth for the schema:

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
| 0009 | length and value limits in the database (names, location, photo path, tags, weights, outfit size) |

**Applying a migration:** review and merge the PR, paste the file into Supabase **SQL Editor**, run it, then run
`notify pgrst, 'reload schema';`. Then run the migration-history repair so Supabase's own bookkeeping matches:
`npx supabase migration repair --status applied <version>`. (The CLI asks for explicit confirmation before it changes
the production project; an agent or a script must be told `--yes` by a person.) Migrations 0001 to 0008 were applied by
hand and recorded this way on 2026-11-06; `list_migrations` shows all eight.

**The migration lock.** `supabase/migrations/checksums.json` records a checksum of every migration. A test fails when an
applied migration is edited, a migration has no entry, an entry has no file, or the numbering has a gap. To add a
migration, create `NNNN_name.sql`, run `npm run migrations:lock` and commit the updated `checksums.json` in the same PR.
To change one that is already applied (almost never right: write a new migration instead) the lock refuses unless you run
`npm run migrations:lock -- --accept-edit <file>`, which makes the edit visible in the PR diff for the reviewer.

**Who must review what.** `.github/CODEOWNERS` names an owner per area (AI logic and contracts, database, app, docs) and
lists the teammate too, so the non-author can always approve. For GitHub to *require* it, the repository owner turns on
branch protection for `main` (Settings, Branches): require a pull request, require 1 approval, require review from Code
Owners, and require the `test` and `frontend` checks to pass.

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
  Site URL points at the confirmation page, see below). The password-reset template
  shows `{{ .Token }}` so the code is typed into the app. Emails go through a dedicated Gmail account over SMTP and land
  in spam until a domain with SPF, DKIM and DMARC is set up.
- **Authentication, URL Configuration:** the redirect list contains `exp://**` (Expo Go) and `dresswell://**`. Remove
  `exp://**` before any public release.
- **Authentication, Providers:** Google is on (OAuth client in Google Cloud). Apple sign-in was dropped (D23): it needs
  the paid Apple Developer Program.
- **Password rules:** 8 to 72 characters with upper, lower, number and symbol at sign-up (the app and the dashboard agree).
- **Leaked-password protection** is off; it needs a paid plan.

### The confirmation page (live-app sign-up flow, D24)

New accounts are confirmed by the link in the sign-up email. The link lands on `docs/confirmed/index.html`, a static page
with no tracking and no outside resources: it says "Email confirmed" (or "This link has expired" or "did not work"), tells
the person to open the app and log in, and removes the login tokens from the address bar. It never reads, logs or sends them.

**One-time setup, outside the repo:**
1. **GitHub Pages** (repository owner): Settings, Pages, "Deploy from a branch", branch `main`, folder `/docs`. The file
   `docs/.nojekyll` stops Pages from processing our Markdown (it contains `{{ }}` text that would break Jekyll). The page is then at
   https://tphan1-23.github.io/AI-Wardrobe-Stylist/confirmed/
2. **Supabase Site URL:** Authentication, URL Configuration, Site URL = that address. (The sign-up call does not pass its own
   redirect, so the Site URL is where the link goes.) Keep the existing redirect list.
3. **Optional:** Authentication, Emails, "Confirm signup" template: a clearer subject such as "Confirm your DressWell account".
   Keep the link variable (`{{ .ConfirmationURL }}`).

The site root (`https://tphan1-23.github.io/AI-Wardrobe-Stylist/`, the address GitHub shows under Pages) is a small landing page
(`docs/index.html`) so that link is not a 404; the confirmation page itself is only at `/confirmed/`. Addresses are case-sensitive.

**What the page says, and when:** "Email confirmed" only for a real sign-up link (the address carries `type=signup`).
"This link has expired" or "did not work" for a rejected link. **"Sign-in finished ... the DressWell app did not receive it"**
when the address carries a session but no `type=signup`: that is a **Google sign-in that landed here instead of in the app**.
It happens when the app was started **without the tunnel**: Supabase only returns to addresses in its Redirect URLs list
(`exp://**`, `dresswell://**`), and a plain network address such as `exp://192.168.1.50:8081/...` is not on it, so it falls back
to the Site URL, which is this page. The fix is to start the app with `npx expo start --tunnel -c` (see section 5). The sign-in
itself worked (the account and its session exist); only the hand-back to the app failed.

**Check it works:** open the page address: it should load and say "Open this page from the confirmation link in your email".
Then sign up in the app with a real address you can read, open the email, tap the link: the page says "Email confirmed", and
logging in works. An expired link tells the person to sign up again with the same email; Supabase then sends a new link.

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
- **Email deliverability and the Site URL** (emails may land in spam) are fixed once a
  real address and sending domain exist.
- **Automated deploys.** CI runs checks on every PR; deploying the functions is a manual, confirmed step. A workflow that
  deploys on merge to `main` is possible (needs a Supabase access token as a repository secret) but not built.
- **Abuse limits.** `analyze-garment` has no per-user daily cap; with billing enabled, a cap is advisable before a public
  release.
- Five unused template tables (`tasks`, `labels`, `task_labels`, `comments`, `activity_log`) existed in the project from
  a starter template; they were empty and are removed (see `brain/Work Plan.md`).
