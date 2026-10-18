-- Wearing an outfit sends it to the laundry (decision D21, replaces "no auto-dirty" in D3).
-- Accepting a suggestion already marks its garments as worn today. Now it also marks every
-- garment except the shoes as dirty, so a second outfit for the same day (the "New outfit"
-- button) cannot use clothes that were just worn: generate-outfit only uses clean garments.
-- Shoes stay as they are, because they are not washed after every wear.
--
-- Only the caller's own garments are touched (as before). The list of shoe types must match the
-- shoes slot in supabase/functions/_shared/tag-schema.ts; tests/migration.test.ts checks that.
-- Replaces the function from 0002; safe to run once.

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
        status = case when type in ('sneakers', 'boots', 'sandals', 'dress_shoes') then status else 'dirty' end
    where id = any (s.garment_ids) and owner_id = auth.uid();
end $$;
