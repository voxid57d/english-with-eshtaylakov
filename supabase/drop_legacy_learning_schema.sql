-- Removes the old English-learning product tables.
-- Supabase Storage buckets cannot be deleted with direct SQL against
-- storage.objects/storage.buckets. Delete the writing-feedback bucket from
-- Dashboard > Storage after this script runs, if it still exists.
-- Keep these ERP/auth tables:
-- branches, staff_profiles, staff_branch_assignments, erp_role_permissions,
-- kpi_definitions, kpi_targets, kpi_progress_entries, shifts, daily_metrics,
-- task_templates, task_completions, task_comments.

begin;

drop table if exists public.reading_mock_answers cascade;
drop table if exists public.reading_mock_attempts cascade;
drop table if exists public.reading_mock_options cascade;
drop table if exists public.reading_mock_questions cascade;
drop table if exists public.reading_mock_question_blocks cascade;
drop table if exists public.reading_mock_passages cascade;
drop table if exists public.reading_mock_tests cascade;

drop table if exists public.reading_progress cascade;
drop table if exists public.reading_articles cascade;

drop table if exists public.listening_answers cascade;
drop table if exists public.listening_attempts cascade;
drop table if exists public.listening_options cascade;
drop table if exists public.listening_questions cascade;
drop table if exists public.listening_blocks cascade;
drop table if exists public.listening_sections cascade;
drop table if exists public.listening_tests cascade;

drop table if exists public.gl_attempts cascade;
drop table if exists public.gl_questions cascade;
drop table if exists public.gl_tests cascade;

drop table if exists public.writing_submissions cascade;
drop table if exists public.writing_prompts cascade;

drop table if exists public.vocab_battle_round_answers cascade;
drop table if exists public.vocab_battle_round_questions cascade;
drop table if exists public.vocab_battle_round_players cascade;
drop table if exists public.vocab_battle_rounds cascade;
drop table if exists public.vocab_battle_room_players cascade;
drop table if exists public.vocab_battle_answers cascade;
drop table if exists public.vocab_battle_questions cascade;
drop table if exists public.vocab_battle_players cascade;
drop table if exists public.vocab_battle_rooms cascade;

drop table if exists public.vocabulary_card_progress cascade;
drop table if exists public.vocabulary_cards cascade;
drop table if exists public.vocabulary_decks cascade;
drop table if exists public.vocabulary_folders cascade;

drop table if exists public.user_feedback cascade;
drop table if exists public.user_stats cascade;
drop table if exists public.telegram_accounts cascade;
drop table if exists public.profiles cascade;

drop function if exists public.set_writing_updated_at() cascade;
drop function if exists public.set_user_feedback_updated_at() cascade;

commit;
