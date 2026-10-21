# Native offline Android training app — build prompt

Prepared from the local `/train` implementation on October 19, 2026. The live URL could not be reached from this environment, so deployed behavior and visual appearance have not been independently verified. Reviewed the screens, validation, API, database calculations, and existing tests. Both training test files passed: 8 tests, 0 failures.

Copy the prompt below into your Android coding agent. It is self-contained; access to the website or its repository is not required.

---

## Build prompt

Act as an experienced native Android engineer and product designer. Build a complete, installable, single-user Android application called **Personal Training**, package `uz.eshtaylakov.training`.

The app replaces the training functionality at `https://eshtaylakov.uz/train`. Implement the functional specification below. The site is a reference, never a runtime dependency.

Deliver working source code and an APK, with implemented screens, persistence, calculations, and tests. Carry the implementation through build and verification; a plan, UI prototype, or collection of code snippets is insufficient.

### 1. Platform and offline requirements

- Use Kotlin, Jetpack Compose, Material 3, and native Android navigation, dialogs, date/time pickers, and input controls.
- Use Room over SQLite for structured data, DataStore for preferences, ViewModels, coroutines, and Flow. Keep calculations and validation separate from UI code and database access.
- Use a coherent set of current stable Android/Kotlin dependencies, verify compatibility, and pin versions. Include the Gradle wrapper and Kotlin DSL build files. Support Android 8.0/API 26 and above; choose a current stable compile/target SDK supported by the build environment.
- All features must work immediately after installation in airplane mode, including first launch, creating exercises, logging workouts, measurements, history, charts, records, backup, and restore. No first-run downloads or account activation.
- The UI must be native Compose. Do not use WebView, Trusted Web Activity, PWA packaging, Capacitor, Cordova, a bundled website, Flutter, or React Native.
- Use a local single-user profile. Replace the website's Google/Supabase authentication with direct local access. No backend, Supabase/Firebase dependency, remote API, synchronization service, analytics, advertisements, or runtime network requirement. The final merged app manifest must not request INTERNET permission.
- Bundle required fonts, icons, and assets or use Android system resources. Build-time dependency downloads are acceptable; app operation must be fully offline.
- Build this as a separate Android project. Existing website code and hosted records are reference material and must remain intact.

### 2. Navigation and visual design

Use five primary destinations matching the original functional organization: **Today, Exercises, History, Body, Progress**. Open workout editing and individual exercise history as secondary screens. Put backup/restore and theme preferences in a small settings screen accessible from the app bar.

Create a polished, practical gym interface: clear hierarchy, compact cards, readable numbers, prominent primary actions, and a persistent Save action in workout editing. Use a navy/slate dark palette with mint accents, plus a coordinated light theme with green accents. Reference colors: dark surfaces `#0F172A`, borders `#293548`, secondary text `#94A3B8`, accent `#6EE7B7`; light surfaces white, borders `#DBE3E9`, secondary text `#536478`, accent `#047857`.

Support System/Light/Dark theme preferences. Use at least 48 dp touch targets, TalkBack labels, accessible chart values, scalable fonts, keyboard-safe layouts, and correct system back behavior. Integer fields need numeric keyboards; load, distance, and measurement fields need decimal keyboards. Handle locale decimal input consistently. Initial UI language is English; keep visible strings in Android resources.

Start with an empty database and useful empty states. Do not insert invented workouts, measurements, records, or a mandatory exercise catalog. Suggested categories are allowed.

### 3. Today dashboard

- Display the local calendar date and whether a workout exists for it.
- Provide **Training Today**, changing to **Open Today's Workout** when today's workout exists. Creation/opening must be idempotent: repeated taps always open the same daily workout.
- Starting today's workout records its start timestamp on creation. Opening an existing workout preserves its values and timestamps.
- Provide an **Add Exercise** shortcut to the exercise creation form.
- Show last workout date, number of workouts dated in the current calendar month, and most recent nonempty body-weight value with its measurement date.
- Show recent sessions, recent automatic personal records, and recently used exercises, linking to their detail screens.
- Monthly and weekly training counts count stored workout days, including unfinished or empty sessions. Completed-set statistics remain separate.

