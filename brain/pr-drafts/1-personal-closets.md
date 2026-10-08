**Title:** Personal closets and optional households (D18), stronger sign-up passwords

**Base:** `main` · **Branch:** `feat/personal-closets` · **Author:** Thanh · **Reviewer:** Manuel

## What this changes

**Personal closets (D18, replaces the shared-closet model of D1).** Every account owns its own garments (`owner_id`).
A household is now optional and only lets members *view* each other's closets and photos. Only the owner can change or
delete a garment. Joining or leaving a household never moves clothes. The last member to leave deletes the household.
Daily suggestions use the user's own closet only.

- `supabase/migrations/0002_personal_closets.sql`: owner-based garment and photo policies, the `leave_household` function,
  and `create_household` / `join_household` refusing when you are already in a household.
- `Garment.household_id` and `added_by` become `owner_id`; `UserProfile.household_id` becomes optional.
- App: onboarding no longer requires a household; the home screen offers create/join, lists members, and has a
  confirmed Leave button.

**Stronger passwords for new accounts.** 8 to 72 characters with an uppercase letter, a lowercase letter, a number and a
symbol. Log-in keeps the basic 8-character check so older accounts can still sign in. The rules are also set in the
Supabase dashboard so they are enforced server-side.

## How it was checked

- Typecheck clean and **86 tests pass, 100% coverage** on the feature files (checked by the reviewer from a clean install).
- The migration was run together with `0001` on in-memory Postgres with stand-ins for Supabase auth and storage:
  24 checks on sharing, permissions and leaving passed.
- Security review of `0002` (reviewer): the update policy keeps `owner_id` fixed (no ownership transfer); only the owner
  can insert, update or delete garments and photos; reads go through one function (`visible_closet_owner_ids`: yourself
  plus household members) used by both the table and the photo rules; `create`/`join` refuse when already in a household;
  every security-definer function sets a fixed `search_path`.
- `0002` has been applied by hand on the real Supabase project, and the deployed AI functions plus the end-to-end script
  have since run against it with a real account (39 of 39 checks).

## Not covered

- Sharing between **two real household members** has not been run on the real project (needs a second account).
- The React Native screens are not unit-tested (they need a device); their logic lives in the covered services.

## For the reviewer

Please open **Files changed**, then **Review changes**, then **Approve** (or request changes) **before** anyone merges.
The approver must be someone other than the person who opened the PR.
