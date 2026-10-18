-- Explore mode for the "Your judgement" deck: outfit ideas beyond today's.
--
-- Every `ok` answer of generate-outfit is saved as a suggestion for a date and the Today
-- screen shows the latest one. Explore ideas must not replace today's outfit or show up in
-- history, so they are stored with kind = 'explore' and today's screen and history only read
-- kind = 'today'. Existing rows are today's suggestions. No policy changes: suggestions stay
-- readable and writable by their owner only (suggestions_own).

alter table suggestions
  add column kind text not null default 'today' check (kind in ('today', 'explore'));

create index suggestions_user_date_kind_idx on suggestions (user_id, date, kind);
