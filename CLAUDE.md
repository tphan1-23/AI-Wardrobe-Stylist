# AI Wardrobe Stylist — CLAUDE.md

Shared agent context file for this repo (course deliverable: "repo setup w/ shared context file" — Week 3, CSCI 4397/6397). Read this before making changes. Keep it current as the project evolves — this is the file future agent sessions (and teammates) rely on to get oriented fast.

## Course context

- **Course:** CSCI 4397 / 6397 — Software Engineering with AI (Fall 2026), instructor Jon Baarsch
- **This project is the Team Capstone Project (40% of course grade)** — design docs, working software, automated test suite, individual AI Audit Log per teammate
- **Team:** Manuel Edwardo De La Rosa Modesto (mdelarosamodest@cub.uca.edu) & Thanh Phan
- **Course milestones this repo must hit:**
  - **Milestone 1** (Week 4, Sept 14–18) — architecture & skeleton, submitted as a PR
  - **Milestone 2** (Week 6, Sept 28–Oct 2) — core feature + automated test suite (>80% coverage), PR w/ teammate review
  - **Milestone 3** (Week 12, Nov 9–13) — deployed app w/ CI/CD + AI-assisted docs, PR-reviewed
- Every milestone is a PR requiring ≥1 teammate review/approval — don't merge your own PRs.
- Grading weighs **process and verification**, not just working code: be able to explain how AI-generated code was checked, not just that it runs.

## Shared brain & ownership

