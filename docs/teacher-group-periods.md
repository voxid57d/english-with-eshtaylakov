# Teachers: continuing groups at the next level

Before deploying this change, run `supabase/teacher_group_periods.sql` in the
Supabase SQL editor. Run `supabase/erp_core_schema.sql` first for a fresh database.
The migration is safe to rerun. It assigns each existing group its own series,
without changing any saved levels, dates, schedules, or covers. Existing groups
are not automatically merged based on their names or LMS IDs.

In Teachers, select a teacher and click **Next level** on a regular group card.
Choose a different level and the new start and end dates. Teacher, group name,
LMS ID, lesson times, weekdays, and student count are copied and can be adjusted.
For an open-ended current level, also enter its ending date. Save creates another
period of the same group. The old period and its cover records retain their IDs.

The next period must start after the previous ending date (ending dates are
inclusive). It may be planned ahead. Only one direct successor can be created;
an existing successor can be corrected through **Level history → Edit period**.
All period mutations serialize on the series in a database transaction. Edits
cannot overlap adjacent periods or hide saved covers by changing dates/weekdays.

Each group has one card, showing its current period, otherwise its next upcoming
period, otherwise its latest completed period. The history shows every period,
including upcoming levels and their teachers. A group also remains accessible
from a previous teacher's list after a transfer. Dashboard and teacher totals
include only the period covering today, regardless of whether today is a lesson
weekday. Future and completed periods contribute no students or groups.

Weekly schedule cards show the group name followed by its level. The inclusive
level date range is split into five calendar stages: green, lime, yellow,
orange, and red. Colour uses the displayed lesson date, so earlier weeks keep
their historical stage and each new level starts green. A one-day period is
already on its final day and appears red. Open-ended periods stay green and
intake cards stay blue. Cover lessons use the same progression with an amber
outline and their existing cover label. Hovering a card shows its full details
and stage; screen readers also receive the stage number.

**Archive** stops the entire group, including planned periods, from today onward.
Earlier schedules and covers remain visible. **Restore** restores the group's
periods using their original date ranges. Holidays continue to hide lessons and
covers on their holiday dates. Intake groups retain their recurring behavior and
do not offer Next level.

`npm test` includes schedule, totals, and API regression tests. To run the SQL
integration tests in an isolated Postgres WASM database, temporarily install
`@electric-sql/pglite` (`npm install --no-save --package-lock=false @electric-sql/pglite`)
and run `node --test tests/teacher-group-periods.integration.mjs`. This does not
connect to or modify Supabase. The tests also accept `PGLITE_MODULE` pointing to
an already available PGlite ES module.
