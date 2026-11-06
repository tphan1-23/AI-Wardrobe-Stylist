-- Signed-out callers must not run any of our database functions.
--
-- Found on 2026-11-06 with Supabase's security advisor: Supabase grants EXECUTE on new
-- functions to the `anon` role (the public key that ships inside the app) by default, and the
-- earlier migrations only revoked it from PUBLIC for ensure_profile. The worst case was
-- create_household(): it inserts a household row before it checks who is calling, so anyone
-- holding the public key could create unlimited orphan households. join_household() also
-- told signed-out callers whether an invite code exists.
--
-- After this, only signed-in users (and the service role) can call these functions. The app
-- only calls them after signing in, and the trigger functions fire from the auth system, so
-- nothing the app does changes. No data is touched.
--
-- (set_updated_at() is not ours: it belongs to the five leftover template tables and goes away
-- when those are dropped.)
-- Safe to run more than once.

revoke all on function
  create_household(text),
  join_household(text),
  leave_household(),
  accept_suggestion(uuid),
  ensure_profile(),
  current_household_id(),
  visible_closet_owner_ids(),
  handle_new_user(),
  sync_user_name()
from public, anon;

grant execute on function
  create_household(text),
  join_household(text),
  leave_household(),
  accept_suggestion(uuid),
  ensure_profile(),
  current_household_id(),
  visible_closet_owner_ids(),
  handle_new_user(),
  sync_user_name()
to authenticated, service_role;
