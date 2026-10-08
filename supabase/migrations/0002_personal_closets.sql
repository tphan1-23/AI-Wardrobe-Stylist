-- Personal closets (decision D18, overrides D1).
-- Every user has their own closet: a garment belongs to the person who added it.
-- A household is optional and only shares closets: members can view each
-- other's garments, but only the owner can change or delete them. Joining or
-- leaving never moves clothes; it only changes who can see them.
--
-- 0001_init.sql has already been applied by hand, so this migration changes it
-- in place. No garments exist yet, so nothing needs to be backfilled.

-- ---- Garments: owned by a user, not a household -----------------------------

drop policy garments_household_read on garments;
drop policy garments_household_insert on garments;
drop policy garments_household_update on garments;
drop policy garments_household_delete on garments;
drop index garments_household_idx;

alter table garments drop column household_id;
alter table garments rename column added_by to owner_id;
create index garments_owner_idx on garments (owner_id, status);

-- The users whose closets the signed-in user can see: themselves, plus the
-- other members of their household if they are in one.
create function visible_closet_owner_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid()
  union
  select id from users
  where household_id is not null and household_id = current_household_id()
$$;

create policy garments_visible_read on garments
  for select using (owner_id in (select visible_closet_owner_ids()));
create policy garments_owner_insert on garments
  for insert with check (owner_id = auth.uid());
create policy garments_owner_update on garments
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy garments_owner_delete on garments
  for delete using (owner_id = auth.uid());

-- Suggestions come from the user's own closet, so accepting one only marks
-- their own garments as worn.
create or replace function accept_suggestion(p_suggestion_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s suggestions;
begin
  select * into s from suggestions where id = p_suggestion_id and user_id = auth.uid();
  if not found then
    raise exception 'suggestion not found';
  end if;
  update suggestions set accepted = true where id = s.id;
  update garments set last_worn_date = current_date
    where id = any (s.garment_ids) and owner_id = auth.uid();
end $$;

-- ---- Households: optional, one at a time, deleted when empty ----------------

create or replace function create_household(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if current_household_id() is not null then
    raise exception 'already in a household';
  end if;
  insert into households (name) values (p_name) returning id into hid;
  update users set household_id = hid where id = auth.uid();
  return hid;
end $$;

create or replace function join_household(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare hid uuid;
begin
  if current_household_id() is not null then
    raise exception 'already in a household';
  end if;
  select id into hid from households where invite_code = p_code;
  if hid is null then
    raise exception 'invalid invite code';
  end if;
  update users set household_id = hid where id = auth.uid();
  return hid;
end $$;

-- Leaving stops sharing; the user's garments stay theirs. The last member to
-- leave deletes the household so no empty households are left behind.
create function leave_household() returns void
language plpgsql security definer set search_path = public as $$
declare hid uuid := current_household_id();
begin
  if hid is null then
    raise exception 'not in a household';
  end if;
  update users set household_id = null where id = auth.uid();
  delete from households h
    where h.id = hid and not exists (select 1 from users u where u.household_id = hid);
end $$;

-- ---- Photos: stored per owner ----------------------------------------------
-- Objects live under "<owner user id>/<file>". Household members can view each
-- other's photos; only the owner can upload or delete.

drop policy garment_photos_read on storage.objects;
drop policy garment_photos_insert on storage.objects;
drop policy garment_photos_delete on storage.objects;

create policy garment_photos_read on storage.objects
  for select using (
    bucket_id = 'garments'
    and (storage.foldername(name))[1] in (select id::text from visible_closet_owner_ids() as id)
  );
create policy garment_photos_insert on storage.objects
  for insert with check (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy garment_photos_delete on storage.objects
  for delete using (bucket_id = 'garments' and (storage.foldername(name))[1] = auth.uid()::text);
