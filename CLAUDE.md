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
- Decisions D1–D18 are in the decisions note and override anything older in `docs/` (e.g. personal closets with optional households for sharing (D18, replaces D1's household-scoped garments), per-user location, top+bottom+shoes outfit, review-and-edit tagging). `docs/` still needs updating to match.

## What this project is

**Problem:** People wear a small fraction of what they own because tracking what's clean, what matches, and what hasn't been worn lately is hard to do from memory — leading to wasted time each morning and underused clothes.

**Solution:** A web app that digitizes a user's closet via photo upload, uses AI vision tagging to auto-classify each garment, and generates a daily outfit suggestion based on weather, laundry status, and personal style. A cold-start onboarding quiz seeds the recommendation engine; the system improves via thumbs up/down feedback on suggestions.

Full proposal: `SWE with AI Final Project Proposals - Thanh Phan & Manuel Edwardo De La Rosa Modesto.pdf` (vault copy: `C:\OBS Class Vault\02 Software Engineering with AI\Projects\`).

## Current status

Read `brain/Work Plan.md` first: it has the branch map, PR order, who owns what, and what each branch should deliver.

- Done: shared tooling and contracts (`chore/tooling-contracts`), Supabase schema + RLS + CI (`feat/data-layer`), outfit scoring engine with tests (`feat/ai-core`).
- In progress: Expo app (`feat/expo-app`, Thanh) and preference learning / tag validation (`feat/ai-core`, Manuel + Claude).
- Not verified yet: the migration has never run on a real Supabase project; CI has not run on GitHub.
- Goal now: Milestone 2 (core feature + >80% coverage, teammate-reviewed PRs).

## MVP scope (must ship for the capstone)

- [ ] Photo upload with AI auto-tagging (type, color, season) — this is the core premise; without it the app is just manual data entry
- [ ] Closet inventory view
- [ ] Mark item clean / in laundry
- [ ] Multi-user profiles under one household
- [ ] Daily outfit suggestion (weather + clean status + repeat avoidance) — the core value proposition
- [ ] Cold-start quiz on first use (seeds personalization before feedback data exists)
- [ ] Thumbs up / down feedback on suggestions (how the system learns over time)

### Stretch (only after MVP is solid)
- Color coordination / pairing rules
- Layering logic for cold weather (base + outer layer)
- Outfit history log ("what did I wear last Tuesday")
- Style drift over time (taste changes season to season)

## Tech stack (all free tier — keep it that way)

- **Frontend:** Expo (React Native), primarily for iPhone, tested via Expo Go (decision D16; replaces the earlier React-on-Vercel plan; an Expo web export can still be hosted if a web demo is needed)
- **Backend / DB:** Supabase (Postgres + auth + file storage, free tier)
- **Vision tagging:** a free-tier multimodal model (e.g. Gemini) for garment classification from photos
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

All directories currently contain only `.gitkeep` — replace as you add real files, don't leave both.

## Data model (target — not yet migrated)

```
users            (household_id, name, quiz_preferences)
garments         (user_id, image_url, type, color, season, warmth, status: clean/dirty, last_worn_date)
preference_vector(user_id, tag, weight)   -- seeded by quiz, updated by feedback
suggestions      (user_id, date, garment_ids, feedback: up/down/null)
```

Supabase migrations should live in `supabase/migrations/` and be the source of truth for schema — don't let it drift from this sketch without updating both.

## Working conventions

- **Secrets:** never commit real keys. `.env.example` should list every required var (Supabase URL/anon key, vision-model API key, OpenWeatherMap key) with empty values — keep it in sync with what the code actually reads.
- **AI Audit Log:** each teammate keeps an individual log of AI tool usage per course policy — log notable prompts/decisions in `usedPrompts.md` or your personal audit log, not just in chat history.
- **PRs:** every milestone ships as a PR with at least one teammate review before merge — do not self-merge milestone PRs.
- **Free tier discipline:** this stack is chosen to stay entirely on free tiers. Flag it before introducing a paid dependency.

## Related

- Project notes: `brain/AI Wardrobe Stylist - Capstone Project.md`
- GitHub: https://github.com/tphan1-23/AI-Wardrobe-Stylist
