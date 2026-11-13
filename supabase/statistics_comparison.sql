-- Run after statistics_readings.sql. Adds the per-category settings used to compare months:
--   kind:      'total'   = running total that carries over (active students, debt)
--              'monthly' = monthly counter that restarts each month (trial sign-ups, enrolments)
--   direction: 'up' = higher is better, 'down' = lower is better, 'neutral' = no judgement
-- Safe to run more than once.
begin;
alter table public.statistics_categories add column if not exists kind text not null default 'total';
alter table public.statistics_categories add column if not exists direction text not null default 'neutral';
alter table public.statistics_categories drop constraint if exists statistics_categories_kind_check;
alter table public.statistics_categories add constraint statistics_categories_kind_check check (kind in ('total', 'monthly'));
alter table public.statistics_categories drop constraint if exists statistics_categories_direction_check;
alter table public.statistics_categories add constraint statistics_categories_direction_check check (direction in ('up', 'down', 'neutral'));
commit;
