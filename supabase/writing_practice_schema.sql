create table if not exists public.writing_prompts (
   id uuid primary key default gen_random_uuid(),
   task_number integer not null check (task_number in (1, 2)),
   title text not null,
   prompt_text text not null,
   image_url text,
   sort_order integer not null default 0,
   updated_at timestamptz not null default timezone('utc', now()),
   created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.writing_submissions (
   id uuid primary key default gen_random_uuid(),
   user_id uuid not null references auth.users(id) on delete cascade,
   prompt_id uuid not null references public.writing_prompts(id) on delete cascade,
   task_number integer not null check (task_number in (1, 2)),
   answer_text text not null default '',
   status text not null default 'draft' check (
      status in ('draft', 'pending_feedback', 'feedback_ready')
   ),
   submitted_for_feedback_at timestamptz,
   feedback_text text,
   feedback_images text[] not null default '{}',
   feedback_given_by uuid references auth.users(id) on delete set null,
   feedback_given_at timestamptz,
   updated_at timestamptz not null default timezone('utc', now()),
   created_at timestamptz not null default timezone('utc', now()),
   unique (user_id, prompt_id)
);

create or replace function public.set_writing_updated_at()
returns trigger
language plpgsql
as $$
begin
   new.updated_at = timezone('utc', now());
   return new;
end;
$$;

drop trigger if exists writing_prompts_set_updated_at on public.writing_prompts;
create trigger writing_prompts_set_updated_at
before update on public.writing_prompts
for each row
execute function public.set_writing_updated_at();

drop trigger if exists writing_submissions_set_updated_at on public.writing_submissions;
create trigger writing_submissions_set_updated_at
before update on public.writing_submissions
for each row
execute function public.set_writing_updated_at();

insert into public.writing_prompts (
   task_number,
   title,
   prompt_text,
   image_url,
   sort_order
)
values
   (
      1,
      'Test 1',
      'The graph below shows a sample IELTS Writing Task 1 prompt. Replace this with your real prompt text in the admin panel.',
      null,
      1
   ),
   (
      2,
      'Test 1',
      'Some people believe that online learning will replace traditional classrooms completely. To what extent do you agree or disagree?',
      null,
      1
   )
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('writing-feedback', 'writing-feedback', true)
on conflict (id) do nothing;
