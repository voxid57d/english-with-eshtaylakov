alter table public.vocabulary_folders
add column if not exists folder_theme text;

update public.vocabulary_folders
set folder_theme = 'ocean'
where folder_theme is null;

alter table public.vocabulary_folders
alter column folder_theme set default 'ocean';

alter table public.vocabulary_folders
alter column folder_theme set not null;

do $$
begin
   if not exists (
      select 1
      from pg_constraint
      where conname = 'vocabulary_folders_folder_theme_check'
   ) then
      alter table public.vocabulary_folders
      add constraint vocabulary_folders_folder_theme_check
      check (folder_theme in ('ocean', 'emerald', 'sunset', 'violet'));
   end if;
end $$;

comment on column public.vocabulary_folders.folder_theme is
'Controls the folder card gradient and placeholder icon on the student vocabulary page.';
