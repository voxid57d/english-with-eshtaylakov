# Private personal training

The unlinked `/train` workspace uses the existing Next.js App Router, Supabase
Google/session authentication, server bearer-token verification, service-role
database access, CSS modules, Geist font, and shared dark/light theme. It is
independent of ERP roles and permissions. There is no new runtime dependency.

## Deploy and configure

1. Run the complete `supabase/training_schema.sql` file in the Supabase SQL editor.
   It runs inside a transaction and is safe to rerun. No ERP/finance migration is
   required. It does not insert exercises, measurements, or example workouts.
2. Set **`TRAIN_USER_ID`** to your account's UUID from Supabase Authentication →
   Users, both locally and in your deployment environment. This is a server-only
   variable: do not prefix it with `NEXT_PUBLIC_`. You can use the same account as
   the finance portal, but training does not automatically inherit that setting.
3. Keep the existing `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` configuration.
   Never expose the service-role key in browser code.
4. Keep Google OAuth enabled and allow the existing `/auth/callback` redirect on
   your local and production origins. Training passes its return path via `next`.
   An account already signed in through the website can also open `/train` directly.
5. Deploy normally (`npm ci`, `npm run build`). Open
   `https://eshtaylakov.uz/train` and sign in as the configured owner.

The migration has been exercised on isolated PostgreSQL via PGlite. Applying it
to the hosted Supabase project and setting the deployed owner ID are deployment
steps; the implementation does not change your hosted database or environment.

## What is included

- Dashboard: Training Today, Add Exercise, recent sessions/exercises, monthly
  count, latest weight, and automatically calculated personal records.
- Exercise library: search, custom categories, notes, target muscles, five result
  types, editing, activation/archive, and deletion of unused exercises.
- Workouts: one per local calendar day, historical creation/date edits, optional
  title/start/end/notes, searchable recent-first exercise picker, reordering,
  numeric set entry, duplicate/delete set, session exercise notes, explicit atomic
  saves, finish action, and deletion confirmation.
- Previous results: the latest earlier session with actual completed sets, even
  if more recent repeated sessions are still empty. Shown above and beside inputs.
- Repeat Workout Today: reuses active exercises and the number of sets, leaving
  every result empty. If today's workout exists, it is opened without modification.
- Measurements: dated weight and nine optional circumferences, notes, edit/delete,
  separate persistent height and birth year, and measurement history.
- Progress: date-based body measurement charts, selectable exercise metrics,
  training counts by week/month, calendar links, and per-exercise session history.
  Charts have touch/hover values and accessible data tables. The SVG approach
  follows the existing Marketing/Statistics chart implementation; the renderer is
  separate because those components depend on marketing-specific series data.

## Schema and data decisions

Six tables: `train_profiles`, `train_exercises`, `train_workouts`,
`train_workout_exercises`, `train_sets`, `train_measurements`. Each has an owner
reference and creation/update timestamps. Composite foreign keys enforce ownership
across workout, exercise, and set relationships. Workouts and measurements each
have a unique owner/date constraint. IDs are UUIDs; exercise URLs use stable UUIDs
so renaming an exercise never breaks its history links.

`train_start` creates/opens a date idempotently and repeats previous sessions in a
transaction. `train_save` writes a single workout's normalized rows atomically,
preserves stable IDs/timestamps, and checks its revision to prevent overwriting a
newer edit from another tab. JSON is transport only, not the stored workout model.
Saved changes survive refresh. Unsaved forms warn before navigation/refresh;
there is no offline queue or browser storage of body/workout data.

`train_performances` and `train_records` derive statistics and PRs from actual
complete sets, so edits/deletions automatically correct historical records.
Initial results are labeled as baselines; strictly higher later results are PRs.
Metrics include maximum load, reps at each load, session reps/volume, estimated
1RM, longest set duration, and longest set distance. The Epley formula is isolated
in `lib/training.ts` and the SQL `train_epley` function; change both together. It
applies only to weighted lifts of 1–12 reps, with one rep equal to actual weight.
Bodyweight volume uses only additional external load, never an assumed body mass.