### 4. Exercise library

Support create, edit, search by name, view details/history, archive, reactivate, and delete.

Each exercise has a stable UUID, required name, required editable category, result type, optional target muscle, optional library notes, and active/archive state. Suggested categories: Chest, Back, Shoulders, Biceps, Triceps, Legs, Core, Cardio, Other. Allow arbitrary custom category text.

Implement exactly these five result types:

| Stable type | Label | Fields required for a recorded set |
| --- | --- | --- |
| `weight_reps` | Weight + Reps | Weight in kg and integer reps |
| `bodyweight_reps` | Bodyweight + Reps | Integer reps; optional additional external kg |
| `reps` | Reps Only | Integer reps |
| `time` | Time | Integer duration in seconds |
| `distance_time` | Distance + Time | Distance in km and integer duration in seconds |

Only render fields applicable to the selected type. Optional bodyweight load means extra external weight, never the user's body weight.

Exercise selection during a workout searches active exercises, prioritizes recently used exercises when no search is entered, and supports the whole library. Archived exercises remain visible in historical workouts and exercise history, but cannot be newly added or included in a repeated workout.

An exercise already referenced by a saved workout has a fixed result type. Explain this restriction when editing. Names, categories, muscles, and notes remain editable; renaming preserves all history through stable IDs. Deleting a referenced exercise archives it. Deleting an unused exercise removes it after confirmation. Archive/reactivate must also be available explicitly.

### 5. Workout editor and history

There is at most one workout per local calendar date, enforced by a database unique constraint. Use a date-only value for workout date, independent of timestamps and UTC conversion.

- History lists sessions newest first, grouped by month, with access to older records.
- Support creating/opening a workout for a chosen past date, opening any existing session, and editing its date. A date collision must explain the conflict and preserve both existing records and the current draft.
- Workout fields: date, optional title, optional start/end timestamps, optional workout notes, revision, and ordered exercise entries.
- Each exercise can appear only once in a workout. Adding one creates one blank set. Support removing an exercise with confirmation and changing exercise order with accessible up/down controls or equivalent native reordering.
- Each workout exercise has its own session notes, separate from its library notes. Show the library note where useful.
- Support adding a blank set, editing set values, deleting a set, and **Duplicate Previous Set**, which copies the last set currently entered for that exercise into a new row with a fresh UUID.
- Preserve exercise and set ordering. Support up to 50 exercises per workout and 100 sets per exercise. Zero sets is allowed.
- Show exercise count, number of recorded sets, total reps, training volume, and session duration when both timestamps exist.
- **Save workout** validates and commits the entire workout atomically in one Room transaction, including additions, edits, deletions, and order. Never partially commit a failed save. Preserve stable IDs and creation timestamps when editing.
- **Finish workout** sets the end timestamp and performs the same validated atomic save. It is available for a started, unfinished workout. Finished sessions remain editable.
- End time requires a start time and cannot precede it. Session duration is elapsed minutes between timestamps, rounded to the nearest minute.
- Show accurate Unsaved changes/Saving/Saved on this device/error status. Failed validation or persistence must preserve typed input.
- Confirm discarding unsaved edits when navigating back or away. Handle rotation and backgrounding correctly.
- As a mobile-specific improvement, persist recoverable editor drafts separately from committed workout results, including temporarily incomplete numeric text. Offer recovery after process death/relaunch. Drafts must not contribute to charts or records. Explicit Save/Finish remains the commit boundary.
- Confirm workout deletion, then remove only that workout and its dependent exercise entries/sets. Keep the exercise library and body measurements.

### 6. Previous performance and repeat behavior

