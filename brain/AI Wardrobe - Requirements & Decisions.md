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
| D18 | 2026-10-08 | Personal closets (supersedes D1) | **Every account gets its own closet; a household is optional and only shares closets.** Garments belong to the person who added them (`owner_id`). Household members can **view** each other's garments and photos; only the owner can change or delete them. Joining or leaving never moves clothes, it only changes who can see them. One household at a time (leave before joining another). The last member to leave deletes the household. No special owner role. Daily suggestions use the user's **own** closet only. | Proposed by Thanh; implemented on `feat/personal-closets` (`0002_personal_closets.sql`, `leave_household` RPC, members list, optional household screen). Onboarding no longer requires a household. **Reviewed by Manuel 2026-10-08:** SQL and contract change accepted; the AI core was adapted on `feat/ai-core-d18` (suggestions read the user's own garments by `owner_id`, no household needed). See the D18 review in `Work Plan.md`. Possible later: partners marking each other's items dirty, "remove member". |
| D19 | 2026-10-08 | Sign-in methods | **Add "Forgot your password?" and "Continue with Google / Apple".** Reset works by an **emailed one-time code** typed into the app (not a deep link): enter email, receive code, enter code + new password (same rules as sign-up). Google runs Supabase's OAuth flow in the system browser; Apple uses the native iOS sheet and hands Supabase the identity token. One button covers sign-up and log-in. | Code instead of link because deep links into Expo Go change with every network/tunnel. Needs dashboard setup (reset email template with `{{ .Token }}`, Google provider, Apple provider, redirect URLs). **Cost flag (free-tier rule):** Google is free. Apple works in Expo Go for testing, but shipping a real build with Sign in with Apple needs the paid Apple Developer Program ($99/year); Apple's App Store rules also require Apple sign-in whenever Google sign-in is offered. Supabase's built-in email sender is rate-limited on the free tier; use custom SMTP before real users. **Update 2026-10-08:** editing the reset email template requires custom SMTP on the free plan, so a dedicated Gmail account is the SMTP sender for now. Its emails land in spam; accepted until Milestone 3, when a domain + Resend/Brevo with SPF/DKIM/DMARC fixes it (see Work Plan). |

| D20 | 2026-10-08 | Gemini API billing | **The Gemini API runs on a billing-enabled Google Cloud project** (full account; the $300 trial credit is shown as $0 used and expires 2027-01-07). The API key stays server-side only, never in the app or repo. A budget alert is required. Photo tagging uses the model fallback chain (flash models first, lite last). | Why: the free tier allowed only 20 requests/day per model and 5/minute, which made photo tagging impractical (the evaluation exhausted it in one batch). Exception to the free-tier rule in `CLAUDE.md`. **Open:** confirm the budget alert is set; rotate the key that was pasted into a chat; re-check cost when the credits expire. |

## Draft requirements (from decisions so far)

### Functional
- FR1 Sign up / log in with email + password, Google or Apple; reset a forgotten password by emailed code (D19); optionally create, join or leave a household (D18).
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

## Impact on existing repo docs (applied 2026-10-08)
- `docs/architecture.md` and `docs/api_endpoints.md` were rewritten on 2026-10-08 to match the deployed system (personal closets, RPCs, edge functions, RLS, storage paths). `CLAUDE.md` records the current status. The migrations in `supabase/migrations/` are the source of truth for the schema.

## Gaps found in the 2026-10-02 review: where they stand
- Household create/invite/join: **resolved** (invite code, `create_household` / `join_household` / leave, D18).
- `users` conflating auth user and profile: **resolved** (`users` is the profile, created by a trigger at sign-up, repaired by `ensure_profile()`).
- When `last_worn_date` changes: **resolved** (accepting a suggestion, D3).
- Vision-tagging failures, low confidence and user correction: **resolved** (`needs_review`, review screen, manual entry on a 429).
- Weather location source: **resolved** (per-user location, D5).
- Test strategy and CI: **resolved** (Vitest, 80% gate, GitHub Actions). Photo retention after account deletion: still open.
- `.env.example`, `AGENTS.md`, `usedPrompts.md`: `.env.example` is filled in; `AGENTS.md` stays empty by design; `usedPrompts.md` still needs each teammate's AI audit entries.

## Status vs. course schedule (updated 2026-10-08)
- `main` has PRs #1 to #8 merged, each approved by the other teammate before merging (#1's approval was recorded afterwards). The graded Milestone 2 PR (auth + household, D17) is merged. Real due dates and the Milestone 1 submission status are still unconfirmed; check Peerceptiv/Canvas.
- What is built and what comes next: see the Roadmap in [[Work Plan]].

## Open questions
_(answered ones move to the Decisions table)_
- [ ] Real milestone dates / M1 submission status (confirm on Peerceptiv/Canvas)
- [x] Thanh's agreement to D13/D14 (yes, 2026-10-02). Tech-lead rotation after the first milestone: still undecided
- [x] Vision provider, tag schema, prompt, low-quality photos: Gemini with a model fallback chain; schema in `_shared/tag-schema.ts`; results in [[AI Logic Ownership]]
- [ ] One-piece garments (dresses/jumpsuits) and outerwear: can they substitute top+bottom? Is the outer layer deferred to the layering stretch goal?
- [x] A slot with no clean item: `generate-outfit` returns a "not enough clean clothes" status and the app shows an empty state
- [x] Scoring formula and quiz mapping: implemented and logged in [[AI Logic Ownership]]
- [x] Household mechanics: invite code, create/join/leave RPCs, profiles always have their own login (D18)
- [x] "Accepting" a suggestion: a button calling `accept_suggestion`, separate from thumbs up/down
- [ ] Photo handling: max size, compression, retention after account deletion
- [ ] Demo plan and success criteria for the final presentation (what a grader sees working)
