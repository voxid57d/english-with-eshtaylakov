create table if not exists public.user_feedback (
   id uuid primary key default gen_random_uuid(),
   user_id uuid not null references auth.users(id) on delete cascade,
   message text not null,
   status text not null default 'new' check (status in ('new', 'reviewed')),
   reviewed_by uuid references auth.users(id) on delete set null,
   reviewed_at timestamptz,
   created_at timestamptz not null default timezone('utc', now()),
   updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_user_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at = timezone('utc', now());
   return new;
end;
$$;

drop trigger if exists user_feedback_set_updated_at on public.user_feedback;
create trigger user_feedback_set_updated_at
before update on public.user_feedback
for each row
execute function public.set_user_feedback_updated_at();