Empty sets are placeholders and do not contribute to statistics. Partially filled
sets, negative/unreasonable values, duplicate exercise/session IDs, and incompatible
result fields are rejected. All entered sets count as working sets; warm-up/RPE
classification is not part of this initial version. Used exercises are archived
on delete; their result type cannot change. Removing a workout cascades only its
exercise-session and set rows.

Metric units are explicit column names: `_kg`, `_cm`, `_km`, `_seconds`. Categories
are editable text, not an enum. Result types are an extensible TypeScript registry
and database constraint. Adding a type requires extending both validation and UI.
Left/right limb fields can be added without changing existing measurements.

Reads are scoped and bounded: 50 exercises, 20 history sessions, 30 measurement
records, 500 observations per chart page. One-year views fit on one page (one
record/day); longer all-time histories have explicit archive pagination, with
partial boundary week/month counts labeled. Dashboard queries do not download
full sets/history. PR windows necessarily compare historical aggregate results.

## Privacy

Every API method verifies the Supabase token on the server and compares its user
ID with `TRAIN_USER_ID`. Missing configuration fails closed (503); anonymous users
receive 401 and other accounts receive 403. Every database query/mutation is
owner-scoped. The client gate mounts the private screens only after this check.
The public HTML contains only a generic sign-in shell and metadata, never records.

All six tables have RLS enabled and no public access policies. Anonymous and
authenticated database roles are explicitly denied table/view and RPC access;
only the server service role can access them. Defining table ownership is not a
substitute for this API owner allowlist.

All `/train` pages inherit `noindex, nofollow` metadata. `/train/*` and `/api/train`
also receive `X-Robots-Tag` headers, and API responses are `private, no-store` with
`Vary: Authorization`. `robots.txt` includes `Disallow: /train` and `/api/train`.
There was no sitemap generator to modify; if one is added later, omit `/train`
and every descendant. No public navigation link was added. Vercel analytics and
speed insights are suppressed on training routes. Indexing directives are an
additional privacy measure, never the authorization boundary.

## Changed files

- `app/train/**`: dashboard, exercises/details, workouts/details, history,
  measurements, progress, shared metadata/layout.
- `app/api/train/route.ts`: authenticated reads and writes.
- `components/training/**`: mobile UI, forms, charts, data client.
- `lib/training.ts`, `lib/trainingAuth.ts`: types, calculations, validation, access.
- `supabase/training_schema.sql`: tables, indexes, views, triggers and transactions.
- `app/robots.ts`, `next.config.ts`: indexing/privacy headers.
- `components/SiteTelemetry.tsx`, `app/layout.tsx`: training telemetry exclusion.
- `tests/training*.mjs`, `package.json`, `package-lock.json`, `.gitignore`:
  repeatable tests and development-only PGlite/Playwright Core tools.
- `README.md`, `docs/training.md`: deployment and operation notes.

## Verification and manual deployment checks

Run `npm test`, `npx tsc --noEmit`, and `npm run build`. PGlite executes the actual
migration twice and tests workout creation/reopening, saved sets, revisions,
historical dates, repeat, editing/deleting sets, statistics/PRs, measurements,
ownership and denied database roles. Unit tests cover validation and API access.

Run a local Next server on port 3100, then `npm run test:training-browser`.
`TRAIN_TEST_URL` overrides the origin; `CHROME_PATH` selects a local Chromium
executable. The default is Windows Chrome. The browser test verifies the real
anonymous API, robots and metadata, then uses isolated network/session fixtures
for UI workflows. It never writes fixtures into the production application or
Supabase. Screenshots go to ignored `artifacts/training/`.

After deployment, verify with the real owner account:

1. Sign in, create/edit an exercise, open Training Today twice, and confirm one
   workout. Save several sets, refresh, edit values, and delete a set.
2. Create a historical session; check that its results appear as the previous
   performance. Repeat it and confirm today's completed results are not overwritten.
3. Record weight and optional circumference, refresh, then check charts and an
   exercise's history. Test both themes on your phone, including numeric keyboards.
4. Open the same workout in two tabs; save in one and confirm the older tab gets a
   conflict. Failed saves should leave editable values on screen.
5. Sign out, then try a different staff account and direct API/database access.
   Verify denial, `noindex, nofollow`, `X-Robots-Tag`, and `robots.txt` on production.
6. Confirm the production domain is in Supabase's OAuth redirect allowlist.
