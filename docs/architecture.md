# Architecture

## Overview

AI Wardrobe Stylist is a React frontend talking directly to Supabase (Postgres + Auth + Storage) for
data and auth, plus three Supabase Edge Functions that do the AI-specific work: tagging a garment
photo, scoring a daily outfit, and updating a user's preference vector from feedback. There is no
separate custom backend server — Supabase is the backend.

```
┌────────────┐      ┌───────────────────────────────────────────┐
│  React SPA │──────▶│                  Supabase                  │
│ (Vercel/   │      │  ┌───────────┐ ┌────────┐ ┌──────────────┐ │
│  Netlify)  │◀──────│  │ Postgres  │ │  Auth  │ │ File Storage │ │
└────────────┘      │  └───────────┘ └────────┘ └──────────────┘ │
      │              │  ┌─────────────────────────────────────┐  │
      │              │  │           Edge Functions             │  │
      │              │  │  analyze-garment  generate-outfit    │  │
      │              │  │         update-preferences           │  │
      │              │  └─────────────────────────────────────┘  │
      │              └───────────────────┬─────────────────────┘
      │                                  │
      ▼                                  ▼
┌────────────┐                  ┌──────────────────┐
│ OpenWeather │                  │ Vision model (e.g. │
│  Map (free) │                  │  Gemini, free tier)│
└────────────┘                  └──────────────────┘
```

## Frontend (`frontend/src/`)

| Folder | Responsibility |
|---|---|
| `components/upload/` | Photo capture/upload UI, calls `analyze-garment` |
| `components/closet/` | Closet inventory view, clean/dirty toggle |
| `components/onboarding/` | Cold-start quiz, seeds `preference_vector` |
| `components/outfit/` | Daily suggestion display, thumbs up/down feedback |
| `components/common/` | Shared UI primitives |
| `services/` | Supabase client, weather client, calls to edge functions |
| `hooks/` | Data-fetching/state hooks wrapping `services/` |
| `pages/` | Route-level screens composing the above |

The frontend talks to Postgres directly through the Supabase client SDK (auto-generated REST/RPC
via PostgREST) for plain CRUD, and calls the three edge functions below for anything that needs
server-side AI logic or secrets that can't live in the browser.

## Backend (`supabase/`)

### Edge Functions (`supabase/functions/`)

- **`analyze-garment`** — receives an uploaded photo (or its storage path), calls the vision model,
  returns/stores structured tags (`type`, `color`, `season`, `warmth`) on the `garments` row. Keeps
  the vision-model API key server-side.
- **`generate-outfit`** — given a user (and household), pulls clean garments, the day's weather
  (OpenWeatherMap), and the user's `preference_vector`, and returns a scored outfit suggestion for
  `suggestions`. Repeat-avoidance uses `last_worn_date`.
- **`update-preferences`** — receives a thumbs up/down on a suggestion, updates the relevant
  `preference_vector` weights and the suggestion's `feedback` field.

### Data (`supabase/migrations/`)

See `docs/api_endpoints.md` and the data model below — migrations are the source of truth for
schema; keep them in sync with any model changes.

## High-level data model

```
users             (household_id, name, quiz_preferences)
garments          (user_id, image_url, type, color, season, warmth, status: clean/dirty, last_worn_date)
preference_vector (user_id, tag, weight)   -- seeded by quiz, updated by feedback
suggestions       (user_id, date, garment_ids, feedback: up/down/null)
```

`household_id` links multiple `users` rows together for the multi-user-profiles-under-one-household
requirement; garments and suggestions stay scoped to the individual `user_id` within that household.

## Core flows

1. **Onboarding:** user signs up (Supabase Auth) → completes cold-start quiz → quiz answers seed
   `preference_vector`.
2. **Adding a garment:** user uploads a photo → stored in Supabase Storage → `analyze-garment` tags
   it → new `garments` row.
3. **Daily suggestion:** frontend calls `generate-outfit` → function reads clean garments + weather
   + preference vector → returns a suggestion, persisted to `suggestions`.
4. **Feedback loop:** user taps thumbs up/down → `update-preferences` adjusts `preference_vector`
   weights for the tags involved, closing the personalization loop.

## External services (all free tier)

- **Supabase** — Postgres, Auth, Storage, Edge Functions
- **Vision tagging** — free-tier multimodal model (e.g. Gemini) for garment classification
- **OpenWeatherMap** — free tier, current weather by location for outfit scoring

## Open questions for Milestone 1 slice

- Which starting vertical slice ships first — likely **photo upload + auth + basic closet view**
  (per `CLAUDE.md`), deferring `generate-outfit`/`update-preferences` to Milestone 2.
- Exact vision-model provider and prompt/schema for tag extraction.
- Household creation/invite flow for multi-user profiles (not detailed in the proposal).
