# API Endpoints

There is no standalone REST server. The Expo app talks to Supabase directly, in three ways:

1. **Supabase Auth** (sign up, log in, password reset, Google/Apple) through `supabase.auth` in the client SDK.
2. **Tables, RPCs and Storage** through the client SDK, guarded by Row Level Security (RLS). Every query runs as the signed-in user.
3. **Edge Functions** for anything that needs a server-side secret or the AI logic. Called with
   `supabase.functions.invoke("<name>", { body })`, which sends the user's session token.

Source of truth: the schema is `supabase/migrations/` (`0001` to `0003`), the shared types are
`supabase/functions/_shared/types.ts`, and the tag vocabulary is `supabase/functions/_shared/tag-schema.ts`.
This file describes what is **deployed**.

## Edge Functions

`POST {SUPABASE_URL}/functions/v1/<name>` with `Authorization: Bearer <user session token>` and a JSON body.

Errors common to all three: `401` no login or an expired session (a bad token, or the public anon key, is rejected),
`405` not a POST, `400` body is not JSON, `500` unexpected failure (details are logged server-side, never returned).
Error bodies are `{ "error": "message" }`.

### `analyze-garment`

Proposes tags for a photo. It **does not save anything**: the app shows the tags on the review screen
and inserts the `garments` row after the user confirms.

**Request** `{ "image_path": "<your user id>/<file>.jpg" }` (the photo must already be uploaded to the `garments` bucket;
allowed extensions: jpg, jpeg, png, webp, heic, heif).

**Response 200**
```json
{
  "tags": { "type": "jeans", "color": "blue", "season": "all", "warmth": 3 },
  "confidence": { "type": 0.95, "color": 0.9, "season": 0.8, "warmth": 0.8 },
  "needs_review": ["season"],
  "warnings": []
}
```
`tags` may be missing fields; any field that is missing or low-confidence (< 0.6) is listed in `needs_review`,
and the review screen must make the user fill or confirm it. Even with no flags the user confirms the tags: the
model's confidence has never separated right answers from wrong ones (see `brain/AI Logic Ownership.md`).

| Status | Meaning | What the app should do |
|---|---|---|
| 403 | `image_path` is not in the caller's own folder | bug in the app |
| 404 | the photo does not exist or cannot be read | re-upload |
| 400 | unsupported or too large (about 5 MB) | tell the user |
| 429 | the AI limit was reached | let the user type the tags |
| 502 | the AI service is unavailable | let the user type the tags |

The vision model is called through a fallback chain of Gemini models (`_shared/gemini.ts`), so one overloaded or retired
model does not fail the request. The Gemini key is a function secret and never reaches the app.

### `generate-outfit`

Builds today's outfit (top + bottom + shoes) from **the caller's own closet** (D18). A household is not needed.
It uses the caller's saved location for the weather, their temperature comfort from the quiz, their preference
weights, and avoids recently worn items.

**Request** `{ "date": "YYYY-MM-DD", "exclude_suggestion_ids": ["uuid"] }` (the second field is optional; send the
rejected suggestion ids to re-roll after a thumbs down; at most 50).

**Response 200**, one of three shapes, told apart by `status`:
```json
{ "status": "ok", "suggestion_id": "uuid", "outfit": { "top": "uuid", "bottom": "uuid", "shoes": "uuid" },
  "score": 0.62, "reasoning": "Feels like 33°C, aiming for warmth 1. Picked white t shirt, black trousers, white sneakers." }
{ "status": "incomplete", "missing_slots": ["shoes"], "reasoning": "No clean shoes available." }
{ "status": "exhausted", "reasoning": "Every available combination was already rejected." }
```
Only `ok` creates a `suggestions` row. Dirty items and items in the `other` slot (jackets, coats, dresses) are never used.

| Status | Meaning |
|---|---|
| 400 | `date` is not a real YYYY-MM-DD date, or the exclusion list is malformed |
| 404 | the profile row does not exist (repair: see `brain/Work Plan.md`) |
| 409 | the user has not set a location yet |
| 502 | the weather service is unavailable |

### `update-preferences`

Learns from a thumbs up or down on a suggestion. Feedback is accepted **once per suggestion**.

**Request** `{ "suggestion_id": "uuid", "feedback": "up" | "down" }`
**Response 200** `{ "suggestion_id": "uuid", "updated_tags": ["type:jeans", "color:blue"] }`

| Status | Meaning |
|---|---|
| 400 | missing `suggestion_id`, or feedback is not `up`/`down` |
| 404 | the suggestion does not exist or belongs to someone else |
| 409 | feedback was already recorded for this suggestion |

Only `type:` and `color:` tags of garments the caller owns are updated. A thumbs down teaches faster than a thumbs up.

## RPCs (SQL functions, called with `supabase.rpc`)

| Function | Does | Errors |
|---|---|---|
| `create_household(p_name)` | creates a household and puts the caller in it; returns its id | `already in a household` |
| `join_household(p_code)` | joins by the 8-character invite code; returns the household id | `invalid invite code`, `already in a household` |
| `leave_household()` | leaves; the last member leaving deletes the household; the caller's garments stay theirs | `not in a household` |
| `ensure_profile()` | creates the caller's own missing `users` row (name from sign-up or Google metadata); never touches an existing row. The app calls it once when it cannot find the profile after signing in (migration `0004`) | none |
| `accept_suggestion(p_suggestion_id)` | marks the suggestion accepted and sets `last_worn_date` to today on the caller's garments in it | `suggestion not found` |

## Direct table and storage access (RLS, D18)

| Table | Who can do what |
|---|---|
| `users` | read yourself and your household members; update only `name`, `location`, `quiz_preferences` (changing `household_id` is only possible through the RPCs) |
| `households` | members can read their household (name and invite code); created and changed only through the RPCs |
| `garments` | read your own and your household members'; **insert, update and delete only your own** (`owner_id` must be you and cannot be changed) |
| `preference_vector` | read and write your own rows. The quiz seeds it from the app with `quizToPreferences`; feedback updates it through the function |
| `suggestions` | read and write your own rows; created by `generate-outfit`, feedback only through `update-preferences` |

**Storage**, private bucket `garments`, files at `<owner user id>/<file>`: the owner can upload and delete; the owner and
household members can read. Uploading into another user's folder is refused.

## Verification

`scripts/e2e.ts` exercises all of the above against the real project with a real account: sign-in, profile and location,
three security-rule rejections, photo upload, tagging, saving, outfit generation, once-only feedback, re-roll, accepting,
and cleanup. Last full pass: 39 of 39 (2026-10-08). Two-person household sharing and the Google/Apple/reset flows are not
covered by it.
