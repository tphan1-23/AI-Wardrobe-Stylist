# Architecture

## Overview

AI Wardrobe Stylist is an Expo (React Native) app branded DressWell, tested on iPhone via Expo Go (decision D16), talking directly to Supabase (Postgres + Auth + Storage) for
data and auth, plus three Supabase Edge Functions that do the AI-specific work: tagging a garment
photo, scoring a daily outfit, and updating a user's preference vector from feedback. There is no
separate custom backend server — Supabase is the backend.

```
┌────────────┐      ┌───────────────────────────────────────────┐
│ Expo (RN)  │──────▶│                  Supabase                  │
│ app on     │      │  ┌───────────┐ ┌────────┐ ┌──────────────┐ │
│ iPhone     │◀──────│  │ Postgres  │ │  Auth  │ │ File Storage │ │
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

## Frontend (`frontend/`, Expo app; code in `frontend/src/`)

| Folder | Responsibility |
|---|---|
| `components/upload/` | Photo capture/upload UI, calls `analyze-garment` |
| `components/closet/` | Closet inventory view, clean/dirty toggle |
| `components/onboarding/` | Cold-start quiz, seeds `preference_vector` |
| `components/outfit/` | Daily suggestion display, thumbs up/down feedback |
| `components/common/` | Shared UI primitives |
| `services/` | `supabase.ts` (client, AsyncStorage session), `auth.ts` (pure sign-up/log-in/log-out logic, unit-tested), weather client, calls to edge functions |
| `hooks/` | Data-fetching/state hooks wrapping `services/` (`useSession` tracks the auth session) |
| `pages/` | Screens composing the above (`AuthScreen` sign-up/log-in, `HomeScreen` placeholder) |

The frontend talks to Postgres directly through the Supabase client SDK (auto-generated REST/RPC
via PostgREST) for plain CRUD, and calls the three edge functions below for anything that needs
server-side AI logic or secrets that can't live in the browser.

## Backend (`supabase/`)

### Edge Functions (`supabase/functions/`)

Each function is a thin Deno wrapper (`index.ts`, shared `_deno/serve.ts`) over unit-tested pure code in
`supabase/functions/_shared/`. Exact requests, responses and error codes: `docs/api_endpoints.md`.

- **`analyze-garment`** — takes the storage path of an uploaded photo (must be in the caller's own folder), calls the
  vision model through a fallback chain of Gemini models, validates and normalizes the answer against the fixed tag
  vocabulary, and **returns proposed tags** (`type`, `color`, `season`, `warmth`) with `needs_review`. It saves nothing:
  the app saves the garment after the user confirms on the review screen. The model key stays server-side.
- **`generate-outfit`** — for the signed-in user, loads **their own** clean garments, today's weather for their
  location (OpenWeatherMap) and their preference weights, scores top + bottom + shoes combinations, and saves the
  winner to `suggestions`. A household is not needed. Supports re-roll by excluding rejected suggestions.
- **`update-preferences`** — takes a thumbs up or down on a suggestion, records it once, and updates the `type:` and
  `color:` weights of the garments in that suggestion.

### Data (`supabase/migrations/`)

`0001` base schema, `0002` personal closets (D18), `0003` profile names from Google/Apple (D19). Migrations are the
source of truth for the schema; keep this document and `_shared/types.ts` in sync with them.

## High-level data model

```
households        (id, name, invite_code)                         -- optional, only shares closets
users             (id = auth user, household_id?, name, location, quiz_preferences)
garments          (owner_id, image_path, type, color, season, warmth, status: clean/dirty, last_worn_date)
preference_vector (user_id, tag, weight)   -- seeded by the quiz, updated by feedback
suggestions       (user_id, date, garment_ids, feedback: up/down/null, accepted)
```

**Personal closets (D18):** every account owns its garments (`owner_id`). A household is optional and only lets members
*view* each other's closets and photos; only the owner can change or delete a garment. Joining or leaving never moves
clothes. Daily suggestions use the user's own closet only. Preferences, location and suggestions are per user.

## Core flows

1. **Onboarding:** the user signs up (email + password, or Google/Apple; a database trigger creates the `users`
   profile row) and sets a location. Creating or joining a household is optional and done later from the home screen.
   The cold-start quiz (not built yet) seeds `preference_vector` with `quizToPreferences`.
2. **Adding a garment:** the user uploads a photo to the private bucket under `<their user id>/` → `analyze-garment`
   proposes tags → the user reviews and confirms on the review screen → the app inserts the `garments` row. If the
   AI is at its limit (429) or down (502), the user types the tags.
3. **Daily suggestion:** the app calls `generate-outfit` → the function reads the user's clean garments, weather and
   preference weights → returns an outfit (or `incomplete` / `exhausted`) and saves it to `suggestions`.
   Accepting it calls the `accept_suggestion` RPC, which marks the items worn today.
4. **Feedback loop:** thumbs up/down → `update-preferences` adjusts the weights once per suggestion; a thumbs down
   immediately re-rolls with the rejected suggestion excluded.

## External services

- **Supabase** — Postgres, Auth, Storage, Edge Functions (free tier).
- **Gemini API** — garment tagging. Runs on a billing-enabled Google Cloud project covered by trial credits (D20);
  the free tier's 20 requests per day per model was too small. Keep a budget alert on it.
- **OpenWeatherMap** — free tier, current weather by ZIP or city for outfit scoring.

## Status of the original open questions

- Vision-model provider, tag schema and prompt: decided and measured (`brain/AI Logic Ownership.md`).
- Household flow: decided (D18) and implemented (create, join, leave, members list).
- Still open: color coordination and layering (stretch goals), outfit history, hosting a web demo build, and a real
  email domain so auth emails stop landing in spam (Milestone 3 checklist in `brain/Work Plan.md`).
