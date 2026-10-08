-- Self-healing profile row.
-- The sign-up trigger (0001/0003) creates a row in public.users for every new account, but it cannot help when
-- the row is later removed (a test cleanup, a manual delete) or for an account that predates the trigger.
-- ensure_profile() lets a signed-in user recreate ONLY their own missing profile; it never touches an existing one.

create function ensure_profile() returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, name)
  select u.id,
         coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), nullif(u.raw_user_meta_data ->> 'full_name', ''), '')
  from auth.users u
  where u.id = auth.uid()
  on conflict (id) do nothing;
end $$;

-- Signed-in users only; anonymous callers have no auth.uid() and could not insert anything anyway.
revoke all on function ensure_profile() from public;
grant execute on function ensure_profile() to authenticated;
