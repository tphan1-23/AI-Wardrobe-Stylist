-- Length and value limits in the database itself (a reviewer's suggestion).
-- The app already checks these before it sends anything, but a person can call the database
-- directly with their own account (row-level security only decides whose rows they may touch,
-- not how big a value may be), so the limits are repeated here as the last line of defense.
--
-- The numbers match the app: household name 60 and location 100 (frontend/src/services/household.ts),
-- preference weights between -1 and 1 (supabase/functions/_shared/preferences.ts), photo paths
-- like "<user id>/<id>.jpg" (frontend/src/services/add.ts).
--
-- BEFORE running this, run the read-only check below. Every number must be 0, otherwise the
-- matching constraint would be refused because of rows that already exist (fix or tell the team first):
--
--   select
--     (select count(*) from households where char_length(name) not between 1 and 60) as household_names,
--     (select count(*) from households where invite_code !~ '^[a-z0-9]{8}$') as invite_codes,
--     (select count(*) from users where char_length(name) > 100) as user_names,
--     (select count(*) from users where char_length(location) > 100) as locations,
--     (select count(*) from users where octet_length(quiz_preferences::text) > 4000) as quiz_sizes,
--     (select count(*) from garments where char_length(image_path) not between 1 and 200) as photo_paths,
--     (select count(*) from preference_vector where char_length(tag) not between 1 and 60) as tags,
--     (select count(*) from preference_vector where weight not between -1 and 1) as weights,
--     (select count(*) from suggestions where cardinality(garment_ids) not between 1 and 10) as outfit_sizes;
--
-- Safe to run once. Then run: notify pgrst, 'reload schema';

alter table households
  add constraint households_name_length check (char_length(name) between 1 and 60),
  add constraint households_invite_code_format check (invite_code ~ '^[a-z0-9]{8}$');

-- A name that arrives with a new account (typed at sign-up, or Google's full name) goes into
-- users.name through the sign-up triggers. A very long one must not make sign-up fail with a
-- database error, so it is cut to 100 characters on its way in. (The app also refuses names over
-- 100 when they are typed.) The constraint below stays as the last line of defense.
create function limit_user_name() returns trigger
language plpgsql set search_path = public as $$
begin
  new.name := left(new.name, 100);
  return new;
end $$;

create trigger users_limit_name before insert or update of name on users
  for each row execute function limit_user_name();

-- Same rule as migration 0008: only signed-in users and the service role may execute our functions.
revoke all on function limit_user_name() from public, anon;
grant execute on function limit_user_name() to authenticated, service_role;

alter table users
  add constraint users_name_length check (char_length(name) <= 100),
  add constraint users_location_length check (char_length(location) <= 100),
  add constraint users_quiz_preferences_size check (octet_length(quiz_preferences::text) <= 4000);

alter table garments
  add constraint garments_image_path_length check (char_length(image_path) between 1 and 200);

alter table preference_vector
  add constraint preference_vector_tag_length check (char_length(tag) between 1 and 60),
  add constraint preference_vector_weight_range check (weight between -1 and 1);

alter table suggestions
  add constraint suggestions_garment_ids_size check (cardinality(garment_ids) between 1 and 10);
