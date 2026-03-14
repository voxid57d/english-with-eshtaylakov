alter table public.vocabulary_folders
   add column if not exists is_available_for_battle boolean not null default true;

comment on column public.vocabulary_folders.is_available_for_battle is
'Controls whether decks in this folder can appear in vocabulary battle.';
