-- AI Wardrobe Stylist: initial schema, RLS and storage.
-- Source of truth for the data model. Keep in sync with
-- supabase/functions/_shared/types.ts and tag-schema.ts (tests/migration.test.ts checks the tag lists).

create type garment_status as enum ('clean', 'dirty');
create type feedback_value as enum ('up', 'down');

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text || clock_timestamp()::text), 1, 8),
  created_at timestamptz not null default now()
);

-- One row per auth user (profile). Garments are shared by the household;
-- preferences, location and suggestions are per user.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid references households (id) on delete set null,
  name text not null default '',
  location text,
  quiz_preferences jsonb,
  created_at timestamptz not null default now()
);

create table garments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households (id) on delete cascade,
  added_by uuid not null references users (id) on delete cascade,
  image_path text not null,
  type text not null check (type in (
    't_shirt','tank_top','shirt','blouse','sweater','hoodie',
    'jeans','trousers','shorts','skirt','leggings','sweatpants',
    'sneakers','boots','sandals','dress_shoes',
    'dress','jacket','coat','accessory'
  )),
  color text not null check (color in (
    'black','white','gray','navy','blue','green','red','pink',
    'yellow','orange','purple','brown','beige','multicolor'
  )),
  season text not null check (season in ('spring','summer','fall','winter','all')),
  warmth smallint not null check (warmth between 1 and 5),
  status garment_status not null default 'clean',
  last_worn_date date,
  created_at timestamptz not null default now()
);
create index garments_household_idx on garments (household_id, status);

create table preference_vector (
  user_id uuid not null references users (id) on delete cascade,
  tag text not null,
  weight real not null default 0,
  primary key (user_id, tag)
);

create table suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  date date not null,
  garment_ids uuid[] not null,
  feedback feedback_value,
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
create index suggestions_user_date_idx on suggestions (user_id, date);

-- Create the profile row automatically when someone signs up.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into users (id, name) values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

create function current_household_id() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from users where id = auth.uid()
$$;

create function create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  insert into households (name) values (p_name) returning id into hid;
  update users set household_id = hid where id = auth.uid();
  return hid;
end $$;

create function join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  select id into hid from households where invite_code = p_code;
  if hid is null then
    raise exception 'invalid invite code';
  end if;
  update users set household_id = hid where id = auth.uid();
  return hid;
end $$;

-- Accepting a suggestion marks its garments as worn today (decision D3).
create function accept_suggestion(p_suggestion_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s suggestions;
begin
  select * into s from suggestions where id = p_suggestion_id and user_id = auth.uid();
  if not found then
    raise exception 'suggestion not found';
  end if;
  update suggestions set accepted = true where id = s.id;
  update garments set last_worn_date = current_date
    where id = any (s.garment_ids) and household_id = current_household_id();
end $$;

alter table households enable row level security;
alter table users enable row level security;
alter table garments enable row level security;
alter table preference_vector enable row level security;
alter table suggestions enable row level security;

create policy households_member_read on households
  for select using (id = current_household_id());

create policy users_read_household on users
  for select using (id = auth.uid() or household_id = current_household_id());
create policy users_update_self on users
  for update using (id = auth.uid()) with check (id = auth.uid());
-- household_id changes only through create_household / join_household.
revoke update on users from authenticated;
grant update (name, location, quiz_preferences) on users to authenticated;

create policy garments_household_read on garments
  for select using (household_id = current_household_id());
create policy garments_household_insert on garments
  for insert with check (household_id = current_household_id() and added_by = auth.uid());
create policy garments_household_update on garments
  for update using (household_id = current_household_id())
  with check (household_id = current_household_id());
create policy garments_household_delete on garments
  for delete using (household_id = current_household_id());

create policy preference_vector_own on preference_vector
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy suggestions_own on suggestions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Private photo bucket; objects live under "<household_id>/<file>".
insert into storage.buckets (id, name, public) values ('garments', 'garments', false)
  on conflict (id) do nothing;

create policy garment_photos_read on storage.objects
  for select using (bucket_id = 'garments' and (storage.foldername(name))[1] = current_household_id()::text);
create policy garment_photos_insert on storage.objects
  for insert with check (bucket_id = 'garments' and (storage.foldername(name))[1] = current_household_id()::text);
create policy garment_photos_delete on storage.objects
  for delete using (bucket_id = 'garments' and (storage.foldername(name))[1] = current_household_id()::text);
