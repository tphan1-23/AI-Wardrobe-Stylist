# API Endpoints

There's no standalone REST server — the frontend talks to Supabase directly. Two access paths:

1. **Direct table access** via the Supabase client SDK (auto-generated PostgREST REST/RPC), guarded
   by Row Level Security (RLS) so a user only ever sees rows for their own `household_id`/`user_id`.
2. **Edge Functions** (`supabase/functions/`) for anything needing server-side secrets or AI logic.
   Called as `POST https://<project>.supabase.co/functions/v1/<function-name>`.

Auth itself (sign up / log in / session) goes through Supabase Auth via the client SDK — no custom
endpoint needed.

## Edge Functions

### `POST /functions/v1/analyze-garment`

Tags an uploaded garment photo.

**Request**
```json
{ "garment_id": "uuid", "image_url": "storage path or public URL" }
```

**Response**
```json
{
  "garment_id": "uuid",
  "type": "string",
  "color": "string",
  "season": "string",
  "warmth": "number"
}
```
Writes the returned tags onto the `garments` row.

### `POST /functions/v1/generate-outfit`

Returns today's outfit suggestion for a user.

**Request**
```json
{ "user_id": "uuid", "date": "YYYY-MM-DD" }
```

**Response**
```json
{
  "suggestion_id": "uuid",
  "garment_ids": ["uuid", "uuid"],
  "reasoning": "optional, human-readable why these items were picked"
}
```
Reads clean garments for `user_id`, current weather (OpenWeatherMap) for the household's location,
and `preference_vector`; avoids repeats via `last_worn_date`. Inserts a row into `suggestions`.

### `POST /functions/v1/update-preferences`

Applies feedback from a suggestion to the user's preference vector.

**Request**
```json
{ "suggestion_id": "uuid", "feedback": "up" }
```

**Response**
```json
{ "suggestion_id": "uuid", "updated_tags": ["tag1", "tag2"] }
```
Updates `suggestions.feedback` and adjusts `preference_vector.weight` for the tags on the involved
garments.

## Direct table access (via Supabase client SDK)

| Table | Typical operations | Notes |
|---|---|---|
| `users` | read own row, update `quiz_preferences` | scoped by `household_id` via RLS |
| `garments` | list/insert/update (status clean/dirty), delete | insert happens before calling `analyze-garment` |
| `preference_vector` | read (rarely written directly) | writes normally go through `update-preferences` |
| `suggestions` | list (history) | writes normally go through `generate-outfit` / `update-preferences` |

## Not yet decided

- Exact request/response shapes above are a first draft from the proposal's data model — confirm
  against `supabase/migrations/` once schema is written, and update both together.
- Household invite/join flow (multi-user profiles) doesn't have an endpoint yet — likely a `households`
  table + invite-code flow, TBD before Milestone 2.
