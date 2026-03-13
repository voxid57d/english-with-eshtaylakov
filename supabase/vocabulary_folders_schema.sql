create table if not exists public.vocabulary_folders (
   id uuid primary key default gen_random_uuid(),
   slug text not null unique,
   title text not null,
   description text,
   sort_order integer not null default 0,
   created_at timestamptz not null default timezone('utc', now())
);

alter table public.vocabulary_decks
add column if not exists folder_id uuid references public.vocabulary_folders(id) on delete set null;

create index if not exists vocabulary_decks_folder_id_idx
on public.vocabulary_decks(folder_id);

create index if not exists vocabulary_folders_sort_order_idx
on public.vocabulary_folders(sort_order, created_at desc);

create unique index if not exists vocabulary_folders_slug_idx
on public.vocabulary_folders(slug);

comment on table public.vocabulary_folders is
'Groups public vocabulary decks into browseable student-facing folders.';

comment on column public.vocabulary_decks.folder_id is
'Optional folder assignment for public decks. Private decks should remain without a folder.';
