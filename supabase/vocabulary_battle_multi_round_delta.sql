drop table if exists public.vocab_battle_answers;
drop table if exists public.vocab_battle_questions;
drop table if exists public.vocab_battle_players;

alter table public.vocab_battle_rooms
   drop constraint if exists vocab_battle_rooms_status_check;

alter table public.vocab_battle_rooms
   add column if not exists deck_ids uuid[] null;

alter table public.vocab_battle_rooms
   add column if not exists deck_title text null;

alter table public.vocab_battle_rooms
   add column if not exists completed_round_count integer not null default 0;

alter table public.vocab_battle_rooms
   add column if not exists expires_at timestamptz null;

alter table public.vocab_battle_rooms
   add column if not exists expiration_reason text null;

update public.vocab_battle_rooms
set
   deck_ids = coalesce(deck_ids, array[deck_id]),
   deck_title = coalesce(
      deck_title,
      (
         select title
         from public.vocabulary_decks
         where vocabulary_decks.id = vocab_battle_rooms.deck_id
      )
   ),
   completed_round_count = coalesce(completed_round_count, 0);

alter table public.vocab_battle_rooms
   alter column deck_ids set not null;

alter table public.vocab_battle_rooms
   alter column deck_title set not null;

alter table public.vocab_battle_rooms
   drop column if exists current_question_index;

alter table public.vocab_battle_rooms
   drop column if exists current_question_started_at;

alter table public.vocab_battle_rooms
   drop column if exists winner_user_id;

alter table public.vocab_battle_rooms
   drop column if exists finished_at;

update public.vocab_battle_rooms
set status = case
   when status = 'finished' then 'expired'
   else 'open'
end;

alter table public.vocab_battle_rooms
   add constraint vocab_battle_rooms_status_check
   check (status in ('open', 'expired'));

create table if not exists public.vocab_battle_room_players (
   room_id uuid not null references public.vocab_battle_rooms(id) on delete cascade,
   user_id uuid not null references auth.users(id) on delete cascade,
   username text null,
   joined_at timestamptz not null default timezone('utc', now()),
   primary key (room_id, user_id)
);

create table if not exists public.vocab_battle_rounds (
   id uuid primary key default gen_random_uuid(),
   room_id uuid not null references public.vocab_battle_rooms(id) on delete cascade,
   round_number integer not null check (round_number >= 1),
   status text not null check (status in ('waiting', 'active', 'finished')),
   deck_id uuid not null references public.vocabulary_decks(id) on delete cascade,
   deck_ids uuid[] not null,
   deck_title text not null,
   question_count integer not null default 10 check (question_count between 1 and 25),
   time_limit_seconds integer not null default 15 check (time_limit_seconds between 3 and 60),
   battle_starts_at timestamptz null,
   winner_user_id uuid null references auth.users(id) on delete set null,
   finished_at timestamptz null,
   created_at timestamptz not null default timezone('utc', now()),
   unique (room_id, round_number)
);

create table if not exists public.vocab_battle_round_players (
   round_id uuid not null references public.vocab_battle_rounds(id) on delete cascade,
   user_id uuid not null references auth.users(id) on delete cascade,
   username text null,
   score integer not null default 0 check (score >= 0),
   total_response_ms integer not null default 0 check (total_response_ms >= 0),
   is_ready boolean not null default false,
   ready_at timestamptz null,
   submitted_at timestamptz null,
   joined_at timestamptz not null default timezone('utc', now()),
   primary key (round_id, user_id)
);

create table if not exists public.vocab_battle_round_questions (
   id uuid primary key default gen_random_uuid(),
   round_id uuid not null references public.vocab_battle_rounds(id) on delete cascade,
   question_index integer not null check (question_index >= 0),
   card_id uuid not null references public.vocabulary_cards(id) on delete cascade,
   prompt text not null,
   options jsonb not null,
   correct_option_index integer not null check (correct_option_index between 0 and 3),
   created_at timestamptz not null default timezone('utc', now()),
   unique (round_id, question_index)
);

create table if not exists public.vocab_battle_round_answers (
   id uuid primary key default gen_random_uuid(),
   round_id uuid not null references public.vocab_battle_rounds(id) on delete cascade,
   question_index integer not null check (question_index >= 0),
   user_id uuid not null references auth.users(id) on delete cascade,
   selected_option_index integer null check (selected_option_index between 0 and 3),
   is_correct boolean not null,
   response_ms integer not null default 0 check (response_ms >= 0),
   answered_at timestamptz not null default timezone('utc', now()),
   unique (round_id, question_index, user_id)
);

create unique index if not exists vocab_battle_rounds_single_unfinished_idx
   on public.vocab_battle_rounds (room_id)
   where status in ('waiting', 'active');

create index if not exists vocab_battle_room_players_room_idx
   on public.vocab_battle_room_players (room_id);

create index if not exists vocab_battle_rounds_room_idx
   on public.vocab_battle_rounds (room_id, round_number desc);

create index if not exists vocab_battle_round_players_round_idx
   on public.vocab_battle_round_players (round_id);

create index if not exists vocab_battle_round_questions_round_idx
   on public.vocab_battle_round_questions (round_id, question_index);

create index if not exists vocab_battle_round_answers_round_idx
   on public.vocab_battle_round_answers (round_id, question_index);

alter table public.vocab_battle_room_players enable row level security;
alter table public.vocab_battle_rounds enable row level security;
alter table public.vocab_battle_round_players enable row level security;
alter table public.vocab_battle_round_questions enable row level security;
alter table public.vocab_battle_round_answers enable row level security;
