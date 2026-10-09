---
class: SWE-AI
course: CSCI 4397 / 6397
start_date: 2026-09-13
status: in-progress
tags: [project, capstone, swe-ai]
---

# AI Wardrobe Stylist — Capstone Project

← [[02 Software Engineering with AI/SWE-AI Home|Class Home]]

This is the **Team Capstone Project (40% of grade)** for CSCI 4397/6397 — Software Engineering with AI.

## Team
- Manuel Edwardo De La Rosa Modesto
- Thanh Phan

## Links
- Proposal: [[SWE with AI Final Project Proposals - Thanh Phan & Manuel Edwardo De La Rosa Modesto.pdf]]
- GitHub: https://github.com/tphan1-23/AI-Wardrobe-Stylist
- Shared agent context file: `CLAUDE.md` in the repo root (course deliverable — "shared context file", Week 3)

## Problem
People wear a small fraction of what they own because tracking what's clean, what matches, and what hasn't been worn lately is hard to do from memory — leading to wasted time each morning and underused clothes.

## Proposed Solution
A mobile app (DressWell, Expo on iPhone) that digitizes a user's closet via photo upload, uses AI vision tagging to auto-classify each garment, and generates a daily outfit suggestion based on weather, laundry status, and personal style. A cold-start onboarding quiz seeds the recommendation engine; the system improves via thumbs up/down feedback on suggestions.

## MVP Scope
- [ ] Photo upload with AI auto-tagging (type, color, season) — core premise, no manual entry. **Backend done and verified (95% type accuracy); Add screen is next**
- [ ] Closet inventory view (screen next)
- [ ] Mark item clean / in laundry (screen next)
- [x] Personal closets with optional households (D18), done and verified on a phone
- [ ] Daily outfit suggestion (weather + clean + repeat avoidance) — core value prop. **Backend done and verified; Today screen is last in the order**
- [ ] Cold-start quiz on first use (mapping done; screen next)
- [ ] Thumbs up / down feedback on suggestions (learning logic done; buttons come with the Today screen)

### Stretch (after MVP is solid)
- Color coordination / pairing rules
- Layering logic for cold weather
- Outfit history log
- Style drift over time

## Tech / Tools (all free tier)
- **Frontend:** Expo (React Native), tested on iPhone via Expo Go (D16)
- **Backend/DB:** Supabase (Postgres + auth + file storage)
- **Vision tagging:** Gemini (billing-enabled project covered by trial credits, D20; key server-side only)
- **Weather:** OpenWeatherMap free tier
- **Recommendation logic:** rule-based scoring blended with a quiz + feedback-driven preference vector

## Data Model (target)
- `users` (household_id, name, quiz_preferences)
- `garments` (user_id, image_url, type, color, season, warmth, status: clean/dirty, last_worn_date)
- `preference_vector` (user_id, tag, weight)
- `suggestions` (user_id, date, garment_ids, feedback: up/down/null)

## Milestone Mapping ([[02 Software Engineering with AI/Schedule|course schedule]])
| Course Milestone | Week | Target for this project |
|---|---|---|
| M1 — architecture & skeleton (PR) | Week 4 (Sept 14–18) | Real frontend/backend scaffold + first vertical slice (auth + photo upload) |
| M2 — core feature + test suite (>80% coverage) | Week 6 (Sept 28–Oct 2) | Graded feature chosen as auth + household (D17); merged as PR #1 with tests and coverage analysis |
| M3 — deployed app w/ CI/CD + AI-assisted docs | Week 12 (Nov 9–13) | Full MVP deployed, docs generated/reviewed |

## Related notes
- [[AI Wardrobe - Requirements & Decisions|Requirements & Decisions]] — requirements Q&A, decisions D1–D20, gaps, open questions
- [[AI Logic Ownership]] — AI/ML plan, evaluation approach, tuning log
- [[Work Plan]] — branch map, roadmap (done, Thanh's screens in order, our next steps), runbooks, incident notes
- [[Design Notes]] — DressWell design system and screen status

## Current Status (as of 2026-10-08, GitHub `main`, PRs #1 to #8 merged)
**Built and verified:** Supabase project (migrations 0001 to 0004, RLS, private photo bucket); email sign-up and log-in, password reset by code, Google sign-in (tunnel only); location; personal closets with optional households; self-healing profile; the AI core (`analyze-garment`, `generate-outfit`, `update-preferences`) deployed and verified end to end by `scripts/e2e.ts` (39 of 39 checks). 282 automated tests, 100% coverage of lines and functions. **Next:** Thanh builds the Add, Closet, Quiz and Today screens (order in [[Work Plan]]); we review, verify household sharing with a second account, repair the Supabase migration history, and tune the AI. **Open risks:** real due dates unconfirmed; Gemini key rotation and a budget alert pending; email lands in spam until Milestone 3; Apple sign-in not usable without the paid developer program.

## Decisions so far (full detail in Requirements & Decisions)
- D1 (replaced by D18) shared household closet
- D2 MVP outfit = top + bottom + shoes (all required)
- D3 Accepting a suggestion marks items worn; user manually marks dirty/clean
- D4 Review & edit screen for AI tags before saving
- D5 Per-user weather location · D6 Phone-first (now an Expo app, D16) · D7 Vertical slices per person
- D8 Quiz: style vibes, temperature comfort, occasion mix, colors · D9 Whole-outfit feedback + re-roll
- D10 Email/password auth, private bucket, delete on request · D11 Vitest/RTL + Deno tests, GitHub Actions, Vercel
- D16 Expo app on iPhone · D17 graded M2 PR = auth + household · D18 personal closets, optional households (replaces D1) · D19 password reset by code, Google/Apple sign-in · D20 Gemini on a billing-enabled project
- D12 Manuel = tech lead · D13 Manuel + Claude own all AI logic (tagging, scoring, preference learning, tuning, evaluation, tests) · D14 Thanh owns product/plumbing (schema+RLS, auth, UI, weather client, CI/CD) · D15 shared notes live in repo `brain/`

## Log
- 2026-09-13 — Initial commit (README) — Thanh Phan
- 2026-09-19 — Skeleton scaffold committed (frontend/, supabase/functions, docs placeholders) — Thanh Phan
- 2026-09-20 — Repo cloned to local machine; `CLAUDE.md` populated and pushed; this vault project note created
- 2026-09-19/20 — Thanh filled `docs/architecture.md` and `docs/api_endpoints.md` from the proposal (commit `89e117d`)
- 2026-10-02 — Vault synced with repo; requirements-gathering started; decisions D1–D3 recorded
- 2026-10-03 to 2026-10-08 — Expo app, auth, households (PR #1); personal closets (PR #2); password reset and Google sign-in (PR #3); AI core and edge functions deployed (PR #4)
- 2026-10-08 — profile-repair incident and fix (PR #5), sign-up confirmation by code tried (PR #6) and reverted (PR #8), household test script (PR #7); roadmap added to the Work Plan
