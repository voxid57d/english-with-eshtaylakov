-- Apply in the Supabase SQL editor. Independent of ERP/finance schemas; safe to rerun.
begin;
create table if not exists public.train_profiles (
  owner_user_id uuid primary key references auth.users(id) on delete cascade,
  birth_year integer check (birth_year between 1900 and 2100),
  height_cm numeric check (height_cm between 50 and 300),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.train_exercises (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 100), category text not null check (length(btrim(category)) between 1 and 60),
  result_type text not null check (result_type in ('weight_reps','bodyweight_reps','reps','time','distance_time')),
  muscle text not null default '' check (length(muscle) <= 100), notes text not null default '' check (length(notes) <= 2000),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_user_id,id)
);
create unique index if not exists train_exercises_name on public.train_exercises(owner_user_id,lower(name));
create table if not exists public.train_workouts (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  workout_date date not null check (workout_date between '1900-01-01' and '2100-12-31'),
  title text not null default '' check (length(title) <= 100), notes text not null default '' check (length(notes) <= 2000),
  started_at timestamptz, ended_at timestamptz, revision integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_user_id,workout_date), unique(owner_user_id,id),
  check (ended_at is null or started_at is not null and ended_at >= started_at)
);
create table if not exists public.train_workout_exercises (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null, exercise_id uuid not null, position integer not null check (position between 0 and 49),
  notes text not null default '' check (length(notes) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_user_id,id), unique(workout_id,exercise_id),
  foreign key(owner_user_id,workout_id) references public.train_workouts(owner_user_id,id) on delete cascade,
  foreign key(owner_user_id,exercise_id) references public.train_exercises(owner_user_id,id) on delete restrict
);
create index if not exists train_we_history on public.train_workout_exercises(owner_user_id,exercise_id,workout_id);
create table if not exists public.train_sets (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  workout_exercise_id uuid not null, position integer not null check(position between 0 and 99),
  weight_kg numeric check(weight_kg between 0 and 1500), reps integer check(reps between 1 and 10000),
  duration_seconds integer check(duration_seconds between 1 and 604800), distance_km numeric check(distance_km between 0.001 and 1000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(owner_user_id,workout_exercise_id) references public.train_workout_exercises(owner_user_id,id) on delete cascade
);
create index if not exists train_sets_parent on public.train_sets(workout_exercise_id,position);
create or replace function public.train_validate_set() returns trigger language plpgsql set search_path=public as $$
declare kind text;
begin
  select e.result_type into kind from train_exercises e join train_workout_exercises we on we.exercise_id=e.id
    where we.id=new.workout_exercise_id and we.owner_user_id=new.owner_user_id for share of e;
  if kind is null then raise exception 'Invalid exercise ownership' using errcode='23514'; end if;
  if num_nonnulls(new.weight_kg,new.reps,new.duration_seconds,new.distance_km)=0 then return new; end if;
  if (kind='weight_reps' and new.weight_kg is not null and new.reps is not null and new.duration_seconds is null and new.distance_km is null)
    or (kind='bodyweight_reps' and new.reps is not null and new.duration_seconds is null and new.distance_km is null)
    or (kind='reps' and new.reps is not null and num_nonnulls(new.weight_kg,new.duration_seconds,new.distance_km)=0)
    or (kind='time' and new.duration_seconds is not null and num_nonnulls(new.weight_kg,new.reps,new.distance_km)=0)
    or (kind='distance_time' and new.duration_seconds is not null and new.distance_km is not null and num_nonnulls(new.weight_kg,new.reps)=0)
  then return new; end if;
  raise exception 'Set fields do not match the exercise result type' using errcode='23514';
end $$;
drop trigger if exists train_set_fields on public.train_sets;
create trigger train_set_fields before insert or update on public.train_sets for each row execute function public.train_validate_set();
create table if not exists public.train_measurements (
  id uuid primary key default gen_random_uuid(), owner_user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null check(measured_on between '1900-01-01' and '2100-12-31'),
  weight_kg numeric check(weight_kg between 1 and 500), waist_cm numeric check(waist_cm between 1 and 400),
  chest_cm numeric check(chest_cm between 1 and 400), shoulder_cm numeric check(shoulder_cm between 1 and 400),
  neck_cm numeric check(neck_cm between 1 and 400), upper_arm_cm numeric check(upper_arm_cm between 1 and 400),
  forearm_cm numeric check(forearm_cm between 1 and 400), hip_cm numeric check(hip_cm between 1 and 400),
  thigh_cm numeric check(thigh_cm between 1 and 400), calf_cm numeric check(calf_cm between 1 and 400),
  notes text not null default '' check(length(notes) <= 2000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(owner_user_id,measured_on),
  check(num_nonnulls(weight_kg,waist_cm,chest_cm,shoulder_cm,neck_cm,upper_arm_cm,forearm_cm,hip_cm,thigh_cm,calf_cm)>0)
);
create index if not exists train_measurements_date on public.train_measurements(owner_user_id,measured_on desc);

create or replace function public.train_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
-- A used exercise's type cannot change, even in a concurrent save/edit race.
create or replace function public.train_protect_type() returns trigger language plpgsql set search_path = public as $$
begin
  if new.result_type <> old.result_type and exists(select 1 from train_workout_exercises where exercise_id = old.id) then
    raise exception 'Archive this exercise and create another to change its result type.' using errcode = '23514';
  end if; return new;
end $$;
drop trigger if exists train_exercise_type on public.train_exercises;
create trigger train_exercise_type before update on public.train_exercises for each row execute function public.train_protect_type();
do $$ declare t text; begin
  foreach t in array array['train_profiles','train_exercises','train_workouts','train_workout_exercises','train_sets','train_measurements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop trigger if exists train_updated on public.%I',t);
    execute format('create trigger train_updated before update on public.%I for each row execute function public.train_touch()',t);
  end loop;
end $$;

-- Keep the estimate isolated, matching lib/training.ts.
create or replace function public.train_epley(weight numeric, reps integer, kind text) returns numeric
language sql immutable set search_path = public as $$
  select case when kind = 'weight_reps' and weight > 0 and reps between 1 and 12
    then case when reps=1 then weight else round(weight*(1+reps/30.0),2) end end
$$;
create or replace view public.train_performances with (security_invoker = true) as
select w.owner_user_id, w.id workout_id, w.workout_date, e.id exercise_id, e.name, e.result_type,
  count(s.id)::integer sets, coalesce(sum(s.reps),0) reps,
  max(s.weight_kg) max_weight,
  coalesce(sum(case when e.result_type in ('weight_reps','bodyweight_reps') then s.weight_kg*s.reps end),0) volume,
  max(public.train_epley(s.weight_kg,s.reps,e.result_type)) estimated_1rm,
  max(s.duration_seconds) duration, max(s.distance_km) distance
from public.train_workouts w join public.train_workout_exercises we on we.workout_id=w.id
join public.train_exercises e on e.id=we.exercise_id
join public.train_sets s on s.workout_exercise_id=we.id
where (e.result_type='weight_reps' and s.weight_kg is not null and s.reps is not null)
   or (e.result_type in ('bodyweight_reps','reps') and s.reps is not null)
   or (e.result_type='time' and s.duration_seconds is not null)
   or (e.result_type='distance_time' and s.distance_km is not null and s.duration_seconds is not null)
group by w.owner_user_id,w.id,w.workout_date,e.id,e.name,e.result_type;

create or replace view public.train_records with (security_invoker = true) as
with metrics as (
  select p.owner_user_id,p.workout_id,p.workout_date,p.exercise_id,p.name,m.metric,m.value
  from public.train_performances p cross join lateral (values
    ('Weight (kg)',p.max_weight),('Session volume (kg × reps)',nullif(p.volume,0)),
    ('Estimated 1RM (kg)',p.estimated_1rm),('Session reps',nullif(p.reps,0)),
    ('Duration (sec)',p.duration),('Distance (km)',p.distance)
  ) m(metric,value) where m.value > 0
  union all
  select w.owner_user_id,w.id,w.workout_date,e.id,e.name,
    case when e.result_type='reps' then 'Best set (reps)' else 'Reps at ' || coalesce(s.weight_kg,0)::text || ' kg' end,
    max(s.reps)::numeric
  from public.train_sets s join public.train_workout_exercises we on we.id=s.workout_exercise_id
  join public.train_workouts w on w.id=we.workout_id join public.train_exercises e on e.id=we.exercise_id
  where s.reps is not null and e.result_type in ('weight_reps','bodyweight_reps','reps')
    and (e.result_type <> 'weight_reps' or s.weight_kg is not null)
  group by w.owner_user_id,w.id,w.workout_date,e.id,e.name,e.result_type,coalesce(s.weight_kg,0)
), ranked as (
  select *,max(value) over(partition by owner_user_id,exercise_id,metric order by workout_date rows between unbounded preceding and 1 preceding) previous from metrics
)
select * from ranked where previous is null or value > previous;
revoke all on public.train_performances,public.train_records from anon,authenticated;
grant select on public.train_performances,public.train_records to service_role;

create or replace function public.train_start(p_owner uuid,p_date date,p_started timestamptz default null,p_repeat uuid default null)
returns uuid language plpgsql set search_path = public as $$
declare wid uuid; source train_workouts; old_item record; new_item uuid;
begin
  if p_repeat is not null then
    select * into source from train_workouts where id=p_repeat and owner_user_id=p_owner;
    if not found then raise exception 'Workout not found' using errcode='P0002'; end if;
  end if;
  insert into train_workouts(owner_user_id,workout_date,started_at,title)
    values(p_owner,p_date,p_started,coalesce(source.title,''))
    on conflict(owner_user_id,workout_date) do nothing returning id into wid;
  if wid is null then select id into wid from train_workouts where owner_user_id=p_owner and workout_date=p_date; return wid; end if;
  if p_repeat is not null then
    for old_item in select we.* from train_workout_exercises we join train_exercises e on e.id=we.exercise_id
      where we.workout_id=p_repeat and we.owner_user_id=p_owner and e.active order by we.position loop
      insert into train_workout_exercises(owner_user_id,workout_id,exercise_id,position) values(p_owner,wid,old_item.exercise_id,old_item.position) returning id into new_item;
      insert into train_sets(owner_user_id,workout_exercise_id,position) select p_owner,new_item,position from train_sets where workout_exercise_id=old_item.id;
    end loop;
  end if;
  return wid;
end $$;

-- JSON is only the transport. One transaction writes normalized rows; revision prevents lost edits.
create or replace function public.train_save(p_owner uuid,p_workout jsonb) returns integer
language plpgsql set search_path = public as $$
declare current_row train_workouts; item jsonb; set_row jsonb; idx integer:=0; set_idx integer; eid uuid; sid uuid; kind text;
begin
  select * into current_row from train_workouts where id=(p_workout->>'id')::uuid and owner_user_id=p_owner for update;
  if not found then raise exception 'Workout not found' using errcode='P0002'; end if;
  if current_row.revision <> (p_workout->>'revision')::integer then raise exception 'This workout changed in another tab. Reload before saving.' using errcode='40001'; end if;
  if jsonb_array_length(p_workout->'exercises') > 50 then raise exception 'Too many exercises'; end if;
  update train_workouts set workout_date=(p_workout->>'workout_date')::date,title=p_workout->>'title',notes=p_workout->>'notes',
    started_at=(p_workout->>'started_at')::timestamptz,ended_at=(p_workout->>'ended_at')::timestamptz,revision=revision+1 where id=current_row.id;
  delete from train_workout_exercises where workout_id=current_row.id and not(id in(select (v->>'id')::uuid from jsonb_array_elements(p_workout->'exercises') v));
  for item in select * from jsonb_array_elements(p_workout->'exercises') loop
    eid:=(item->>'id')::uuid;
    select result_type into kind from train_exercises where id=(item->>'exercise_id')::uuid and owner_user_id=p_owner for share;
    if not found then raise exception 'Exercise not found' using errcode='P0002'; end if;
    insert into train_workout_exercises(id,owner_user_id,workout_id,exercise_id,position,notes)
      values(eid,p_owner,current_row.id,(item->>'exercise_id')::uuid,idx,item->>'notes')
      on conflict(id) do update set position=excluded.position,notes=excluded.notes
      where train_workout_exercises.owner_user_id=p_owner and train_workout_exercises.workout_id=current_row.id and train_workout_exercises.exercise_id=excluded.exercise_id;
    if not found then raise exception 'Invalid exercise ownership' using errcode='23514'; end if;
    delete from train_sets where workout_exercise_id=eid and not(id in(select (v->>'id')::uuid from jsonb_array_elements(item->'sets') v));
    set_idx:=0;
    for set_row in select * from jsonb_array_elements(item->'sets') loop
      sid:=(set_row->>'id')::uuid;
      insert into train_sets(id,owner_user_id,workout_exercise_id,position,weight_kg,reps,duration_seconds,distance_km)
        values(sid,p_owner,eid,set_idx,(set_row->>'weight_kg')::numeric,(set_row->>'reps')::integer,(set_row->>'duration_seconds')::integer,(set_row->>'distance_km')::numeric)
        on conflict(id) do update set position=excluded.position,weight_kg=excluded.weight_kg,reps=excluded.reps,duration_seconds=excluded.duration_seconds,distance_km=excluded.distance_km
        where train_sets.owner_user_id=p_owner and train_sets.workout_exercise_id=eid;
      if not found then raise exception 'Invalid set ownership' using errcode='23514'; end if;
      set_idx:=set_idx+1;
    end loop;
    idx:=idx+1;
  end loop;
  return current_row.revision+1;
end $$;
revoke all on function public.train_start(uuid,date,timestamptz,uuid),public.train_save(uuid,jsonb),public.train_epley(numeric,integer,text),public.train_touch(),public.train_protect_type(),public.train_validate_set() from public,anon,authenticated;
grant execute on function public.train_start(uuid,date,timestamptz,uuid),public.train_save(uuid,jsonb),public.train_epley(numeric,integer,text),public.train_touch(),public.train_protect_type(),public.train_validate_set() to service_role;
commit;
