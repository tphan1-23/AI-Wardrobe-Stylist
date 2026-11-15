-- Wearing an outfit no longer sends a jacket or coat to the laundry (decision D25, refines D21).
--
-- Outfits can now include a layer over the top: a jacket or coat, or a hoodie or sweater over a lighter top, when
-- it is cold or wet. Accepting a suggestion marks its garments worn today and, since 0007, dirty, except shoes.
-- Jackets and coats are not washed after every wear either, so they join the shoes: without this, someone with one
-- jacket would never be offered it again until they marked it clean by hand. Dresses, tops, bottoms, hoodies and
-- sweaters still go to the laundry.
--
-- The list of types must match LAUNDRY_EXEMPT_TYPES in supabase/functions/_shared/outfit.ts (shoes + jacket + coat);
-- tests/wearMarksDirty.test.ts checks that. Only the caller's own garments are touched, as before.
-- Replaces the function from 0007 (create or replace keeps its permissions: signed-in users only, see 0008).
-- Safe to run once.

create or replace function accept_suggestion(p_suggestion_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s suggestions;
begin
  select * into s from suggestions where id = p_suggestion_id and user_id = auth.uid();
  if not found then
    raise exception 'suggestion not found';
  end if;
  update suggestions set accepted = true where id = s.id;
  update garments
    set last_worn_date = current_date,
        status = case when type in ('sneakers', 'boots', 'sandals', 'dress_shoes', 'jacket', 'coat') then status else 'dirty' end
    where id = any (s.garment_ids) and owner_id = auth.uid();
end $$;

-- Same rule as migration 0008: only signed-in users and the service role may execute our functions.
revoke all on function accept_suggestion(uuid) from public, anon;
grant execute on function accept_suggestion(uuid) to authenticated, service_role;
