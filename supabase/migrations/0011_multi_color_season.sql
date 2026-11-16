-- Two changes to garments, in one transaction so there is only one migration to run:
--   1. a garment can have several colors and several seasons (D26);
--   2. a new garment type, tights, for the under-layer recommendations (D28).
--
-- ---- 1. Several colors and seasons (D26) ----
-- Before: garments.color (one value) and garments.season (one value).
-- After:  garments.colors (1 to 3 different colors, main color first) and garments.seasons
--         (["all"], or 1 to 3 different single seasons; all four is written as "all").
--
-- Existing rows stay valid: colors = [color] and seasons = [season], so nothing is lost or guessed.
-- The old columns are dropped at the end, in the same transaction, so there is one source of truth.
--
-- ---- 2. The tights type (D28) ----
-- Tights are worn under a skirt, shorts or a dress when it is cold. Leggings stay a bottom of their own.
-- The type list is a CHECK constraint (migration 0001, unnamed, so Postgres named it garments_type_check). It is replaced
-- here with the same list plus tights; existing rows all stay valid. The list must match GARMENT_TYPES in
-- supabase/functions/_shared/tag-schema.ts (tests/migration.test.ts checks that).
--
-- ORDER OF ROLLOUT (the old app and the old edge functions read color and season, so they break the
-- moment this runs): apply this migration, then deploy generate-outfit, update-preferences, analyze-garment
-- and delete-account from main right away, and use the new app build. Do it in one sitting.
--
-- ROLLBACK, if ever needed (the first color and the first season are kept):
--   alter table garments add column color text, add column season text;
--   update garments set color = colors[1], season = seasons[1];
--   (then restore the old not null and check constraints from 0001, and drop colors and seasons;
--    garments of type tights must be deleted or retyped before the old type list can come back)
--
-- Safe to run once. Then run: notify pgrst, 'reload schema';

begin;

-- A CHECK constraint cannot hold a subquery, so "no repeats" is a small immutable function.
create function array_has_no_repeats(items text[]) returns boolean
language sql immutable set search_path = public as $$
  select cardinality(items) = (select count(distinct item) from unnest(items) as item)
$$;
-- Same rule as migration 0008: only signed-in users and the service role may execute our functions.
revoke all on function array_has_no_repeats(text[]) from public, anon;
grant execute on function array_has_no_repeats(text[]) to authenticated, service_role;

alter table garments add column colors text[], add column seasons text[];

update garments set colors = array[color], seasons = array[season];

alter table garments
  alter column colors set not null,
  alter column seasons set not null,
  -- Colors: 1 to 3 entries, all from the fixed list, no repeats.
  add constraint garments_colors_valid check (
    cardinality(colors) between 1 and 3
    and colors <@ array['black','white','gray','navy','blue','green','red','pink','yellow','orange','purple','brown','beige','multicolor']
    and array_has_no_repeats(colors)
  ),
  -- Seasons: exactly ["all"], or 1 to 3 different single seasons.
  add constraint garments_seasons_valid check (
    seasons = array['all']
    or (
      cardinality(seasons) between 1 and 3
      and seasons <@ array['spring','summer','fall','winter']
      and array_has_no_repeats(seasons)
    )
  );

alter table garments drop column color, drop column season;

-- The tights type (D28).
alter table garments drop constraint garments_type_check;
alter table garments add constraint garments_type_check check (type in (
  't_shirt','tank_top','shirt','blouse','sweater','hoodie',
  'jeans','trousers','shorts','skirt','leggings','sweatpants',
  'sneakers','boots','sandals','dress_shoes',
  'dress','tights','jacket','coat','accessory'
));

commit;
