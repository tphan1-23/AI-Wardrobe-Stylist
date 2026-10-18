-- Favorites: a person can mark their own garments, and the outfits they wore, as favorites.
-- Nothing else changes: the existing row-level security already limits who can update what
-- (garments: only the owner, 0002; suggestions: only the person they belong to, 0001),
-- so a favorite can only ever be set or removed by its owner.
-- Existing rows start as not favorite. Safe to run once.

alter table garments add column favorite boolean not null default false;
alter table suggestions add column favorite boolean not null default false;
