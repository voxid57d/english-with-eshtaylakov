-- Run after erp_core_schema.sql, before deploying the Next level feature.
-- Existing groups each become their own series; no dates, levels or covers change.
begin;

alter table public.teacher_lesson_groups
   add column if not exists group_series_id uuid not null default gen_random_uuid();
create index if not exists teacher_lesson_groups_series_idx
   on public.teacher_lesson_groups(group_series_id, starts_on);

-- All period mutations take the same series lock, including concurrent requests.
create or replace function public.advance_teacher_group(
   source_group_id uuid, next_period jsonb, previous_ends_on date default null
) returns uuid language plpgsql set search_path = public as $$
declare
   source public.teacher_lesson_groups;
   next_row public.teacher_lesson_groups;
   series uuid;
   final_day date;
   new_id uuid;
begin
   select group_series_id into series from public.teacher_lesson_groups where id = source_group_id;
   if not found then raise exception 'Group not found. Refresh and try again.'; end if;
   perform pg_advisory_xact_lock(hashtextextended(series::text, 0));
   select * into source from public.teacher_lesson_groups where id = source_group_id for update;
   if not source.active or source.is_intake then
      raise exception 'Only active regular groups can advance to the next level.';
   end if;
   if exists (select 1 from public.teacher_lesson_groups
      where group_series_id = series and id <> source.id and starts_on > source.starts_on) then
      raise exception 'This group already has a next level. Edit the planned period instead.';
   end if;
   next_row := jsonb_populate_record(null::public.teacher_lesson_groups, next_period);
   final_day := coalesce(source.ends_on, previous_ends_on);
   if final_day is null or final_day < source.starts_on then
      raise exception 'Set a valid ending date for the current level.';
   end if;
   if next_row.starts_on is null or next_row.starts_on <= final_day
      or next_row.ends_on is null or next_row.ends_on < next_row.starts_on then
      raise exception 'The next level must start after the current level ends and have a valid ending date.';
   end if;
   if next_row.level_id = source.level_id then raise exception 'Choose a different level.'; end if;
   if not exists (select 1 from public.teacher_group_levels where id = next_row.level_id and active) then
      raise exception 'Choose an active group level.';
   end if;
   if source.ends_on is null then
      if exists (select 1 from public.teacher_lesson_covers
         where lesson_group_id = source.id and cover_date > final_day) then
         raise exception 'The current ending date would hide an existing cover. Review its covers first.';
      end if;
      update public.teacher_lesson_groups set ends_on = final_day where id = source.id;
   end if;
   insert into public.teacher_lesson_groups (
      group_series_id, teacher_id, level_id, lms_group_name, lms_group_id,
      starts_on, ends_on, starts_at, ends_at, weekdays, active_students_count, active, is_intake
   ) values (
      series, next_row.teacher_id, next_row.level_id, next_row.lms_group_name, next_row.lms_group_id,
      next_row.starts_on, next_row.ends_on, next_row.starts_at, next_row.ends_at,
      next_row.weekdays, next_row.active_students_count, true, false
   ) returning id into new_id;
   return new_id;
end;
$$;

-- Editing is an explicit correction to one period, with the other periods protected.
create or replace function public.save_teacher_group_period(target_group_id uuid, period jsonb)
returns void language plpgsql set search_path = public as $$
declare
   original public.teacher_lesson_groups;
   edited public.teacher_lesson_groups;
   series uuid;
begin
   select group_series_id into series from public.teacher_lesson_groups where id = target_group_id;
   if not found then raise exception 'Group not found. Refresh and try again.'; end if;
   perform pg_advisory_xact_lock(hashtextextended(series::text, 0));
   select * into original from public.teacher_lesson_groups where id = target_group_id for update;
   edited := jsonb_populate_record(null::public.teacher_lesson_groups, period);
   if edited.active is distinct from original.active or edited.archived_on is distinct from original.archived_on then
      raise exception 'Use Archive or Restore on the group card to change its status.';
   end if;
   if exists (select 1 from public.teacher_lesson_groups where group_series_id = series and id <> original.id) then
      if edited.is_intake then raise exception 'A group with level history cannot become an intake group.'; end if;
      if exists (select 1 from public.teacher_lesson_groups other
         where other.group_series_id = series and other.id <> original.id and (
            (other.starts_on < original.starts_on and (other.ends_on is null or edited.starts_on <= other.ends_on))
            or (other.starts_on > original.starts_on and (edited.ends_on is null or edited.ends_on >= other.starts_on))
         )) then
         raise exception 'These dates overlap another level period. Review the group level history.';
      end if;
   end if;
   if exists (select 1 from public.teacher_lesson_covers c where c.lesson_group_id = original.id and (
      edited.is_intake or c.cover_date < edited.starts_on
      or c.cover_date > edited.ends_on
      or not (extract(isodow from c.cover_date)::integer = any(edited.weekdays))
   )) then
      raise exception 'These dates or weekdays would hide an existing cover. Review its covers first.';
   end if;
   update public.teacher_lesson_groups set
      teacher_id = edited.teacher_id, level_id = edited.level_id,
      lms_group_name = edited.lms_group_name, lms_group_id = edited.lms_group_id,
      starts_on = edited.starts_on, ends_on = edited.ends_on,
      starts_at = edited.starts_at, ends_at = edited.ends_at, weekdays = edited.weekdays,
      active_students_count = edited.active_students_count, is_intake = edited.is_intake
   where id = original.id;
end;
$$;

-- Archive/restore the whole group, including planned periods, without removing history.
create or replace function public.set_teacher_group_active(target_group_id uuid, enabled boolean, archive_date date)
returns void language plpgsql set search_path = public as $$
declare series uuid;
begin
   if enabled is null or (not enabled and archive_date is null) then raise exception 'Group status is required.'; end if;
   select group_series_id into series from public.teacher_lesson_groups where id = target_group_id;
   if not found then raise exception 'Group not found. Refresh and try again.'; end if;
   perform pg_advisory_xact_lock(hashtextextended(series::text, 0));
   update public.teacher_lesson_groups set active = enabled,
      archived_on = case when enabled then null else coalesce(archived_on, archive_date) end
   where group_series_id = series;
end;
$$;

revoke all on function public.advance_teacher_group(uuid, jsonb, date) from public, anon, authenticated;
revoke all on function public.save_teacher_group_period(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_teacher_group_active(uuid, boolean, date) from public, anon, authenticated;
grant execute on function public.advance_teacher_group(uuid, jsonb, date) to service_role;
grant execute on function public.save_teacher_group_period(uuid, jsonb) to service_role;
grant execute on function public.set_teacher_group_active(uuid, boolean, date) to service_role;
commit;
