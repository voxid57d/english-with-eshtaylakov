-- Run after erp_core_schema.sql. Shared staff workspace; API enforces ERP permissions.
begin;

alter table public.erp_role_permissions drop constraint if exists erp_role_permissions_module_check;
alter table public.erp_role_permissions add constraint erp_role_permissions_module_check
   check (module in ('overview', 'branches', 'staff', 'tasks', 'kpi', 'shifts', 'teachers', 'metrics', 'marketing', 'statistics', 'settings'));

insert into public.erp_role_permissions (role, module, can_view, can_manage)
select role, 'marketing', role::text in ('admin', 'branch_manager', 'sales_manager'),
   role::text in ('admin', 'branch_manager', 'sales_manager')
from unnest(enum_range(null::public.erp_staff_role)) as role
on conflict (role, module) do nothing;

create table if not exists public.marketing_centres (
   id uuid primary key default gen_random_uuid(),
   name text not null check (char_length(btrim(name)) between 1 and 80),
   color text not null default '#10b981' check (color ~ '^#[0-9A-Fa-f]{6}$'),
   created_at timestamptz not null default now()
);
create unique index if not exists marketing_centres_name_key on public.marketing_centres(lower(btrim(name)));

create table if not exists public.marketing_platforms (
   id uuid primary key default gen_random_uuid(),
   name text not null check (char_length(btrim(name)) between 1 and 60),
   created_at timestamptz not null default now()
);
create unique index if not exists marketing_platforms_name_key on public.marketing_platforms(lower(btrim(name)));

-- Small embedded PNG logos also travel with standalone chart JPG exports.
alter table public.marketing_platforms add column if not exists logo_data_url text
   check (logo_data_url is null or (char_length(logo_data_url) <= 350000
      and logo_data_url ~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$'));

-- Each learning centre has its own profile URL on each platform, across all months.
create table if not exists public.marketing_profile_links (
   centre_id uuid not null references public.marketing_centres(id) on delete cascade,
   platform_id uuid not null references public.marketing_platforms(id) on delete cascade,
   url text not null check (char_length(url) between 1 and 2048 and url ~ '^https?://'),
   primary key (centre_id, platform_id)
);
alter table public.marketing_profile_links enable row level security;
revoke all on public.marketing_profile_links from anon, authenticated;
grant all on public.marketing_profile_links to service_role;

create table if not exists public.marketing_entries (
   centre_id uuid not null references public.marketing_centres(id) on delete restrict,
   platform_id uuid not null references public.marketing_platforms(id) on delete restrict,
   entry_date date not null check (entry_date between '1900-01-01' and '2199-12-31'),
   subscribers bigint not null check (subscribers between 0 and 999999999999),
   updated_by uuid references auth.users(id) on delete set null,
   updated_at timestamptz not null default now(),
   primary key (centre_id, platform_id, entry_date)
);
create index if not exists marketing_entries_date_idx on public.marketing_entries(entry_date, centre_id, platform_id);

alter table public.marketing_centres enable row level security;
alter table public.marketing_platforms enable row level security;
alter table public.marketing_entries enable row level security;
revoke all on public.marketing_centres, public.marketing_platforms, public.marketing_entries from anon, authenticated;
grant all on public.marketing_centres, public.marketing_platforms, public.marketing_entries to service_role;

-- A whole save succeeds or fails together, including cleared cells.
create or replace function public.save_marketing_entries(changes jsonb, actor uuid)
returns void language plpgsql set search_path = public as $$
begin
   if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) not between 1 and 5000 then
      raise exception 'Expected 1 to 5000 changes.';
   end if;
   delete from public.marketing_entries e using jsonb_to_recordset(changes)
      as c(centre_id uuid, platform_id uuid, entry_date date, subscribers bigint)
      where c.subscribers is null and e.centre_id = c.centre_id
         and e.platform_id = c.platform_id and e.entry_date = c.entry_date;
   insert into public.marketing_entries (centre_id, platform_id, entry_date, subscribers, updated_by)
      select centre_id, platform_id, entry_date, subscribers, actor
      from jsonb_to_recordset(changes) as c(centre_id uuid, platform_id uuid, entry_date date, subscribers bigint)
      where subscribers is not null
      on conflict (centre_id, platform_id, entry_date) do update
         set subscribers = excluded.subscribers, updated_by = actor, updated_at = now();
end;
$$;
revoke all on function public.save_marketing_entries(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_marketing_entries(jsonb, uuid) to service_role;

insert into public.marketing_platforms (name) values ('Instagram'), ('YouTube'), ('Telegram') on conflict do nothing;
commit;
