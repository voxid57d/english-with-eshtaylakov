-- Run once before deploying the attendance update. Existing saved assessments
-- remain assessed; newly created shifts require explicit attendance confirmation.
begin;
alter table public.shifts
   add column if not exists attendance_assessed boolean not null default true;
alter table public.shifts
   alter column attendance_assessed set default false;
commit;
