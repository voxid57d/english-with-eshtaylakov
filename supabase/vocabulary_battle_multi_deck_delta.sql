alter table public.vocab_battle_rooms
   add column if not exists deck_ids uuid[] null;

alter table public.vocab_battle_rooms
   add column if not exists deck_title text null;

alter table public.vocab_battle_rooms
   drop constraint if exists vocab_battle_rooms_question_count_check;

alter table public.vocab_battle_rooms
   add constraint vocab_battle_rooms_question_count_check
   check (question_count between 1 and 40);

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
   )
where deck_ids is null or deck_title is null;
