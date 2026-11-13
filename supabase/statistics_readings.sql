-- Run after statistics_schema.sql. Replaces one-figure-per-day statistics with timestamped
-- check-ins ("readings"): record as often as needed, each reading holds the current total
-- for any of the categories. Safe to run more than once.
begin;

create table if not exists public.statistics_readings (
   id uuid primary key default gen_random_uuid(),
   recorded_at timestamptz not null check (recorded_at >= '1900-01-01 00:00+05' and recorded_at < '2200-01-01 00:00+05'),
   note text check (note is null or char_length(note) between 1 and 200),
   created_by uuid references auth.users(id) on delete set null,
   updated_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);
create index if not exists statistics_readings_recorded_at_idx on public.statistics_readings(recorded_at, id);

create table if not exists public.statistics_reading_values (
   reading_id uuid not null references public.statistics_readings(id) on delete cascade,
   category_id uuid not null references public.statistics_categories(id) on delete restrict,
   value numeric(14, 2) not null check (value between -999999999999.99 and 999999999999.99),
   primary key (reading_id, category_id)
);
create index if not exists statistics_reading_values_category_idx on public.statistics_reading_values(category_id, reading_id);

alter table public.statistics_readings enable row level security;
alter table public.statistics_reading_values enable row level security;
revoke all on public.statistics_readings, public.statistics_reading_values from anon, authenticated;
grant all on public.statistics_readings, public.statistics_reading_values to service_role;

-- One-time conversion: each recorded day becomes one reading at 18:00 Tashkent time.
-- Skipped when readings already exist, so re-running never duplicates history.
-- The old statistics_entries table is left untouched.
do $$
begin
   if exists (select 1 from public.statistics_readings) then return; end if;
   with days as (
      select entry_date,
         (array_agg(updated_by order by updated_at desc))[1] as actor,
         max(updated_at) as changed_at
      from public.statistics_entries group by entry_date
   ), inserted as (
      insert into public.statistics_readings (recorded_at, created_by, updated_by, created_at, updated_at)
      select (entry_date + time '18:00') at time zone 'Asia/Tashkent', actor, actor, changed_at, changed_at from days
      returning id, recorded_at
   )
   insert into public.statistics_reading_values (reading_id, category_id, value)
   select inserted.id, entries.category_id, entries.value
   from inserted join public.statistics_entries entries
      on entries.entry_date = (inserted.recorded_at at time zone 'Asia/Tashkent')::date;
end;
$$;

-- Create or edit one reading and all its values in a single transaction.
-- Editing replaces the reading's values; categories left out are not measured.
create or replace function public.save_statistics_reading(reading jsonb, actor uuid)
returns uuid language plpgsql set search_path = public as $$
declare
   target uuid := nullif(reading->>'id', '')::uuid;
   moment timestamptz := (reading->>'recorded_at')::timestamptz;
   remark text := nullif(btrim(coalesce(reading->>'note', '')), '');
begin
   if jsonb_typeof(reading->'values') is distinct from 'array' or jsonb_array_length(reading->'values') not between 1 and 500 then
      raise exception 'Expected 1 to 500 values.';
   end if;
   if target is null then
      insert into public.statistics_readings (recorded_at, note, created_by, updated_by)
      values (moment, remark, actor, actor) returning id into target;
   else
      update public.statistics_readings set recorded_at = moment, note = remark, updated_by = actor, updated_at = now()
      where id = target;
      if not found then raise exception using errcode = 'P0002', message = 'This entry no longer exists.'; end if;
      delete from public.statistics_reading_values where reading_id = target;
   end if;
   insert into public.statistics_reading_values (reading_id, category_id, value)
   select target, category_id, value from jsonb_to_recordset(reading->'values') as v(category_id uuid, value numeric);
   return target;
end;
$$;
revoke all on function public.save_statistics_reading(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_statistics_reading(jsonb, uuid) to service_role;

create or replace function public.delete_statistics_reading(target_reading_id uuid)
returns boolean language plpgsql set search_path = public as $$
begin
   delete from public.statistics_readings where id = target_reading_id;
   return found;
end;
$$;
revoke all on function public.delete_statistics_reading(uuid) from public, anon, authenticated;
grant execute on function public.delete_statistics_reading(uuid) to service_role;

-- Deleting a category removes its values everywhere, readings left empty, and its legacy daily figures.
create or replace function public.delete_statistics_category(target_category_id uuid)
returns boolean language plpgsql set search_path = public as $$
begin
   perform id from public.statistics_categories where id = target_category_id for update;
   if not found then return false; end if;
   delete from public.statistics_reading_values where category_id = target_category_id;
   delete from public.statistics_readings r
      where not exists (select 1 from public.statistics_reading_values v where v.reading_id = r.id);
   delete from public.statistics_entries where category_id = target_category_id;
   delete from public.statistics_categories where id = target_category_id;
   return true;
end;
$$;
revoke all on function public.delete_statistics_category(uuid) from public, anon, authenticated;
grant execute on function public.delete_statistics_category(uuid) to service_role;
commit;
