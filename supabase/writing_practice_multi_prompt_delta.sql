alter table public.writing_prompts
drop constraint if exists writing_prompts_task_number_key;

alter table public.writing_prompts
add column if not exists title text;

update public.writing_prompts
set title = concat('Test ', task_number)
where title is null or btrim(title) = '';

alter table public.writing_prompts
alter column title set not null;

alter table public.writing_prompts
add column if not exists sort_order integer not null default 0;

with ranked_prompts as (
   select
      id,
      row_number() over (
         partition by task_number
         order by created_at asc, id asc
      ) as next_sort_order
   from public.writing_prompts
)
update public.writing_prompts prompts
set sort_order = ranked_prompts.next_sort_order
from ranked_prompts
where prompts.id = ranked_prompts.id
  and (prompts.sort_order = 0 or prompts.sort_order is null);