For each workout exercise, show the most recent strictly earlier workout containing at least one complete recorded set for that exercise. Search relative to the workout's date, including when editing a historical session. Newer empty sessions must not hide an earlier actual performance.

Show that session's date and ordered sets above the inputs, plus the corresponding previous set beside each current row where available. Keep any blank placeholders in their original positions and label them unrecorded. Changing the current workout date refreshes the reference lookup.

Implement **Repeat Workout Today** on a saved historical workout:

- If today's workout exists, open it without altering anything.
- Otherwise create today's workout, copying the source title, active exercises in their order, and each included exercise's number of set rows.
- Give copied rows new UUIDs. Leave all result values empty. Do not copy workout/session notes, old start/end times, achievements, or completed values. Start the new workout now.
- Skip archived exercises. Disable repetition while there are unsaved edits, requiring Save or Discard first.
- Repeat creation must be atomic and safe against duplicate taps.

### 7. Body measurements and profile

Support dated measurement creation, editing, deletion with confirmation, notes, and newest-first history. Enforce one measurement entry per date; explain duplicates and offer editing the existing entry without silently replacing it.

All measurement values are optional, but at least one must be present:

- Weight in kg.
- Nine circumferences in cm: waist, chest, shoulders, neck, upper arm, forearm, hip, thigh, calf.

Keep weight easy to enter, with circumferences and notes in an expandable section. Allow today and past dates. Keep persistent optional height in cm and birth year in a separate local profile; these are not daily measurements. Do not add BMI, calorie estimates, diet plans, or medical interpretations.

### 8. Progress, calendar, and exercise detail

- Provide ranges of 1 month, 3 months, 6 months, 1 year, and All time; default to 3 months. Subtract calendar months with end-of-month clamping.
- Plot each body measurement separately against actual dates, omitting missing values rather than turning them into zeros.
- Allow exercise selection and show only compatible exercise metrics:
  - Weight + Reps: maximum set load, estimated 1RM, session volume, total reps.
  - Bodyweight + Reps: total reps, maximum extra load, external-load session volume.
  - Reps Only: total reps.
  - Time: longest set duration.
  - Distance + Time: longest set distance and longest set duration.
- Provide workout counts by Monday-based week and calendar month, including zero-workout periods within the displayed range.
- Provide a Monday-first month calendar highlighting workout dates; tapping a highlighted date opens that workout.
- Individual exercise detail shows name, category, type, target muscle, notes, archive state, its progress charts, baseline/PR timeline, and newest-first session history with recorded set values.
- Charts must be native, using Compose Canvas or a native Compose chart library. Include touch-selected values, dates, units, and an accessible list/table of underlying values. Handle empty series, single points, constant values, and irregular date intervals.
- Query and aggregate large histories locally with bounded reads. History/library pages or lazy loading must expose all records. Chart downsampling or paging must not distort totals, personal records, or selected-period counts. Avoid showing partial archive counts as complete totals.

### 9. Statistics and personal records

Put the rules in tested domain code and reuse them consistently throughout the app:

