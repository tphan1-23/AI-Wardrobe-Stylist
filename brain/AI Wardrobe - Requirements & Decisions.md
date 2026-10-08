---
class: SWE-AI
course: CSCI 4397 / 6397
status: in-progress
tags: [project, capstone, swe-ai, requirements, decisions]
---

# AI Wardrobe Stylist — Requirements & Decisions

← [[02 Software Engineering with AI/Projects/AI Wardrobe Stylist - Capstone Project|Project note]] · [[02 Software Engineering with AI/SWE-AI Home|Class Home]]

Running log of requirements-gathering Q&A. Each decision should also be reflected in the repo (`CLAUDE.md`, `docs/architecture.md`, `docs/api_endpoints.md`) so both teammates and agents stay aligned.

## Decisions made

| # | Date | Topic | Decision | Notes |
|---|---|---|---|---|
| D1 | 2026-10-02 | Household model | **Superseded by D18.** **Shared closet, per-person profiles.** One household closet visible to all members; each member keeps their own preferences, preference vector and suggestions. | Resolves conflict: `api_endpoints.md` scoped RLS by household, `architecture.md` scoped garments by user. Garments should be household-scoped; `suggestions`/`preference_vector` stay per-user. |
| D2 | 2026-10-02 | Outfit definition (MVP) | **Top + bottom + shoes required** for every suggestion. | Implies users must upload shoes for a usable suggestion; need a fallback/empty-state when a slot has no clean item. One-piece garments (dresses) still need a rule. |
| D3 | 2026-10-02 | Worn / dirty lifecycle | **Accepting a suggestion marks items worn** (sets `last_worn_date`); **user manually marks items dirty / clean.** | No auto-dirty. Open: what counts as "accepting" (thumbs up vs. separate action) and whether manual "wore something else" is needed. |
| D4 | 2026-10-02 | Tag errors | **Review & edit screen** after upload: AI-proposed tags are prefilled and editable; user confirms before the garment is saved. | Gives a human-verification step (course emphasis). Tag schema must support editing. |
| D5 | 2026-10-02 | Weather location | **Per-user location.** Each profile has its own location. | Location lives on the user profile, not the household. Geocode via OpenWeatherMap. Conflicts with household-level location assumption in `api_endpoints.md`. |
| D6 | 2026-10-02 | Platform | **Phone-first responsive web.** Camera/photo upload via file input; must remain usable on desktop. | PWA not required. |
| D7 | 2026-10-02 | Team split | **Vertical slices per person**, with cross-review of PRs. | Which slice each person owns and who is first tech lead: still to assign (see open questions). |
| D8 | 2026-10-02 | Cold-start quiz | Captures **style vibes, temperature comfort, occasion mix, favorite & avoided colors.** | All four seed `preference_vector` tags / warmth offset. `occasion` may need a field on garments or tags. |
| D9 | 2026-10-02 | Feedback | **Whole-outfit tag-weight update + re-roll.** Thumbs up/down adjusts weights for tags of all items; thumbs down immediately offers another suggestion. | Re-roll must exclude rejected outfit; multiple `suggestions` rows per day. |
| D10 | 2026-10-02 | Auth & privacy | **Supabase email+password; private storage bucket with signed URLs; users can delete garments, photos and account.** | RLS must cover Storage. Delete flow should remove files, not just rows. |
| D11 | 2026-10-02 | Testing & delivery | **Vitest + React Testing Library** (frontend), **Deno tests** (edge functions) with mocked Gemini/weather, **GitHub Actions** CI on every PR, **Vercel** deploy. Target >80% coverage (M2). | E2E (Playwright) not committed to. |

| D12 | 2026-10-02 | Tech lead | **Manuel is tech lead** (first milestone onward): owns context files (`CLAUDE.md`), contracts/schema decisions, review standards, integration decisions. | Course requires MS students to rotate; rotation for later milestones TBD. |
| D13 | 2026-10-02 | AI logic ownership | **Manuel + Claude own all AI-related logic**: vision-tagging prompt/schema/accuracy, outfit scoring, preference learning and quiz mapping, tuning, offline evaluation and the tests for them. Details in [[AI Logic Ownership]]. | Reason: Manuel and Claude have the most AI/ML experience. Manuel is the accountable human — course policy makes the student responsible for every committed line, so Claude's output is always reviewed by Manuel and by Thanh in PR. |
| D14 | 2026-10-02 | Slices (revises earlier proposal) | **AI core = Manuel + Claude; product/plumbing = Thanh.** Thanh: Supabase migrations + RLS, auth, household flow, upload/review/closet/laundry/quiz/suggestion UI, weather client, deletion flows, CI/CD + deploy, non-AI tests. AI core is built as pure, well-tested modules that Thanh's UI/functions call. | Needs Thanh's agreement. Manuel defines contracts (types, tag schema, function I/O) first so both sides can work in parallel. |
| D15 | 2026-10-02 | Shared "brain" in GitHub | Project notes live in the repo under `brain/` so both teammates (and any Claude Code session/branch) read and update the same notes with every push. | Repo is **public** — only project notes + proposal go here, never course materials, grades, credentials or personal data. |
| D16 | 2026-10-03 | Client platform | **Expo (React Native) app, tested on iPhone via Expo Go.** The app is mainly for iPhone. Supersedes the "React web on Vercel" part of the stack (D6 phone-first web, D11 Vercel deploy). | Contracts, AI core and Supabase backend are unchanged (pure TS). Photo capture via `expo-image-picker`/camera; Supabase JS works in React Native. Expo can also export a web build (`expo export -p web`) if M3 needs a hosted demo on Vercel. Thanh's UI slice moves to `frontend/` as an Expo app. Open: Expo web build as fallback, Apple developer account only needed for TestFlight, not Expo Go. |
| D17 | 2026-10-03 | Milestone 2 graded PR | **One PR, one core feature: auth + household** (sign-up/log-in/log-out, create/join household, weather location), with unit tests and a committed coverage analysis of at least 80% of that feature's code. Manuel submits, Thanh approves on GitHub. Assignment rules: one PR, approved by a teammate other than the submitter, one core feature, tests, coverage analysis. | Chosen by Manuel over my recommendation (outfit suggestion, which stays on `feat/ai-core` for a later milestone). The household logic was written by Manuel + Claude on `feat/household-service` (authored as Manuel) so both authors have commits in the PR. |
| D18 | 2026-10-08 | Personal closets (supersedes D1) | **Every account gets its own closet; a household is optional and only shares closets.** Garments belong to the person who added them (`owner_id`). Household members can **view** each other's garments and photos; only the owner can change or delete them. Joining or leaving never moves clothes, it only changes who can see them. One household at a time (leave before joining another). The last member to leave deletes the household. No special owner role. Daily suggestions use the user's **own** closet only. | Proposed by Thanh; implemented on `feat/personal-closets` (`0002_personal_closets.sql`, `leave_household` RPC, members list, optional household screen). Onboarding no longer requires a household. **Needs Manuel's review:** `types.ts` `Garment` changes (`household_id`/`added_by` → `owner_id`), and `feat/ai-core` scoring/`generate-outfit` must read garments by `owner_id`. Possible later: partners marking each other's items dirty, "remove member". |

