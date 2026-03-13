create extension if not exists pgcrypto;

create table if not exists public.vocab_battle_rooms (
   id uuid primary key default gen_random_uuid(),
   code text not null unique,
   deck_id uuid not null references public.vocabulary_decks(id) on delete cascade,
   deck_ids uuid[] null,
   deck_title text null,
   host_user_id uuid not null references auth.users(id) on delete cascade,
   status text not null check (status in ('waiting', 'active', 'finished')),
   question_count integer not null default 10 check (question_count between 1 and 25),
   time_limit_seconds integer not null default 10 check (time_limit_seconds between 3 and 60),
   current_question_index integer not null default 0 check (current_question_index >= 0),
   current_question_started_at timestamptz null,
   winner_user_id uuid null references auth.users(id) on delete set null,
   finished_at timestamptz null,
   created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.vocab_battle_players (
   room_id uuid not null references public.vocab_battle_rooms(id) on delete cascade,
   user_id uuid not null references auth.users(id) on delete cascade,
   username text null,
   score integer not null default 0 check (score >= 0),
   total_response_ms integer not null default 0 check (total_response_ms >= 0),
   is_ready boolean not null default false,
   ready_at timestamptz null,
   submitted_at timestamptz null,
   joined_at timestamptz not null default timezone('utc', now()),
   primary key (room_id, user_id)
);

create table if not exists public.vocab_battle_questions (
   id uuid primary key default gen_random_uuid(),
   room_id uuid not null references public.vocab_battle_rooms(id) on delete cascade,
   question_index integer not null check (question_index >= 0),
   card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
   prompt text not null,
   options jsonb not null,
   correct_option_index integer not null check (correct_option_index between 0 and 3),
   created_at timestamptz not null default timezone('utc', now()),
   unique (room_id, question_index)
);

create table if not exists public.vocab_battle_answers (
   id uuid primary key default gen_random_uuid(),
   room_id uuid not null references public.vocab_battle_rooms(id) on delete cascade,
   question_index integer not null check (question_index >= 0),
   user_id uuid not null references auth.users(id) on delete cascade,
   selected_option_index integer null check (selected_option_index between 0 and 3),
   is_correct boolean not null,
   response_ms integer not null default 0 check (response_ms >= 0),
   answered_at timestamptz not null default timezone('utc', now()),
   unique (room_id, question_index, user_id)
);

create index if not exists vocab_battle_rooms_code_idx
   on public.vocab_battle_rooms (code);

create index if not exists vocab_battle_players_room_idx
   on public.vocab_battle_players (room_id);

create index if not exists vocab_battle_questions_room_idx
   on public.vocab_battle_questions (room_id, question_index);

create index if not exists vocab_battle_answers_room_idx
   on public.vocab_battle_answers (room_id, question_index);

alter table public.vocab_battle_rooms enable row level security;
alter table public.vocab_battle_players enable row level security;
alter table public.vocab_battle_questions enable row level security;
alter table public.vocab_battle_answers enable row level security;