1. A fully blank set is a valid placeholder. It contributes nothing to recorded-set counts, reps, volume, previous-performance selection, charts, or personal records. Zero load is a value, distinct from blank.
2. A complete set contains all required fields for its type; bodyweight extra load is optional. Reject partially entered sets at commit, retaining the draft for correction. Incompatible fields must never enter committed storage.
3. Every complete set counts as a working set. Warm-up classification and RPE are outside scope.
4. Session reps are the sum of reps across complete sets. Session volume is the sum of `externalWeightKg × reps` for weighted/bodyweight sets. Missing bodyweight extra load contributes zero volume. Never add body mass to load.
5. Maximum load, longest duration, and longest distance are maxima across complete sets, not sums. Exercise metrics aggregate one workout/exercise pair.
6. Estimated 1RM uses Epley only for `weight_reps`, positive weight, and integer reps from 1 through 12. For one rep return the actual load; otherwise return `weight × (1 + reps / 30)`, rounded to two decimal places. Other types, zero load, and reps above 12 produce no estimate. A session's estimate is the maximum eligible set estimate.
7. Derive record events for maximum load, session volume, estimated 1RM, session total reps, longest set duration, and longest set distance where applicable. Additionally derive best set reps at each distinct load for weighted/bodyweight exercises, and best set reps for reps-only exercises. Treat absent bodyweight extra load as 0 kg for this comparison.
8. Track records separately per stable exercise ID and metric, including the specific load for reps-at-load records. Compare in workout-date order against the highest strictly earlier value. The first positive result is a **Baseline**; strictly greater later values are **New PR**. Ties and zero values create no record event.
9. Derive records and aggregates from committed data or maintain correctly invalidated derived caches. Editing, backdating, changing dates, removing sets, deleting workouts, and restoring a backup must immediately correct historical results. Renaming keeps history attached.

Use decimal-safe normalization for load grouping and comparisons so equivalent values such as 20 and 20.0 form one reps-at-load series.

### 10. Validation and data integrity

Preserve these limits:

| Field | Allowed values |
| --- | --- |
| Exercise name / workout title / target muscle | Maximum 100 characters; exercise name required |
| Category | Required, maximum 60 characters |
| Notes | Maximum 2,000 characters per note field |
| Set load | 0–1,500 kg |
| Reps | Integer 1–10,000 |
| Set duration | Integer 1–604,800 seconds |
| Set distance | 0.001–1,000 km |
| Body weight | 1–500 kg |
| Circumferences | 1–400 cm |
| Height | 50–300 cm |
| Birth year | Integer from 1900 through current local year |
| Workout/measurement date | A real date from 1900-01-01 through 2100-12-31 |

Trim surrounding text whitespace. Reject NaN, infinity, malformed dates, negative values, integer fractions, duplicates, and broken references. Date pickers for new past workouts and measurements stop at today; workout-date editing retains the specified valid-date range. Show useful errors beside the affected inputs.

Store workout/measurement dates as LocalDate-compatible date-only values. Store start/end instants independently and render them in the device time zone. Determine Today using the device's local calendar, including Asia/Tashkent. Refresh Today across midnight and timezone changes without shifting previously stored workout dates.

### 11. Local data model and lifecycle

Use normalized entities corresponding to:

- Profile: local identity, optional height and birth year.
- Exercise: UUID, name, category, result type, target muscle, notes, active state.
- Workout: UUID, unique date, title, notes, optional start/end instants, revision.
- WorkoutExercise: UUID, workout FK, exercise FK, position, session notes; unique exercise per workout.
- TrainingSet: UUID, workout-exercise FK, position, nullable kg/reps/seconds/km fields.
- Measurement: UUID, unique date, nullable weight/circumference values, notes.

Include creation/update timestamps, appropriate indexes, foreign keys, and deliberate cascade rules. Preserve UUIDs across exports and restores. Keep editor drafts separate. Store settings separately from training records.

Serialize mutations and guard against stale editor overwrites with revision checks or equivalent. Retain the user's draft when a stale save is rejected. Add versioned database migrations; do not use destructive migration fallback for user records. Store private data in app-private storage and avoid logging workout or body data.

### 12. Local backup and restore — mobile addition

Because the app becomes the primary local store, implement user-controlled backup/restore through Android's Storage Access Framework, without broad storage permissions or a cloud dependency.

