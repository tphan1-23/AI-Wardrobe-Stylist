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
A web app that digitizes a user's closet via photo upload, uses AI vision tagging to auto-classify each garment, and generates a daily outfit suggestion based on weather, laundry status, and personal style. A cold-start onboarding quiz seeds the recommendation engine; the system improves via thumbs up/down feedback on suggestions.

## MVP Scope
- [ ] Photo upload with AI auto-tagging (type, color, season) — core premise, no manual entry
- [ ] Closet inventory view
- [ ] Mark item clean / in laundry
- [ ] Multi-user profiles under one household
- [ ] Daily outfit suggestion (weather + clean + repeat avoidance) — core value prop
- [ ] Cold-start quiz on first use
- [ ] Thumbs up / down feedback on suggestions

### Stretch (after MVP is solid)
- Color coordination / pairing rules
- Layering logic for cold weather
- Outfit history log
- Style drift over time

## Tech / Tools (all free tier)
- **Frontend:** React (Vercel/Netlify)
- **Backend/DB:** Supabase (Postgres + auth + file storage)
- **Vision tagging:** free-tier multimodal model (e.g. Gemini)
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
| M2 — core feature + test suite (>80% coverage) | Week 6 (Sept 28–Oct 2) | Closet inventory + laundry status + auto-tagging, tested |
| M3 — deployed app w/ CI/CD + AI-assisted docs | Week 12 (Nov 9–13) | Full MVP deployed, docs generated/reviewed |

## Related notes
- [[AI Wardrobe - Requirements & Decisions|Requirements & Decisions]] — requirements Q&A, decisions D1–D15, gaps, open questions
- [[AI Logic Ownership]] — AI/ML plan, evaluation approach, tuning log

## Current Status (as of 2026-10-02, GitHub `main` @ `89e117d`)
Repo has **docs but no application code**: `docs/architecture.md` (React SPA → Supabase Postgres/Auth/Storage + 3 edge functions, core flows, open questions) and `docs/api_endpoints.md` (edge function request/response drafts, direct table access via RLS) were filled in by Thanh on 2026-09-19/20. Still empty: `supabase/migrations/`, `.env.example`, `AGENTS.md`, `usedPrompts.md`; frontend/function dirs are `.gitkeep` only. No tests, no CI. **Schedule risk:** M1 (Week 4) and M2 (Week 6) dates have passed/arrive now — M1 submission status unconfirmed.

## Decisions so far (full detail in Requirements & Decisions)
- D1 Shared household closet, per-person profiles/preferences/suggestions
- D2 MVP outfit = top + bottom + shoes (all required)
- D3 Accepting a suggestion marks items worn; user manually marks dirty/clean
- D4 Review & edit screen for AI tags before saving
- D5 Per-user weather location · D6 Phone-first responsive web · D7 Vertical slices per person
- D8 Quiz: style vibes, temperature comfort, occasion mix, colors · D9 Whole-outfit feedback + re-roll
- D10 Email/password auth, private bucket, delete on request · D11 Vitest/RTL + Deno tests, GitHub Actions, Vercel
- D12 Manuel = tech lead · D13 Manuel + Claude own all AI logic (tagging, scoring, preference learning, tuning, evaluation, tests) · D14 Thanh owns product/plumbing (schema+RLS, auth, UI, weather client, CI/CD) · D15 shared notes live in repo `brain/`

## Log
- 2026-09-13 — Initial commit (README) — Thanh Phan
- 2026-09-19 — Skeleton scaffold committed (frontend/, supabase/functions, docs placeholders) — Thanh Phan
- 2026-09-20 — Repo cloned to local machine; `CLAUDE.md` populated and pushed; this vault project note created
- 2026-09-19/20 — Thanh filled `docs/architecture.md` and `docs/api_endpoints.md` from the proposal (commit `89e117d`)
- 2026-10-02 — Vault synced with repo; requirements-gathering started; decisions D1–D3 recorded
