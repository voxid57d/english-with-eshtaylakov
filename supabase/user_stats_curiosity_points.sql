alter table public.user_stats
add column if not exists curiosity_points integer not null default 0;

comment on column public.user_stats.curiosity_points is
'Persisted Curiosity Points awarded from vocabulary battles. Leaderboard streak bonuses are display-only and must not be stored here.';
