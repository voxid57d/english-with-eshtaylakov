alter table public.vocab_battle_rooms
   drop constraint if exists vocab_battle_rooms_question_count_check;

alter table public.vocab_battle_rooms
   add constraint vocab_battle_rooms_question_count_check
   check (question_count between 1 and 40);

alter table public.vocab_battle_rounds
   drop constraint if exists vocab_battle_rounds_question_count_check;

alter table public.vocab_battle_rounds
   add constraint vocab_battle_rounds_question_count_check
   check (question_count between 1 and 40);
