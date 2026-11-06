# AI Wardrobe Stylist (DressWell)

A mobile app that digitizes your closet from photos, tags every garment with AI vision, and suggests a daily outfit
based on the weather, what is clean, and your personal style.

> Capstone project for CSCI 4397 / 6397 *Software Engineering with AI* (Fall 2026).
> Team: **Manuel Edwardo De La Rosa Modesto** (tech lead, AI logic) and **Thanh Phan** (product, auth, UI, plumbing).

## The problem

People wear a small fraction of what they own. Remembering what is clean, what matches, and what has not been worn
lately is hard, so mornings are slow and clothes sit unused.

## What it does

| Feature | Status |
|---|---|
| Sign up / log in (email + password, password reset by code, Google) | Done |
| Personal closets, with optional households to share closets (read-only for members) | Done, verified with two accounts |
| Photo upload with AI auto-tagging (type, color, season, warmth), an AI crop suggestion, and a review-and-edit step | Done |
| Daily outfit suggestion (top + bottom + shoes) from weather, clean status and repeat avoidance, with "New outfit" | Done |
| Cold-start style quiz that seeds personal preferences | Done |
| Thumbs up / down that teaches the engine, and **Style Swipe** (swipe outfit ideas to train it) | Done |
| Closet inventory, clean / dirty status; wearing an outfit sends it to the laundry (shoes excepted) | Done |
| History of worn outfits (7 days) and favorite outfits and clothes | Done |

How to use it: [docs/user-guide.md](docs/user-guide.md). Current status and the roadmap are tracked in [brain/Work Plan.md](brain/Work%20Plan.md).

## Tech stack

All free tier, with one documented exception (Gemini billing, decision D20).

- **App:** Expo (React Native) + TypeScript, tested on iPhone through Expo Go
- **Backend:** Supabase (Postgres with Row Level Security, Auth, private file Storage). There is no custom server.
- **AI logic:** three Supabase Edge Functions (Deno) over pure, unit-tested TypeScript modules
  - `analyze-garment`: a Gemini vision model tags a photo
  - `generate-outfit`: rule-based scoring blended with a learned preference vector
  - `update-preferences`: turns thumbs up/down into preference updates
- **Security:** row-level security on every table, a private photo bucket, and database functions that only signed-in
  users can call (reviewed with Supabase's security advisor)
- **Weather:** OpenWeatherMap
- **Tests / CI:** Vitest with an 80% coverage gate, `tsc` type check, GitHub Actions

```
Expo app (iPhone) --> Supabase: Postgres + Auth + Storage
                          '--> Edge Functions --> Gemini (tagging), OpenWeatherMap (weather)
```

More detail: [docs/architecture.md](docs/architecture.md) and [docs/api_endpoints.md](docs/api_endpoints.md).

## Repository layout

```
frontend/             Expo app (src/pages, components, hooks, services)
supabase/
  functions/          Edge functions; pure logic lives in _shared/
  migrations/         SQL schema, the source of truth for the database
tests/                Vitest unit tests for the shared logic and services
scripts/              Evaluation and end-to-end scripts (run against the real project)
eval/                 Hand-labelled data for measuring tagging accuracy
docs/                 Architecture, API and AI-development documentation
brain/                Team notes: decisions, work plan, AI tuning log
CLAUDE.md             Shared context file for AI coding agents
usedPrompts.md        AI audit log (Manuel); usedPrompts-thanh.md (Thanh)
```

## Getting started

**Requirements:** Node.js 22, the Expo Go app on an iPhone, and a Supabase project.

```bash
git clone https://github.com/tphan1-23/AI-Wardrobe-Stylist
cd AI-Wardrobe-Stylist
npm install                 # root: tests and type checking
cd frontend && npm install  # the app
```

1. **Configure.** Use `.env.example` as the list of variables (never commit real keys). The app reads
   `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from `frontend/.env.local`. The edge functions need
   `GEMINI_API_KEY` and `OPENWEATHER_API_KEY` as Supabase secrets (`supabase secrets set ...`), never in the app.
2. **Database.** Apply `supabase/migrations/0001` to `0008` to your project, in order (SQL Editor, then
   `notify pgrst, 'reload schema';`). See [docs/deployment.md](docs/deployment.md).
3. **Run the app.** From `frontend/`: `npx expo start --tunnel -c`, then scan the QR code with the iPhone Camera.
   Use the tunnel: Google sign-in only works through it (details in [brain/Work Plan.md](brain/Work%20Plan.md)).
4. **Deploy the functions.** `npx supabase functions deploy analyze-garment generate-outfit update-preferences --project-ref <ref>`
   (full runbook in [brain/Work Plan.md](brain/Work%20Plan.md)).

## Testing

```bash
npm run typecheck        # TypeScript, no emit
npm test                 # unit tests
npm run test:coverage    # unit tests with the 80% coverage gate (what CI runs)
```

574 unit tests, 100% of lines and functions on the tested code (the CI gate is 80%). Unit tests mock Gemini and the
weather API. Two scripts check the **real deployed project** with throwaway accounts and clean up after themselves:
`scripts/e2e.ts` (AI path, 38 checks) and `scripts/e2e-household.ts` (household sharing and security rules, 34
checks). `scripts/eval-tagging.ts` measures tagging accuracy against `eval/tagging-labels.json` (`--strict` for
first-choice labels only). Screens are checked by hand on an iPhone; they have no automated tests.

## How we use AI to build this

AI is part of how this project is built *and* part of the product:

- **Building:** Claude Code is our main development tool, used both in **VS Code** and in the **terminal**. A shared
  context file ([CLAUDE.md](CLAUDE.md)) and shared notes ([brain/](brain/)) keep every session aligned.
- **In the product:** Gemini tags garment photos; the outfit engine is deterministic, tested code, not a language model.
- **Accountability:** every AI change is verified (tests, mutation checks, real-project runs) and reviewed by a
  teammate. Each of us keeps a personal audit log of prompts, results and failures.

Full write-up: **[docs/ai-development.md](docs/ai-development.md)**.

## Documentation index

| Document | What it covers |
|---|---|
| [docs/user-guide.md](docs/user-guide.md) | How to use the app, screen by screen |
| [docs/ai-development.md](docs/ai-development.md) | How we use AI tools to develop the app |
| [docs/architecture.md](docs/architecture.md) | System design, data model, core flows |
| [docs/api_endpoints.md](docs/api_endpoints.md) | Edge function requests, responses and errors, RPCs, access rules |
| [docs/deployment.md](docs/deployment.md) | Configuration, migrations, deploys, checks, rollback, safety rules |
| [brain/Work Plan.md](brain/Work%20Plan.md) | Roadmap, branch map, runbooks |
| [brain/AI Wardrobe - Requirements & Decisions.md](brain/AI%20Wardrobe%20-%20Requirements%20%26%20Decisions.md) | Decision log (D1 to D22) |
| [brain/AI Logic Ownership.md](brain/AI%20Logic%20Ownership.md) | AI evaluation and tuning log with metrics |
| [usedPrompts.md](usedPrompts.md), [usedPrompts-thanh.md](usedPrompts-thanh.md) | Individual AI audit logs |

## License

Course project; no license has been chosen yet.