- Export a versioned UTF-8 JSON backup containing profile, exercises, workouts, ordered workout-exercise entries, sets, measurements, timestamps, and preferences. State that it contains personal training data. Treat drafts separately and document whether they are included.
- Restore from a user-selected file. Validate the entire file and its relationships before applying it. Reject unsupported versions, malformed values, duplicate IDs/dates, and orphaned rows without altering current data.
- For v1, use explicit **Replace local data** restore, with a record-count preview and confirmation. Apply replacement in one database transaction; a failure leaves the previous database intact. Offer exporting the current data first.
- Automatic cloud backup must not upload these records; configure Android backup/data-extraction rules accordingly. Explain that local exports are the supported recovery path.
- Existing website data is not automatically available. Document a possible one-time file migration mapping from the six original `train_*` tables to the app format. Do not fabricate an existing website export feature or require a server connection. Implement an actual legacy importer only if a real export/schema is supplied; native backup round-tripping is required regardless.

### 13. Acceptance checks

Implement meaningful unit/database tests and representative Compose UI tests. Demonstrate:

1. Fresh installation with networking disabled can create an exercise, start a workout, save sets, finish it, record measurements, and show history/charts/records. All survive force-stop and relaunch.
2. Repeated Training Today taps create one workout. Opening today's workout never resets its results.
3. All five result types validate correctly, including optional bodyweight extra load, zero load, blank placeholders, and rejection of partial/invalid sets.
4. A workout with weighted sets `60 kg × 12` and `70 kg × 10`, plus bodyweight sets `no extra load × 10` and `10 extra kg × 5`, has **4 recorded sets, 37 reps, and 1,470 kg × reps volume**. Adding blank placeholders changes none of these totals.
5. Epley gives 120 kg for 100 kg × 6, 100 kg for 100 kg × 1, and no estimate for 100 kg × 20 or any bodyweight set.
6. Adding, duplicating, deleting, and reordering persists accurately; failed saves leave committed rows unchanged and preserve editable draft values.
7. Rotation and process death recover the draft without treating it as a saved result.
8. Previous performance skips a newer empty workout and excludes sessions on/after the edited workout date.
9. Repeat preserves active exercise order and set counts with fresh IDs and blank results, skips archived exercises, and leaves an already-existing today workout untouched.
10. Referenced-exercise deletion archives it; changing its result type is blocked. Archived history stays accessible. Renaming retains chart/PR history.
11. Baselines, strict improvements, ties, reps-at-load grouping, and historical recalculation after edits/backdating/deletion follow the rules above.
12. Duplicate workout/measurement dates, invalid end times, stale saves, and malformed imports cannot damage existing data.
13. Backup export/restore round-trips all supported committed data; canceled or invalid restore leaves records intact. Test an actual database schema migration with retained data.
14. Calendar/month boundaries, leap days, Monday-based weeks, local midnight, and timezone changes work correctly. Chart counts include zero-session periods and remain correct for histories larger than one query page.
15. Both themes, large font sizes, small screens, TalkBack labels, and keyboard-visible workout editing remain usable.

### 14. Deliverables and execution

Deliver the complete Android Studio project, Gradle wrapper/configuration, database schema/migrations, tests, a debug APK, and a concise README covering build, install, use, data storage, backup/restore, and release signing. Never include private signing keys or website credentials.

Implement the full feature set without placeholder screens, mocked production repositories, or TODO-only features. If the original repository is available, inspect `docs/training.md`, `lib/training.ts`, `components/training/`, `app/api/train/route.ts`, `supabase/training_schema.sql`, and `tests/training*.mjs` for reference. The specification above remains sufficient when those files are unavailable.

Run the appropriate Gradle build, unit tests, lint, and connected/UI tests when an emulator/device is available. Inspect the merged manifest for network permissions and verify first-run airplane-mode behavior on a fresh install. Report exactly what ran, what passed, and any concrete environment limitation; do not claim an APK or device verification that was not produced.

Make routine implementation decisions autonomously and document significant assumptions. Ask only when a missing requirement genuinely prevents implementation. Finish with project/APK locations, build/test results, and any remaining limitations.

---

Implementation references: [Jetpack Compose native UI](https://developer.android.com/compose), [Room local persistence](https://developer.android.com/training/data-storage/room), and [Storage Access Framework](https://developer.android.com/training/data-storage/shared/documents-files).
