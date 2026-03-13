alter table public.vocab_battle_players
   add column if not exists total_response_ms integer not null default 0 check (total_response_ms >= 0),
   add column if not exists is_ready boolean not null default false,
   add column if not exists ready_at timestamptz null,
   add column if not exists submitted_at timestamptz null;

alter table public.vocab_battle_answers
   alter column selected_option_index drop not null;

alter table public.vocab_battle_answers
   drop constraint if exists vocab_battle_answers_selected_option_index_check;

alter table public.vocab_battle_answers
   add constraint vocab_battle_answers_selected_option_index_check
   check (
      selected_option_index is null
      or selected_option_index between 0 and 3
   );