## Draft requirements (from decisions so far)

### Functional
- FR1 Sign up / log in with email + password; optionally create, join or leave a household (D18).
- FR2 Upload a garment photo; AI proposes `type`, `color`, `season`, `warmth`; user reviews/edits before saving (D4).
- FR3 Personal closet view; household members can also view each other's closets (read-only); filter by type/status (D18).
- FR4 Manually mark items dirty / clean (D3).
- FR5 First-use quiz seeds per-user preference vector (D8).
- FR6 Daily suggestion = top + bottom + shoes, all clean, weather-appropriate for the user's location, avoids recent repeats, scored against the user's preference vector (D2, D5).
- FR7 Accepting a suggestion sets `last_worn_date` on its items (D3).
- FR8 Thumbs up/down updates preference weights; thumbs down returns a new suggestion (D9).
- FR9 Delete garment / photo / account (D10).

### Non-functional
- NFR1 Mobile-first responsive UI (D6). NFR2 Free-tier only (Supabase, Gemini, OpenWeatherMap, Vercel). NFR3 Per-user data isolation via RLS, readable by household members only, including Storage (D10, D18). NFR4 >80% automated test coverage, CI on every PR (D11). NFR5 Secrets only server-side (vision key in edge function); `.env.example` kept current. NFR6 Every milestone as a teammate-reviewed PR; per-person AI Audit Log.

## Impact on existing repo docs (not yet applied)
- `docs/architecture.md`: add `households` table; make garments household-scoped; move location to `users`; add review step to the upload flow; describe re-roll.
- `docs/api_endpoints.md`: `generate-outfit` uses the user's location, supports re-roll (exclude rejected outfits); add an accept/"wear" action; add household create/join; add delete flows.
- `CLAUDE.md`: record decisions D1–D11 and update the status section.

## Gaps found in current docs (2026-10-02 review)
- Household create/invite/join flow has no table or endpoint (`households` table not in data model).
- `users` table conflates auth user and profile; unclear whether profiles can exist without their own login.
- No event defines when `last_worn_date` changes (now addressed by D3, docs not yet updated).
- Vision-tagging failure/low-confidence/user-correction behavior undefined; vision provider + prompt/schema undecided.
- Weather location source (browser geolocation vs. typed city vs. household setting) undefined.
- No test strategy, CI/CD plan, or privacy/data-retention stance for uploaded photos.
- `.env.example`, `AGENTS.md`, `usedPrompts.md`, `supabase/migrations/` still empty.

## Status vs. course schedule (as of 2026-10-02)
- GitHub `main` @ `89e117d`: only docs (architecture, API endpoints) and skeleton placeholders — **no application code, no migrations, no tests**. No other branches; PR history not visible from CLI (`gh` not installed locally).
- Course schedule had M1 (architecture & skeleton PR) due Week 4 and M2 (core feature + >80% coverage) due Week 6 (Sept 28–Oct 2). Whether M1 was formally submitted is **unconfirmed** — to verify on Peerceptiv/Canvas.

## Open questions
_(answered ones move to the Decisions table)_
- [ ] Real milestone dates / M1 submission status (GitHub shows docs only; confirm on Peerceptiv/Canvas) — answer given was "check GitHub", which shows no PR/code
- [ ] Thanh's agreement to D13/D14 (AI core with Manuel + Claude; plumbing/UI with Thanh) and tech-lead rotation after the first milestone
- [ ] Vision provider (Gemini model/version), tag schema (enumerated types/colors/seasons, warmth scale), prompt, handling of multi-item or low-quality photos, free-tier rate limits
- [ ] One-piece garments (dresses/jumpsuits) and outerwear: can they substitute top+bottom? Is outer layer deferred to the layering stretch goal?
- [ ] What if the household has no clean shoes (or any slot is empty)? Empty state or relaxed suggestion?
- [ ] Scoring formula: weights for weather fit, preference match, repeat penalty; how feedback magnitude and decay work; how quiz answers map to tags
- [ ] Household create/invite/join mechanics (invite code?) and whether profiles can exist without their own login
- [ ] Definition of "accepting" a suggestion in the UI (button vs. thumbs up) and what happens if the user wears something else
- [ ] Photo handling: max size, compression, retention after account deletion
- [ ] Demo plan and success criteria for the final presentation (what a grader sees working)
