-- Run after erp_core_schema.sql. Statistics is shared across the staff workspace.
begin;

alter table public.erp_role_permissions drop constraint if exists erp_role_permissions_module_check;
alter table public.erp_role_permissions add constraint erp_role_permissions_module_check
   check (module in ('overview', 'branches', 'staff', 'tasks', 'kpi', 'shifts', 'teachers', 'metrics', 'marketing', 'statistics', 'settings'));

insert into public.erp_role_permissions (role, module, can_view, can_manage)
select role, 'statistics', role::text in ('admin', 'branch_manager', 'sales_manager'),
   role::text in ('admin', 'branch_manager', 'sales_manager')
from unnest(enum_range(null::public.erp_staff_role)) as role
on conflict (role, module) do nothing;

create table if not exists public.statistics_categories (
   id uuid primary key default gen_random_uuid(),
   name text not null check (char_length(btrim(name)) between 1 and 80),
   color text not null default '#10b981' check (color ~ '^#[0-9A-Fa-f]{6}$'),
   unit text not null default 'number' check (unit in ('number', 'UZS', 'USD', 'percent')),
   created_at timestamptz not null default now()
);
create unique index if not exists statistics_categories_name_key on public.statistics_categories(lower(btrim(name)));

create table if not exists public.statistics_entries (
   category_id uuid not null references public.statistics_categories(id) on delete restrict,
   entry_date date not null check (entry_date between '1900-01-01' and '2199-12-31'),
   value numeric(14, 2) not null check (value between -999999999999.99 and 999999999999.99),
   updated_by uuid references auth.users(id) on delete set null,
   updated_at timestamptz not null default now(),
   primary key (category_id, entry_date)
);
create index if not exists statistics_entries_date_idx on public.statistics_entries(entry_date, category_id);

alter table public.statistics_categories enable row level security;
alter table public.statistics_entries enable row level security;
revoke all on public.statistics_categories, public.statistics_entries from anon, authenticated;
grant all on public.statistics_categories, public.statistics_entries to service_role;

-- Saving corrections and clearing observations is one atomic transaction.
create or replace function public.save_statistics_entries(changes jsonb, actor uuid)
returns void language plpgsql set search_path = public as $$
begin
   if jsonb_typeof(changes) is distinct from 'array' then
      raise exception 'Expected an array of changes.';
   end if;
   if jsonb_array_length(changes) not between 1 and 5000 then
      raise exception 'Expected 1 to 5000 changes.';
   end if;
   delete from public.statistics_entries e using jsonb_to_recordset(changes)
      as c(category_id uuid, entry_date date, value numeric)
      where c.value is null and e.category_id = c.category_id and e.entry_date = c.entry_date;
   insert into public.statistics_entries (category_id, entry_date, value, updated_by)
      select category_id, entry_date, value, actor
      from jsonb_to_recordset(changes) as c(category_id uuid, entry_date date, value numeric)
      where value is not null
      on conflict (category_id, entry_date) do update
         set value = excluded.value, updated_by = actor, updated_at = now();
end;
$$;
revoke all on function public.save_statistics_entries(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_statistics_entries(jsonb, uuid) to service_role;

-- Lock the parent before deleting its observations, so concurrent saves cannot
-- create a new observation between the two deletes. Both deletes are atomic.
create or replace function public.delete_statistics_category(target_category_id uuid)
returns boolean language plpgsql set search_path = public as $$
begin
   perform id from public.statistics_categories where id = target_category_id for update;
   if not found then return false; end if;
   delete from public.statistics_entries where category_id = target_category_id;
   delete from public.statistics_categories where id = target_category_id;
   return true;
end;
$$;
revoke all on function public.delete_statistics_category(uuid) from public, anon, authenticated;
grant execute on function public.delete_statistics_category(uuid) to service_role;
commit;
