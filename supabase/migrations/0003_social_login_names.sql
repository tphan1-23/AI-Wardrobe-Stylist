-- Names for accounts created with Google or Apple.
-- Email sign-up stores the name as user metadata "name", which the trigger in
-- 0001 copies to the profile. Google also sends "full_name", and Apple sends
-- the name only once, after the account exists, so the app saves it with
-- updateUser. This migration makes both land in the profile row.
-- Independent of 0002; safe to run in either order.

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, name) values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      ''
    )
  );
  return new;
end $$;

-- Fills in a still-empty profile name when the metadata gains one later.
-- It never overwrites a name that is already set.
create function sync_user_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update users
    set name = new.raw_user_meta_data ->> 'name'
    where id = new.id
      and name = ''
      and coalesce(new.raw_user_meta_data ->> 'name', '') <> '';
  return new;
end $$;

create trigger on_auth_user_updated after update of raw_user_meta_data on auth.users
  for each row execute function sync_user_name();
