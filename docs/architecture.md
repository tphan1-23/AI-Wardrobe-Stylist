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
│ OpenWeather │                  │ Gemini vision model│
│  Map (free) │                  │ (billing, D20)     │
└────────────┘                  └──────────────────┘
```

## Frontend (`frontend/`, Expo app; code in `frontend/src/`)

| Folder | Responsibility |
|---|---|
| `pages/` | Screens: `AuthScreen`, `ForgotPasswordScreen`, `LocationScreen`, `QuizScreen` (onboarding); `MainTabs` with `TodayScreen`, `ClosetScreen` (+ `GarmentEditScreen`), `AddScreen` (+ `CropScreen`), `HistoryScreen`, `HomeScreen`/`HouseholdScreen`; `StyleSwipeScreen` |
| `components/` | `common/` (buttons, fields, tab bar, icons, cached images), `closet/` (tiles, tag form), `outfit/` (outfit cards) |
| `services/` | All logic that can be tested without a phone. Each feature is a pure module with an **injected gateway** plus a thin Supabase adapter: `auth.ts`, `household.ts` + `householdGateway.ts`, `quiz.ts`, `add.ts` + `addGateway.ts`, `closet.ts` + `closetGateway.ts`, `today.ts` + `todayGateway.ts`, `history.ts` + `historyGateway.ts`, `styleSwipe.ts`, `crop.ts`, `cropSuggestion.ts`, `storage.ts` (signed photo links), `edgeFunctions.ts` (calling the three functions), `supabase.ts` (the client) |
| `hooks/` | Data-fetching hooks wrapping `services/` (`useSession`, `useOverview`) |

**Why this split:** screens only show state and call a service function; the rules (validation, what is allowed, error
messages) live in the services, where unit tests cover them with a fake gateway. That is how the app reaches 100%
coverage on its logic without running React Native in tests. The screens themselves are checked by hand on a device.

The app reads and writes Postgres directly through the Supabase client (row-level security decides what each user may
touch) and calls the three edge functions for anything that needs server-side AI logic or secrets.

## Backend (`supabase/`)

### Edge Functions (`supabase/functions/`)

Each function is a thin Deno wrapper (`index.ts`, shared `_deno/serve.ts`) over unit-tested pure code in
`supabase/functions/_shared/`. Exact requests, responses and error codes: `docs/api_endpoints.md`.

- **`analyze-garment`** — takes the storage path of an uploaded photo (must be in the caller's own folder), calls the
  vision model through a fallback chain of Gemini models, validates and normalizes the answer against the fixed tag
  vocabulary, and **returns proposed tags** (`type`, `color`, `season`, `warmth`) with `needs_review`, plus an optional
  padded **crop box** for where the garment is. It saves nothing: the app saves the garment after the user confirms on
  the review screen. The model key stays server-side.
- **`generate-outfit`** — for the signed-in user, loads **their own** clean garments, today's weather for their
  location (OpenWeatherMap) and their preference weights, scores top + bottom + shoes combinations, and saves the
  winner to `suggestions`, and returns the weather it used. A household is not needed. Supports re-roll by excluding
  rejected suggestions. With `purpose: "explore"` it produces Style Swipe ideas: stored with `kind = 'explore'` so they
  never replace today's outfit, and allowed to use clothes in the laundry because they only train the AI.
- **`update-preferences`** — takes a thumbs up or down on a suggestion, records it once, and updates the `type:` and
  `color:` weights of the garments in that suggestion.

### Data (`supabase/migrations/`)

`0001` base schema, `0002` personal closets (D18), `0003` profile names from Google/Apple (D19), `0004` `ensure_profile()`,
`0005` favorites, `0006` `suggestions.kind` for Style Swipe, `0007` wearing an outfit marks it dirty except shoes (D21),
`0008` signed-out callers cannot run our functions. Migrations are the source of truth for the schema; keep this document
and `_shared/types.ts` in sync with them. Applying them is described in [deployment.md](deployment.md).

### Security model

- **Row-level security on every table.** A user reads their own rows (and, in a household, members' garments and photos)
  and writes only their own. `owner_id` cannot be changed, so clothes cannot be moved to another user.
- **Private storage bucket**, files at `<owner user id>/<file>`; only the owner uploads or deletes; the owner and
  household members read.
- **Database functions (RPCs) are `security definer` with a fixed `search_path`, and only signed-in users can execute them**
  (migration 0008; before it, the public key could run them).
- **Secrets stay server-side:** the Gemini and weather keys are function secrets; the app ships only the public anon key.
- The functions read the user from the login token, never from the request body.

## High-level data model

```
households        (id, name, invite_code)                         -- optional, only shares closets
users             (id = auth user, household_id?, name, location, quiz_preferences)
garments          (owner_id, image_path, type, color, season, warmth, status: clean/dirty, last_worn_date, favorite)
preference_vector (user_id, tag, weight)   -- seeded by the quiz, updated by feedback
suggestions       (user_id, date, garment_ids, feedback: up/down/null, accepted, kind: today/explore, favorite)
```

**Personal closets (D18):** every account owns its garments (`owner_id`). A household is optional and only lets members
*view* each other's closets and photos; only the owner can change or delete a garment. Joining or leaving never moves
clothes. Daily suggestions use the user's own closet only. Preferences, location and suggestions are per user.

## Core flows

1. **Onboarding:** the user signs up (email + password, or Google; a database trigger creates the `users` profile row)
   and sets a location, then answers the five-question style quiz, which seeds `preference_vector` with
   `quizToPreferences` and is shown once. Creating or joining a household is optional and done later from the
   Household tab.
2. **Adding a garment:** pick or take a photo, crop it (the AI's suggested box is pre-selected when it found one),
   upload it to the private bucket under `<their user id>/`, and `analyze-garment` proposes tags. The user checks every
   flagged field on the review screen and the app inserts the `garments` row. If the AI is at its limit (429) or down
   (502), the user types the tags; a photo the server rejects is removed from storage.
3. **Daily suggestion:** the app calls `generate-outfit`, which reads the user's clean garments, weather and
   preference weights, returns an outfit (or `incomplete` / `exhausted`) with the weather, and saves it to
   `suggestions`. **Wear this** calls the `accept_suggestion` RPC, which marks the items worn today and sends everything
   except the shoes to the laundry, so **New outfit** for the same day cannot reuse them.
4. **Feedback loop:** thumbs up/down goes to `update-preferences`, which adjusts the weights once per suggestion; a
   thumbs down immediately re-rolls with the rejected suggestion excluded.
5. **Style Swipe:** the deck asks `generate-outfit` with `purpose: "explore"`, skipping ideas already judged; each swipe
   is a thumbs up/down through `update-preferences`. Ideas are stored with `kind = 'explore'`, so Today and History
   (which read only `kind = 'today'`) never show them as the day's outfit.
6. **Closet, History, Favorites:** the closet lists the user's garments (and household members', read-only) with
   category, status, owner and favorite filters; History lists accepted outfits of the last 7 days and favorites.

## External services

- **Supabase** — Postgres, Auth, Storage, Edge Functions (free tier).
- **Gemini API** — garment tagging. Runs on a billing-enabled Google Cloud project covered by trial credits (D20);
  the free tier's 20 requests per day per model was too small. Keep a budget alert on it.
- **OpenWeatherMap** — free tier, current weather by ZIP or city for outfit scoring.

## Status of the original open questions

- Vision-model provider, tag schema and prompt: decided and measured (`brain/AI Logic Ownership.md`).
- Household flow: decided (D18) and implemented (create, join, leave, members list), verified with two accounts.
- Outfit history, favorites, the quiz, the closet and Style Swipe: built.
- Still open: color coordination and layering (stretch goals), hosting beyond Expo Go (D22), and a real email domain so
  auth emails stop landing in spam (Milestone 3 list in `brain/Work Plan.md`).
