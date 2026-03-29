create extension if not exists pgcrypto;

create table if not exists public.reading_mock_tests (
   id uuid primary key default gen_random_uuid(),
   slug text not null unique,
   title text not null,
   description text,
   is_premium boolean not null default false,
   is_published boolean not null default true,
   created_at timestamptz not null default now()
);

create table if not exists public.reading_mock_passages (
   id uuid primary key default gen_random_uuid(),
   test_id uuid not null references public.reading_mock_tests(id) on delete cascade,
   passage_number integer not null,
   label text not null,
   title text not null,
   subtitle text,
   content_blocks jsonb not null default '[]'::jsonb,
   created_at timestamptz not null default now()
);

create unique index if not exists reading_mock_passages_test_id_number_idx
   on public.reading_mock_passages(test_id, passage_number);

create table if not exists public.reading_mock_question_blocks (
   id uuid primary key default gen_random_uuid(),
   test_id uuid not null references public.reading_mock_tests(id) on delete cascade,
   passage_id uuid not null references public.reading_mock_passages(id) on delete cascade,
   order_index integer not null default 0,
   type text not null,
   title text not null,
   instructions jsonb not null default '[]'::jsonb,
   shared_content jsonb not null default '{}'::jsonb,
   meta jsonb not null default '{}'::jsonb,
   created_at timestamptz not null default now()
);

create index if not exists reading_mock_question_blocks_passage_id_idx
   on public.reading_mock_question_blocks(passage_id, order_index);

create table if not exists public.reading_mock_questions (
   id uuid primary key default gen_random_uuid(),
   test_id uuid not null references public.reading_mock_tests(id) on delete cascade,
   passage_id uuid not null references public.reading_mock_passages(id) on delete cascade,
   block_id uuid not null references public.reading_mock_question_blocks(id) on delete cascade,
   question_number integer not null,
   order_index integer not null default 0,
   type text not null,
   prompt text not null,
   answer_key jsonb,
   meta jsonb not null default '{}'::jsonb,
   created_at timestamptz not null default now()
);

create unique index if not exists reading_mock_questions_test_id_number_idx
   on public.reading_mock_questions(test_id, question_number);

create index if not exists reading_mock_questions_block_id_idx
   on public.reading_mock_questions(block_id, order_index, question_number);

create table if not exists public.reading_mock_options (
   id uuid primary key default gen_random_uuid(),
   question_id uuid not null references public.reading_mock_questions(id) on delete cascade,
   label text not null,
   text text not null,
   order_index integer not null default 0
);

create index if not exists reading_mock_options_question_id_idx
   on public.reading_mock_options(question_id, order_index);

create table if not exists public.reading_mock_attempts (
   id uuid primary key default gen_random_uuid(),
   user_id uuid not null references auth.users(id) on delete cascade,
   test_id uuid not null references public.reading_mock_tests(id) on delete cascade,
   score_raw integer,
   total_questions integer,
   duration_seconds integer,
   submitted_at timestamptz not null default now()
);

create index if not exists reading_mock_attempts_user_id_idx
   on public.reading_mock_attempts(user_id, submitted_at desc);

create table if not exists public.reading_mock_answers (
   id uuid primary key default gen_random_uuid(),
   attempt_id uuid not null references public.reading_mock_attempts(id) on delete cascade,
   question_id uuid not null references public.reading_mock_questions(id) on delete cascade,
   answer_text text,
   is_correct boolean,
   created_at timestamptz not null default now()
);

create index if not exists reading_mock_answers_attempt_id_idx
   on public.reading_mock_answers(attempt_id);

alter table public.reading_mock_tests enable row level security;
alter table public.reading_mock_passages enable row level security;
alter table public.reading_mock_question_blocks enable row level security;
alter table public.reading_mock_questions enable row level security;
alter table public.reading_mock_options enable row level security;
alter table public.reading_mock_attempts enable row level security;
alter table public.reading_mock_answers enable row level security;

drop policy if exists "Published reading mock tests are viewable by authenticated users" on public.reading_mock_tests;
create policy "Published reading mock tests are viewable by authenticated users"
on public.reading_mock_tests
for select
to authenticated
using (is_published = true);

drop policy if exists "Reading mock passages are viewable by authenticated users" on public.reading_mock_passages;
create policy "Reading mock passages are viewable by authenticated users"
on public.reading_mock_passages
for select
to authenticated
using (
   exists (
      select 1
      from public.reading_mock_tests tests
      where tests.id = reading_mock_passages.test_id
      and tests.is_published = true
   )
);

drop policy if exists "Reading mock blocks are viewable by authenticated users" on public.reading_mock_question_blocks;
create policy "Reading mock blocks are viewable by authenticated users"
on public.reading_mock_question_blocks
for select
to authenticated
using (
   exists (
      select 1
      from public.reading_mock_tests tests
      where tests.id = reading_mock_question_blocks.test_id
      and tests.is_published = true
   )
);

drop policy if exists "Reading mock questions are viewable by authenticated users" on public.reading_mock_questions;
create policy "Reading mock questions are viewable by authenticated users"
on public.reading_mock_questions
for select
to authenticated
using (
   exists (
      select 1
      from public.reading_mock_tests tests
      where tests.id = reading_mock_questions.test_id
      and tests.is_published = true
   )
);

drop policy if exists "Reading mock options are viewable by authenticated users" on public.reading_mock_options;
create policy "Reading mock options are viewable by authenticated users"
on public.reading_mock_options
for select
to authenticated
using (
   exists (
      select 1
      from public.reading_mock_questions questions
      join public.reading_mock_tests tests on tests.id = questions.test_id
      where questions.id = reading_mock_options.question_id
      and tests.is_published = true
   )
);

drop policy if exists "Users manage own reading mock attempts" on public.reading_mock_attempts;
create policy "Users manage own reading mock attempts"
on public.reading_mock_attempts
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users manage own reading mock answers" on public.reading_mock_answers;
create policy "Users manage own reading mock answers"
on public.reading_mock_answers
for all
to authenticated
using (
   exists (
      select 1
      from public.reading_mock_attempts attempts
      where attempts.id = reading_mock_answers.attempt_id
      and attempts.user_id = auth.uid()
   )
)
with check (
   exists (
      select 1
      from public.reading_mock_attempts attempts
      where attempts.id = reading_mock_answers.attempt_id
      and attempts.user_id = auth.uid()
   )
);
