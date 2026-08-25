-- Fixes "Database error saving new user" after removing the legacy app schema.
-- Cause: old auth.users triggers can still call functions that insert into
-- dropped legacy tables like public.profiles or public.telegram_accounts.
--
-- Run this in Supabase SQL Editor, then try Google sign-in again.

begin;

do $$
declare
   legacy_trigger record;
begin
   for legacy_trigger in
      select
         trigger_row.tgname as trigger_name
      from pg_trigger trigger_row
      join pg_proc trigger_function
         on trigger_function.oid = trigger_row.tgfoid
      join pg_namespace trigger_schema
         on trigger_schema.oid = trigger_function.pronamespace
      where trigger_row.tgrelid = 'auth.users'::regclass
        and not trigger_row.tgisinternal
        and trigger_schema.nspname = 'public'
        and (
           trigger_function.proname in (
              'handle_new_user',
              'on_auth_user_created',
              'create_profile_for_user',
              'create_user_profile'
           )
           or pg_get_functiondef(trigger_function.oid) ilike '%public.profiles%'
           or pg_get_functiondef(trigger_function.oid) ilike '%telegram_accounts%'
        )
   loop
      execute format(
         'drop trigger if exists %I on auth.users',
         legacy_trigger.trigger_name
      );
   end loop;
end $$;

do $$
declare
   legacy_function record;
begin
   for legacy_function in
      select
         trigger_function.oid::regprocedure as function_signature
      from pg_proc trigger_function
      join pg_namespace trigger_schema
         on trigger_schema.oid = trigger_function.pronamespace
      where trigger_schema.nspname = 'public'
        and (
           trigger_function.proname in (
              'handle_new_user',
              'on_auth_user_created',
              'create_profile_for_user',
              'create_user_profile'
           )
           or pg_get_functiondef(trigger_function.oid) ilike '%public.profiles%'
           or pg_get_functiondef(trigger_function.oid) ilike '%telegram_accounts%'
        )
   loop
      execute format(
         'drop function if exists %s cascade',
         legacy_function.function_signature
      );
   end loop;
end $$;

commit;

