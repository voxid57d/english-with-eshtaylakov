create extension if not exists "pgcrypto";

do $$ begin
   create type public.finance_entry_type as enum ('expense', 'income', 'savings');
exception
   when duplicate_object then null;
end $$;

do $$ begin
   create type public.finance_currency as enum ('UZS', 'USD');
exception
   when duplicate_object then null;
end $$;

create table if not exists public.finance_categories (
   id uuid primary key default gen_random_uuid(),
   owner_user_id uuid not null references auth.users(id) on delete cascade,
   name text not null check (char_length(btrim(name)) between 1 and 80),
   entry_type public.finance_entry_type not null,
   color text not null default '#657568' check (color ~ '^#[0-9A-Fa-f]{6}$'),
   icon text not null default 'circle' check (char_length(icon) between 1 and 40),
   active boolean not null default true,
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now()
);

create unique index if not exists finance_categories_owner_type_name_key
   on public.finance_categories(owner_user_id, entry_type, lower(name));

create table if not exists public.finance_transactions (
   id uuid primary key default gen_random_uuid(),
   owner_user_id uuid not null references auth.users(id) on delete cascade,
   category_id uuid not null references public.finance_categories(id) on delete restrict,
   entry_type public.finance_entry_type not null,
   amount numeric(16, 2) not null check (amount > 0),
   currency public.finance_currency not null default 'UZS',
   exchange_rate_to_uzs numeric(16, 4) not null default 1 check (exchange_rate_to_uzs > 0),
   entry_date date not null default current_date,
   note text check (note is null or char_length(note) <= 240),
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   constraint finance_transactions_uzs_rate_check check (
      currency <> 'UZS' or exchange_rate_to_uzs = 1
   )
);

create index if not exists finance_transactions_owner_date_idx
   on public.finance_transactions(owner_user_id, entry_date desc);
create index if not exists finance_transactions_category_idx
   on public.finance_transactions(category_id, entry_date desc);

create table if not exists public.finance_budgets (
   id uuid primary key default gen_random_uuid(),
   owner_user_id uuid not null references auth.users(id) on delete cascade,
   category_id uuid not null references public.finance_categories(id) on delete cascade,
   month_start date not null check (month_start = date_trunc('month', month_start)::date),
   amount numeric(16, 2) not null check (amount > 0),
   currency public.finance_currency not null default 'UZS',
   created_at timestamptz not null default now(),
   updated_at timestamptz not null default now(),
   unique (owner_user_id, category_id, month_start)
);

create index if not exists finance_budgets_owner_month_idx
   on public.finance_budgets(owner_user_id, month_start);

create or replace function public.set_private_finance_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at = now();
   return new;
end;
$$;

drop trigger if exists finance_categories_updated_at on public.finance_categories;
create trigger finance_categories_updated_at
before update on public.finance_categories
for each row execute function public.set_private_finance_updated_at();

drop trigger if exists finance_transactions_updated_at on public.finance_transactions;
create trigger finance_transactions_updated_at
before update on public.finance_transactions
for each row execute function public.set_private_finance_updated_at();

drop trigger if exists finance_budgets_updated_at on public.finance_budgets;
create trigger finance_budgets_updated_at
before update on public.finance_budgets
for each row execute function public.set_private_finance_updated_at();

alter table public.finance_categories enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_budgets enable row level security;

drop policy if exists "Owner manages finance categories" on public.finance_categories;
create policy "Owner manages finance categories"
on public.finance_categories for all
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "Owner manages finance transactions" on public.finance_transactions;
create policy "Owner manages finance transactions"
on public.finance_transactions for all
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "Owner manages finance budgets" on public.finance_budgets;
create policy "Owner manages finance budgets"
on public.finance_budgets for all
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

-- Optional starter categories. Replace the UUID before running this block.
-- insert into public.finance_categories (owner_user_id, name, entry_type, color, icon)
-- values
--   ('YOUR_AUTH_USER_UUID', 'Food', 'expense', '#E26D5A', 'food'),
--   ('YOUR_AUTH_USER_UUID', 'Salary', 'income', '#4F8F67', 'salary'),
--   ('YOUR_AUTH_USER_UUID', 'Emergency fund', 'savings', '#5B7DB1', 'savings');
