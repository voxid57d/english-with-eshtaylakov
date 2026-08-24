create extension if not exists "pgcrypto";

create table if not exists public.task_members (
   user_id uuid primary key references auth.users(id) on delete cascade,
   role text not null default 'report' check (role in ('manager', 'report', 'coordinator')),
   manager_id uuid references auth.users(id) on delete set null,
   display_name text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

alter table public.task_members
   drop constraint if exists task_members_role_check;

alter table public.task_members
   add constraint task_members_role_check
   check (role in ('manager', 'report', 'coordinator'));

create index if not exists task_members_manager_id_idx
   on public.task_members(manager_id);

create table if not exists public.task_templates (
   id uuid primary key default gen_random_uuid(),
   title text not null,
   description text,
   created_by uuid not null references auth.users(id) on delete cascade,
   assigned_to uuid not null references auth.users(id) on delete cascade,
   frequency_type text not null check (frequency_type in ('daily', 'weekly', 'monthly', 'once')),
   weekdays int[],
   month_days int[],
   start_date date not null,
   end_date date,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint task_templates_date_order check (end_date is null or end_date >= start_date),
   constraint task_templates_weekdays_valid check (
      weekdays is null
      or (
         array_length(weekdays, 1) > 0
         and weekdays <@ array[0,1,2,3,4,5,6]
      )
   ),
   constraint task_templates_month_days_valid check (
      month_days is null
      or (
         array_length(month_days, 1) > 0
         and month_days <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]
      )
   )
);

create index if not exists task_templates_assigned_to_idx
   on public.task_templates(assigned_to, active, start_date, end_date);

create index if not exists task_templates_created_by_idx
   on public.task_templates(created_by);

alter table public.task_templates
   add column if not exists branch_id uuid;

create index if not exists task_templates_branch_id_idx
   on public.task_templates(branch_id, active, start_date, end_date);

create table if not exists public.task_completions (
   id uuid primary key default gen_random_uuid(),
   task_id uuid not null references public.task_templates(id) on delete cascade,
   occurrence_date date not null,
   completed_by uuid not null references auth.users(id) on delete cascade,
   completed_at timestamptz not null default now(),
   created_at timestamptz not null default now(),
   unique (task_id, occurrence_date)
);

create index if not exists task_completions_task_date_idx
   on public.task_completions(task_id, occurrence_date);

create table if not exists public.task_comments (
   id uuid primary key default gen_random_uuid(),
   task_id uuid not null references public.task_templates(id) on delete cascade,
   occurrence_date date not null,
   user_id uuid not null references auth.users(id) on delete cascade,
   body text not null,
   created_at timestamptz not null default now()
);

create index if not exists task_comments_task_date_idx
   on public.task_comments(task_id, occurrence_date, created_at);

create or replace function public.set_task_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at = now();
   return new;
end;
$$;

drop trigger if exists task_members_updated_at on public.task_members;
create trigger task_members_updated_at
before update on public.task_members
for each row
execute function public.set_task_updated_at();

drop trigger if exists task_templates_updated_at on public.task_templates;
create trigger task_templates_updated_at
before update on public.task_templates
for each row
execute function public.set_task_updated_at();

alter table public.task_members enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_comments enable row level security;

-- This feature is accessed through authenticated Next.js API routes that use
-- the service role key. RLS is enabled so browser clients cannot read or write
-- these tables directly with the anon key. Users do not receive task access
-- automatically; they must exist in task_members, except configured managers
-- in TASK_MANAGER_USER_IDS / ADMIN_USER_IDS who are created by the API.

-- Example setup after staff users have logged in at least once:
-- insert into public.task_members (user_id, role, display_name)
-- values ('MANAGER_AUTH_USER_ID', 'manager', 'Manager name')
-- on conflict (user_id) do update
-- set role = 'manager',
--     manager_id = null,
--     display_name = excluded.display_name,
--     active = true;
--
-- insert into public.task_members (user_id, role, manager_id, display_name)
-- values
--    ('REPORT_1_AUTH_USER_ID', 'report', 'MANAGER_AUTH_USER_ID', 'Report 1 name'),
--    ('REPORT_2_AUTH_USER_ID', 'coordinator', 'MANAGER_AUTH_USER_ID', 'Sevinch'),
--    ('REPORT_3_AUTH_USER_ID', 'report', 'MANAGER_AUTH_USER_ID', 'Report 3 name')
-- on conflict (user_id) do update
-- set role = excluded.role,
--     manager_id = excluded.manager_id,
--     display_name = excluded.display_name,
--     active = true;
