begin;

alter table public.vocab_battle_rooms enable row level security;
alter table public.vocab_battle_room_players enable row level security;
alter table public.vocab_battle_rounds enable row level security;
alter table public.vocab_battle_round_players enable row level security;
alter table public.vocab_battle_round_questions enable row level security;
alter table public.vocab_battle_round_answers enable row level security;

alter table public.vocab_battle_rooms replica identity full;
alter table public.vocab_battle_room_players replica identity full;
alter table public.vocab_battle_rounds replica identity full;
alter table public.vocab_battle_round_players replica identity full;
alter table public.vocab_battle_round_questions replica identity full;
alter table public.vocab_battle_round_answers replica identity full;

grant usage on schema public to authenticated;

grant select on public.vocab_battle_rooms to authenticated;
grant select on public.vocab_battle_room_players to authenticated;
grant select on public.vocab_battle_rounds to authenticated;
grant select on public.vocab_battle_round_players to authenticated;
grant select on public.vocab_battle_round_questions to authenticated;
grant select on public.vocab_battle_round_answers to authenticated;

revoke all on public.vocab_battle_rooms from anon;
revoke all on public.vocab_battle_room_players from anon;
revoke all on public.vocab_battle_rounds from anon;
revoke all on public.vocab_battle_round_players from anon;
revoke all on public.vocab_battle_round_questions from anon;
revoke all on public.vocab_battle_round_answers from anon;

drop policy if exists "Battle participants can view rooms" on public.vocab_battle_rooms;
drop policy if exists "Battle participants can view room players" on public.vocab_battle_room_players;
drop policy if exists "Battle participants can view rounds" on public.vocab_battle_rounds;
drop policy if exists "Battle participants can view round players" on public.vocab_battle_round_players;
drop policy if exists "Battle participants can view round questions" on public.vocab_battle_round_questions;
drop policy if exists "Battle participants can view round answers safely" on public.vocab_battle_round_answers;

create policy "Battle participants can view rooms"
on public.vocab_battle_rooms
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_room_players rp
    where rp.room_id = vocab_battle_rooms.id
      and rp.user_id = auth.uid()
  )
);

create policy "Battle participants can view room players"
on public.vocab_battle_room_players
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_room_players mine
    where mine.room_id = vocab_battle_room_players.room_id
      and mine.user_id = auth.uid()
  )
);

create policy "Battle participants can view rounds"
on public.vocab_battle_rounds
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_room_players rp
    where rp.room_id = vocab_battle_rounds.room_id
      and rp.user_id = auth.uid()
  )
);

create policy "Battle participants can view round players"
on public.vocab_battle_round_players
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_rounds r
    join public.vocab_battle_room_players rp
      on rp.room_id = r.room_id
    where r.id = vocab_battle_round_players.round_id
      and rp.user_id = auth.uid()
  )
);

create policy "Battle participants can view round questions"
on public.vocab_battle_round_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_rounds r
    join public.vocab_battle_room_players rp
      on rp.room_id = r.room_id
    where r.id = vocab_battle_round_questions.round_id
      and rp.user_id = auth.uid()
  )
);

create policy "Battle participants can view round answers safely"
on public.vocab_battle_round_answers
for select
to authenticated
using (
  exists (
    select 1
    from public.vocab_battle_rounds r
    join public.vocab_battle_room_players rp
      on rp.room_id = r.room_id
    where r.id = vocab_battle_round_answers.round_id
      and rp.user_id = auth.uid()
      and (
        vocab_battle_round_answers.user_id = auth.uid()
        or r.status = 'finished'
      )
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_rooms'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_rooms';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_room_players'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_room_players';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_rounds'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_rounds';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_round_players'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_round_players';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_round_questions'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_round_questions';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'vocab_battle_round_answers'
  ) then
    execute 'alter publication supabase_realtime add table public.vocab_battle_round_answers';
  end if;
end
$$;

commit;