- **`brain/` is the team's shared memory** (Obsidian-compatible notes, see `brain/README.md`). At the start of a session read `brain/Work Plan.md`, `brain/AI Wardrobe - Requirements & Decisions.md` and `brain/AI Logic Ownership.md`; run `git fetch --all` to see other branches/sessions. When a decision is made or status changes, update `brain/` in the same commit/PR as the code. The repo is public — never put course materials, grades, secrets or identifiable photos in it.
- **Tech lead:** Manuel (owns this file, contracts/schema, review standards, integration).
- **AI logic is owned by Manuel + Claude:** vision-tagging prompt/schema/accuracy, outfit scoring, preference learning, quiz mapping, tuning, evaluation and their tests. Keep it in pure, well-tested modules behind agreed contracts; log every prompt/weight change with before/after metrics in `brain/AI Logic Ownership.md`. Manuel reviews all of it and Thanh reviews PRs — never self-merge.
- **Thanh owns product/plumbing:** migrations + RLS, auth, households, UI, weather client, deletion flows, CI/CD + deploy.
- Decisions D1–D22 are in the decisions note and override anything older in `docs/` (e.g. personal closets with optional households for sharing (D18, replaces D1's household-scoped garments), per-user location, top+bottom+shoes outfit, review-and-edit tagging). `docs/` still needs updating to match.

## What this project is

**Problem:** People wear a small fraction of what they own because tracking what's clean, what matches, and what hasn't been worn lately is hard to do from memory — leading to wasted time each morning and underused clothes.

**Solution:** A web app that digitizes a user's closet via photo upload, uses AI vision tagging to auto-classify each garment, and generates a daily outfit suggestion based on weather, laundry status, and personal style. A cold-start onboarding quiz seeds the recommendation engine; the system improves via thumbs up/down feedback on suggestions.

Full proposal: `SWE with AI Final Project Proposals - Thanh Phan & Manuel Edwardo De La Rosa Modesto.pdf` (vault copy: `C:\OBS Class Vault\02 Software Engineering with AI\Projects\`).

## Current status

Read `brain/Work Plan.md` first: it has the branch map, PR order, who owns what, and what each branch should deliver.

- Done (PRs #1 to #27 merged on `main`; each was reviewed by the other teammate, and #1's approval was only recorded after the merge): all seven MVP features are built. Auth
  (email, password reset by code, Google via tunnel), personal closets with optional households, quiz, Add (with AI tags
  and an AI crop suggestion), Closet, Today (with New outfit), thumbs up/down, Style Swipe, History and Favorites.
  Supabase schema, row-level security and migrations 0001 to 0008 are applied (history repaired). The three edge
  functions are deployed from `main` and verified live.
- Verified: `scripts/e2e.ts` 38 of 38 and `scripts/e2e-household.ts` 34 of 34 on the real project (2026-11-06); 574 unit
  tests, 100% of lines and functions on tested code; Supabase security advisor reviewed. The screens are checked by
  hand on an iPhone only.
- Next: Milestone 3 (deployed app with CI/CD and AI-assisted docs, Nov 9-13). Hosting stays on Expo Go for now (D22);
  see `docs/deployment.md` section 8 and the Milestone 3 list in `brain/Work Plan.md`.
- Open: email deliverability and Site URL (needs a real address), Apple sign-in (not usable), a per-user cap on
  `analyze-garment`, automated deploy on merge, individual audit logs to review and mark `[reviewed]`.

## MVP scope (must ship for the capstone)

- [x] Photo upload with AI auto-tagging (type, color, season) — this is the core premise; without it the app is just manual data entry
- [x] Closet inventory view
- [x] Mark item clean / in laundry
- [x] Multi-user profiles under one household (personal closets with optional households, D18)
- [x] Daily outfit suggestion (weather + clean status + repeat avoidance) — the core value proposition
- [x] Cold-start quiz on first use (seeds personalization before feedback data exists)
- [x] Thumbs up / down feedback on suggestions (how the system learns over time)

### Stretch (only after MVP is solid)
- Color coordination / pairing rules
- Layering logic for cold weather (base + outer layer)
- Outfit history log ("what did I wear last Tuesday") — built as the 7-day History tab
- Style drift over time (taste changes season to season)

## Tech stack (all free tier — keep it that way)

- **Frontend:** Expo (React Native), primarily for iPhone, tested via Expo Go (decision D16; replaces the earlier React-on-Vercel plan; an Expo web export can still be hosted if a web demo is needed)
- **Backend / DB:** Supabase (Postgres + auth + file storage, free tier)
- **Vision tagging:** Gemini multimodal models for garment classification and a crop suggestion (billing-enabled project, D20)
- **Weather:** OpenWeatherMap free tier
- **Recommendation logic:** rule-based scoring to start, blended with a preference vector seeded by the quiz and updated by feedback

## Repo structure

```
frontend/   # Expo (React Native) app, see Work Plan; layout below is the original sketch and may change
  src/
  components/
    closet/       # closet inventory UI
    common/        # shared UI primitives
    onboarding/    # cold-start quiz
    outfit/        # daily suggestion UI
    upload/        # photo upload flow
  hooks/
  pages/
  services/        # API calls (Supabase client, weather, vision tagging)
  utils/
supabase/
  functions/
    analyze-garment/      # vision tagging edge function
    generate-outfit/      # recommendation/scoring edge function
    update-preferences/   # feedback -> preference_vector update
  migrations/
docs/
  architecture.md      # fill in during Milestone 1
  api_endpoints.md      # fill in as endpoints are built
AGENTS.md               # currently empty — reserved if a teammate uses a Codex/Agents-style tool; this CLAUDE.md is the canonical shared context file
usedPrompts.md           # log notable AI prompts used, per course AI-audit expectations
```

The tree above is the original sketch. Real layout: screens in `frontend/src/pages/`, logic in `frontend/src/services/` (pure modules with injected gateways), shared AI logic in `supabase/functions/_shared/`, tests in `tests/`, docs in `docs/` (architecture, API, deployment, user guide, AI development) and team notes in `brain/`.

## Data model (migrated; see `docs/architecture.md`)

```
households        (id, name, invite_code)                         -- optional, only shares closets
users             (id, household_id?, name, location, quiz_preferences)
garments          (owner_id, image_path, type, color, season, warmth, status: clean/dirty, last_worn_date, favorite)
preference_vector (user_id, tag, weight)   -- seeded by quiz, updated by feedback
suggestions       (user_id, date, garment_ids, feedback: up/down/null, accepted, kind: today/explore, favorite)
```

Supabase migrations should live in `supabase/migrations/` and be the source of truth for schema — don't let it drift from this sketch without updating both.

## Working conventions

- **Secrets:** never commit real keys. `.env.example` should list every required var (Supabase URL/anon key, vision-model API key, OpenWeatherMap key) with empty values — keep it in sync with what the code actually reads.
- **AI Audit Log (graded, individual):** Manuel's log is `usedPrompts.md`; Thanh keeps hers in `usedPrompts-thanh.md`. **After every notable task, the Claude session must append an entry to the owner's log in the same PR as the work** (what was asked, what the AI produced, how it was verified, what was changed or rejected, failures included), and tell the user it did. Never include keys or personal photos. The owner reads and edits entries so they are in their own words.
- **PRs:** every milestone ships as a PR with at least one teammate review before merge — do not self-merge milestone PRs.
- **Supabase access:** the team's AI sessions use a read-only Supabase connection; production changes go through reviewed migration files, are applied by a person, and are verified read-only afterwards (`docs/deployment.md`, section 7). Never run delete or reset SQL without telling the team first.
- **Free tier discipline:** this stack is chosen to stay on free tiers. Flag it before introducing a paid dependency. **One exception (D20):** the Gemini API runs on a billing-enabled Google Cloud project covered by trial credits (expire 2027-01-07); keep a budget alert on it and keep the key server-side.

## Related

- Project notes: `brain/AI Wardrobe Stylist - Capstone Project.md`
- GitHub: https://github.com/tphan1-23/AI-Wardrobe-Stylist
