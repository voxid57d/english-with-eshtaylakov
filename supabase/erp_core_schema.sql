create extension if not exists "pgcrypto";

do $$ begin
   create type public.erp_staff_role as enum (
      'admin',
      'branch_manager',
      'sales_manager',
      'salesman',
      'assistant',
      'cashier'
   );
exception
   when duplicate_object then null;
end $$;

do $$ begin
   create type public.erp_shift_status as enum (
      'scheduled',
      'completed',
      'late',
      'absent',
      'day_off',
      'sick_leave',
      'approved_leave'
   );
exception
   when duplicate_object then null;
end $$;

create table if not exists public.branches (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   address text,
   phone text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.staff_profiles (
   user_id uuid primary key references auth.users(id) on delete cascade,
   full_name text not null,
   role public.erp_staff_role not null,
   primary_branch_id uuid references public.branches(id) on delete set null,
   telegram_username text,
   phone text,
   notes text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.staff_branch_assignments (
   staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
   branch_id uuid not null references public.branches(id) on delete cascade,
   created_at timestamptz not null default now(),
   primary key (staff_user_id, branch_id)
);

create table if not exists public.kpi_definitions (
   id uuid primary key default gen_random_uuid(),
   name text not null,
   description text,
   role public.erp_staff_role not null,
   unit text not null default 'count',
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.kpi_targets (
   id uuid primary key default gen_random_uuid(),
   kpi_definition_id uuid not null references public.kpi_definitions(id) on delete cascade,
   staff_user_id uuid references public.staff_profiles(user_id) on delete cascade,
   branch_id uuid references public.branches(id) on delete cascade,
   period_start date not null,
   period_end date not null,
   target_value numeric(12, 2) not null,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint kpi_targets_period_order check (period_end >= period_start),
   constraint kpi_targets_owner_check check (staff_user_id is not null or branch_id is not null)
);

create table if not exists public.kpi_progress_entries (
   id uuid primary key default gen_random_uuid(),
   kpi_target_id uuid not null references public.kpi_targets(id) on delete cascade,
   entry_date date not null,
   value numeric(12, 2) not null,
   note text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now()
);

create table if not exists public.shifts (
   id uuid primary key default gen_random_uuid(),
   staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
   branch_id uuid not null references public.branches(id) on delete cascade,
   shift_date date not null,
   starts_at time not null,
   ends_at time not null,
   break_minutes integer not null default 0 check (break_minutes >= 0),
   status public.erp_shift_status not null default 'scheduled',
   approved_by uuid references auth.users(id) on delete set null,
   hourly_rate_override numeric(12, 2),
   extra_hourly_rate_override numeric(12, 2),
   extra_hours_enabled_override boolean,
   note text,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.daily_metrics (
   id uuid primary key default gen_random_uuid(),
   branch_id uuid not null references public.branches(id) on delete cascade,
   metric_date date not null,
   leads_count integer not null default 0,
   trial_lessons_count integer not null default 0,
   conversions_count integer not null default 0,
   active_students_count integer not null default 0,
   revenue_amount numeric(12, 2) not null default 0,
   debt_amount numeric(12, 2) not null default 0,
   refunds_amount numeric(12, 2) not null default 0,
   attendance_count integer not null default 0,
   note text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (branch_id, metric_date)
);

create table if not exists public.cashier_debtor_metrics (
   id uuid primary key default gen_random_uuid(),
   cashier_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
   branch_id uuid not null references public.branches(id) on delete cascade,
   metric_date date not null,
   entry_type text not null check (entry_type in ('daily', 'morning', 'evening')),
   current_debtors integer not null default 0 check (current_debtors >= 0),
   frozen_debtors integer not null default 0 check (frozen_debtors >= 0),
   archive_debtors integer not null default 0 check (archive_debtors >= 0),
   finished_debtors integer not null default 0 check (finished_debtors >= 0),
   active_students integer not null default 0 check (active_students >= 0),
   archive_students integer not null default 0 check (archive_students >= 0),
   finished_students integer not null default 0 check (finished_students >= 0),
   total_debtors integer not null default 0 check (total_debtors >= 0),
   total_students integer not null default 0 check (total_students >= 0),
   debtor_percentage numeric(7, 2) not null default 0 check (debtor_percentage >= 0),
   note text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (cashier_user_id, branch_id, metric_date, entry_type)
);

create table if not exists public.erp_role_permissions (
   role public.erp_staff_role not null,
   module text not null check (
      module in (
         'overview',
         'branches',
         'staff',
         'tasks',
         'kpi',
         'shifts',
         'teachers',
         'metrics',
         'settings'
      )
   ),
   can_view boolean not null default false,
   can_manage boolean not null default false,
   updated_at timestamptz not null default now(),
   primary key (role, module),
   constraint erp_role_permissions_manage_requires_view check (
      can_manage = false or can_view = true
   )
);

create table if not exists public.erp_role_compensation_settings (
   role public.erp_staff_role primary key,
   hourly_rate numeric(12, 2) not null default 0 check (hourly_rate >= 0),
   extra_hours_enabled boolean not null default false,
   extra_hourly_rate numeric(12, 2) not null default 0 check (extra_hourly_rate >= 0),
   extra_hours_threshold numeric(5, 2) not null default 8 check (extra_hours_threshold >= 0),
   updated_at timestamptz not null default now()
);

create table if not exists public.staff_working_hours (
   id uuid primary key default gen_random_uuid(),
   staff_user_id uuid not null references public.staff_profiles(user_id) on delete cascade,
   branch_id uuid references public.branches(id) on delete set null,
   weekday integer not null check (weekday between 1 and 7),
   starts_at time not null,
   ends_at time not null,
   break_minutes integer not null default 0 check (break_minutes >= 0),
   active boolean not null default true,
   note text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (staff_user_id, weekday)
);

create table if not exists public.teacher_profiles (
   id uuid primary key default gen_random_uuid(),
   full_name text not null,
   phone text,
   birthday date,
   ielts_score numeric(3, 1) check (ielts_score is null or (ielts_score >= 0 and ielts_score <= 9)),
   celta_certified boolean not null default false,
   started_working_on date,
   stage text,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.teacher_group_levels (
   id uuid primary key default gen_random_uuid(),
   name text not null unique,
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create table if not exists public.teacher_lesson_groups (
   id uuid primary key default gen_random_uuid(),
   teacher_id uuid not null references public.teacher_profiles(id) on delete cascade,
   level_id uuid not null references public.teacher_group_levels(id) on delete restrict,
   starts_on date not null,
   ends_on date,
   starts_at time not null,
   ends_at time not null,
   weekdays integer[] not null,
   active_students_count integer not null default 0 check (active_students_count >= 0),
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint teacher_lesson_groups_date_order check (ends_on is null or ends_on >= starts_on),
   constraint teacher_lesson_groups_time_order check (ends_at > starts_at),
   constraint teacher_lesson_groups_weekdays_check check (
      array_length(weekdays, 1) is not null
      and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]
   )
);

create table if not exists public.teacher_lesson_covers (
   id uuid primary key default gen_random_uuid(),
   lesson_group_id uuid not null references public.teacher_lesson_groups(id) on delete cascade,
   cover_date date not null,
   covering_teacher_id uuid references public.teacher_profiles(id) on delete set null,
   covering_teacher_name text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (lesson_group_id, cover_date),
   constraint teacher_lesson_covers_coverer_check check (
      covering_teacher_id is not null
      or nullif(btrim(coalesce(covering_teacher_name, '')), '') is not null
   )
);

create table if not exists public.teacher_lesson_holidays (
   id uuid primary key default gen_random_uuid(),
   holiday_date date not null unique,
   note text,
   created_by uuid references auth.users(id) on delete set null,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

alter table public.erp_role_permissions
   drop constraint if exists erp_role_permissions_module_check;

alter table public.erp_role_permissions
   add constraint erp_role_permissions_module_check check (
      module in (
         'overview',
         'branches',
         'staff',
         'tasks',
         'kpi',
         'shifts',
         'teachers',
         'metrics',
         'settings'
      )
   );

create index if not exists staff_profiles_role_idx on public.staff_profiles(role, active);
create index if not exists staff_profiles_primary_branch_idx on public.staff_profiles(primary_branch_id);
create index if not exists kpi_targets_period_idx on public.kpi_targets(period_start, period_end);
create index if not exists kpi_progress_entries_target_date_idx on public.kpi_progress_entries(kpi_target_id, entry_date);
create index if not exists shifts_branch_date_idx on public.shifts(branch_id, shift_date);
create index if not exists shifts_staff_date_idx on public.shifts(staff_user_id, shift_date);
create index if not exists daily_metrics_branch_date_idx on public.daily_metrics(branch_id, metric_date);
create index if not exists cashier_debtor_metrics_cashier_date_idx
   on public.cashier_debtor_metrics(cashier_user_id, metric_date, entry_type);
create index if not exists cashier_debtor_metrics_branch_date_idx
   on public.cashier_debtor_metrics(branch_id, metric_date, entry_type);
create index if not exists staff_working_hours_staff_weekday_idx
   on public.staff_working_hours(staff_user_id, weekday, active);
create index if not exists staff_working_hours_branch_idx
   on public.staff_working_hours(branch_id, active);
create index if not exists teacher_profiles_active_name_idx
   on public.teacher_profiles(active, full_name);
create index if not exists teacher_lesson_groups_teacher_idx
   on public.teacher_lesson_groups(teacher_id, active, starts_on, ends_on);
create index if not exists teacher_lesson_covers_group_date_idx
   on public.teacher_lesson_covers(lesson_group_id, cover_date);
create index if not exists teacher_lesson_holidays_date_idx
   on public.teacher_lesson_holidays(holiday_date);

insert into public.erp_role_permissions (role, module, can_view, can_manage)
values
   ('admin', 'overview', true, false),
   ('admin', 'branches', true, true),
   ('admin', 'staff', true, true),
   ('admin', 'tasks', true, true),
   ('admin', 'kpi', true, true),
   ('admin', 'shifts', true, true),
   ('admin', 'teachers', true, true),
   ('admin', 'metrics', true, true),
   ('admin', 'settings', true, true),
   ('branch_manager', 'overview', true, false),
   ('branch_manager', 'branches', true, true),
   ('branch_manager', 'staff', true, true),
   ('branch_manager', 'tasks', true, true),
   ('branch_manager', 'kpi', true, true),
   ('branch_manager', 'shifts', true, true),
   ('branch_manager', 'teachers', true, true),
   ('branch_manager', 'metrics', true, true),
   ('branch_manager', 'settings', true, true),
   ('sales_manager', 'overview', true, false),
   ('sales_manager', 'branches', true, false),
   ('sales_manager', 'staff', false, false),
   ('sales_manager', 'tasks', true, true),
   ('sales_manager', 'kpi', true, true),
   ('sales_manager', 'shifts', true, true),
   ('sales_manager', 'teachers', true, true),
   ('sales_manager', 'metrics', true, true),
   ('sales_manager', 'settings', false, false),
   ('salesman', 'overview', true, false),
   ('salesman', 'branches', false, false),
   ('salesman', 'staff', false, false),
   ('salesman', 'tasks', true, false),
   ('salesman', 'kpi', true, false),
   ('salesman', 'shifts', true, false),
   ('salesman', 'teachers', false, false),
   ('salesman', 'metrics', false, false),
   ('salesman', 'settings', false, false),
   ('assistant', 'overview', true, false),
   ('assistant', 'branches', true, false),
   ('assistant', 'staff', false, false),
   ('assistant', 'tasks', true, false),
   ('assistant', 'kpi', true, false),
   ('assistant', 'shifts', true, false),
   ('assistant', 'teachers', false, false),
   ('assistant', 'metrics', true, true),
   ('assistant', 'settings', false, false),
   ('cashier', 'overview', true, false),
   ('cashier', 'branches', true, false),
   ('cashier', 'staff', false, false),
   ('cashier', 'tasks', true, false),
   ('cashier', 'kpi', true, false),
   ('cashier', 'shifts', true, false),
   ('cashier', 'teachers', false, false),
   ('cashier', 'metrics', true, true),
   ('cashier', 'settings', false, false)
on conflict (role, module) do nothing;

insert into public.erp_role_compensation_settings (
   role,
   hourly_rate,
   extra_hours_enabled,
   extra_hourly_rate,
   extra_hours_threshold
)
values
   ('sales_manager', 0, true, 0, 8),
   ('salesman', 0, true, 0, 8),
   ('assistant', 0, true, 0, 8),
   ('cashier', 0, true, 0, 8)
on conflict (role) do nothing;

update public.erp_role_permissions
set can_view = true,
    can_manage = true
where role = 'branch_manager'
  and module in ('branches', 'staff', 'tasks', 'kpi', 'shifts', 'teachers', 'metrics', 'settings');

update public.erp_role_permissions
set can_view = true,
    can_manage = true
where role = 'sales_manager'
  and module = 'teachers';

delete from public.erp_role_compensation_settings
where role in ('admin', 'branch_manager');

update public.erp_role_permissions
set can_view = true,
    can_manage = true
where role = 'sales_manager'
  and module = 'shifts';

update public.erp_role_permissions
set can_view = true,
    can_manage = false
where role in ('salesman', 'assistant', 'cashier')
  and module = 'shifts';

update public.staff_profiles
set role = 'branch_manager'
where role = 'admin';

alter table if exists public.task_templates
   add column if not exists branch_id uuid references public.branches(id) on delete set null;

alter table if exists public.shifts
   add column if not exists break_minutes integer not null default 0,
   add column if not exists hourly_rate_override numeric(12, 2),
   add column if not exists extra_hourly_rate_override numeric(12, 2),
   add column if not exists extra_hours_enabled_override boolean;

create index if not exists task_templates_branch_id_idx
   on public.task_templates(branch_id, active, start_date, end_date);

create or replace function public.set_erp_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at = now();
   return new;
end;
$$;

drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at
before update on public.branches
for each row
execute function public.set_erp_updated_at();

drop trigger if exists staff_profiles_updated_at on public.staff_profiles;
create trigger staff_profiles_updated_at
before update on public.staff_profiles
for each row
execute function public.set_erp_updated_at();

drop trigger if exists kpi_definitions_updated_at on public.kpi_definitions;
create trigger kpi_definitions_updated_at
before update on public.kpi_definitions
for each row
execute function public.set_erp_updated_at();

drop trigger if exists kpi_targets_updated_at on public.kpi_targets;
create trigger kpi_targets_updated_at
before update on public.kpi_targets
for each row
execute function public.set_erp_updated_at();

drop trigger if exists shifts_updated_at on public.shifts;
create trigger shifts_updated_at
before update on public.shifts
for each row
execute function public.set_erp_updated_at();

drop trigger if exists daily_metrics_updated_at on public.daily_metrics;
create trigger daily_metrics_updated_at
before update on public.daily_metrics
for each row
execute function public.set_erp_updated_at();

drop trigger if exists cashier_debtor_metrics_updated_at on public.cashier_debtor_metrics;
create trigger cashier_debtor_metrics_updated_at
before update on public.cashier_debtor_metrics
for each row
execute function public.set_erp_updated_at();

drop trigger if exists erp_role_permissions_updated_at on public.erp_role_permissions;
create trigger erp_role_permissions_updated_at
before update on public.erp_role_permissions
for each row
execute function public.set_erp_updated_at();

drop trigger if exists erp_role_compensation_settings_updated_at on public.erp_role_compensation_settings;
create trigger erp_role_compensation_settings_updated_at
before update on public.erp_role_compensation_settings
for each row
execute function public.set_erp_updated_at();

drop trigger if exists staff_working_hours_updated_at on public.staff_working_hours;
create trigger staff_working_hours_updated_at
before update on public.staff_working_hours
for each row
execute function public.set_erp_updated_at();

drop trigger if exists teacher_profiles_updated_at on public.teacher_profiles;
create trigger teacher_profiles_updated_at
before update on public.teacher_profiles
for each row
execute function public.set_erp_updated_at();

drop trigger if exists teacher_group_levels_updated_at on public.teacher_group_levels;
create trigger teacher_group_levels_updated_at
before update on public.teacher_group_levels
for each row
execute function public.set_erp_updated_at();

drop trigger if exists teacher_lesson_groups_updated_at on public.teacher_lesson_groups;
create trigger teacher_lesson_groups_updated_at
before update on public.teacher_lesson_groups
for each row
execute function public.set_erp_updated_at();

drop trigger if exists teacher_lesson_covers_updated_at on public.teacher_lesson_covers;
create trigger teacher_lesson_covers_updated_at
before update on public.teacher_lesson_covers
for each row
execute function public.set_erp_updated_at();

drop trigger if exists teacher_lesson_holidays_updated_at on public.teacher_lesson_holidays;
create trigger teacher_lesson_holidays_updated_at
before update on public.teacher_lesson_holidays
for each row
execute function public.set_erp_updated_at();

alter table public.branches enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_branch_assignments enable row level security;
alter table public.kpi_definitions enable row level security;
alter table public.kpi_targets enable row level security;
alter table public.kpi_progress_entries enable row level security;
alter table public.shifts enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.cashier_debtor_metrics enable row level security;
alter table public.erp_role_permissions enable row level security;
alter table public.erp_role_compensation_settings enable row level security;
alter table public.staff_working_hours enable row level security;
alter table public.teacher_profiles enable row level security;
alter table public.teacher_group_levels enable row level security;
alter table public.teacher_lesson_groups enable row level security;
alter table public.teacher_lesson_covers enable row level security;
alter table public.teacher_lesson_holidays enable row level security;

-- First version access pattern:
-- keep browser clients blocked by RLS and access these tables through
-- authenticated Next.js API routes that use the service role key.
-- After module forms are implemented, add narrow RLS policies if direct
-- Supabase client access becomes useful.
