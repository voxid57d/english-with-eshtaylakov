// Optional isolated SQL suite: see docs/teacher-group-periods.md for setup.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const migration = readFileSync(new URL("../supabase/teacher_group_periods.sql", import.meta.url), "utf8");
const core = readFileSync(new URL("../supabase/erp_core_schema.sql", import.meta.url), "utf8");
const teacher = "00000000-0000-0000-0000-000000000001";
const otherTeacher = "00000000-0000-0000-0000-000000000002";
const level = "00000000-0000-0000-0000-000000000003";
const nextLevel = "00000000-0000-0000-0000-000000000004";
const inactiveLevel = "00000000-0000-0000-0000-000000000005";
const payload = (overrides = {}) => ({
   teacher_id: otherTeacher, level_id: nextLevel, lms_group_name: "Morning", lms_group_id: "123",
   starts_on: "2026-11-02", ends_on: "2026-12-30", starts_at: "10:00", ends_at: "11:30",
   weekdays: [1, 3, 5], active_students_count: 10, active: true, is_intake: false, archived_on: null,
   ...overrides,
});

test("group period SQL preserves history and enforces transactional transitions", async (t) => {
   // Match PostgREST's date-only strings instead of the driver's Date objects.
   const db = new PGlite({ parsers: { 1082: (value) => value } });
   try {
      await db.exec(`create role anon; create role authenticated; create role service_role;
         create schema auth; create table auth.users (id uuid primary key);`);
      // Use the real core table definitions, initially without the new series column.
      const tables = core.slice(core.indexOf("create table if not exists public.teacher_profiles ("),
         core.indexOf("create table if not exists public.teacher_lesson_holidays ("))
         .replace(/^   group_series_id[^\r\n]*\r?\n/m, "");
      await db.exec(tables);
      await db.exec(core.slice(core.indexOf("create or replace function public.set_erp_updated_at()"),
         core.indexOf("drop trigger if exists branches_updated_at")));
      await db.exec(`create trigger teacher_lesson_groups_updated_at before update on teacher_lesson_groups
         for each row execute function public.set_erp_updated_at();`);
      await db.query("insert into teacher_profiles(id, full_name) values ($1, 'Original teacher'), ($2, 'Next teacher')", [teacher, otherTeacher]);
      await db.query("insert into teacher_group_levels(id, name, active) values ($1, 'Elementary', true), ($2, 'Pre-intermediate', true), ($3, 'Inactive', false)", [level, nextLevel, inactiveLevel]);

      const seed = async (overrides = {}) => {
         const row = payload({ teacher_id: teacher, level_id: level, starts_on: "2026-09-01", ends_on: "2026-10-31", active_students_count: 12, ...overrides });
         const result = await db.query(`insert into teacher_lesson_groups
            (teacher_id, level_id, lms_group_name, lms_group_id, starts_on, ends_on, starts_at, ends_at, weekdays, active_students_count, active, is_intake, archived_on)
            values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`, [
            row.teacher_id, row.level_id, row.lms_group_name, row.lms_group_id, row.starts_on, row.ends_on,
            row.starts_at, row.ends_at, row.weekdays, row.active_students_count, row.active, row.is_intake, row.archived_on,
         ]);
         return result.rows[0];
      };
      const get = async (id) => (await db.query("select * from teacher_lesson_groups where id = $1", [id])).rows[0];
      const advance = async (id, period = payload(), previousEndsOn = null) =>
         (await db.query("select advance_teacher_group($1, $2::jsonb, $3) as id", [id, JSON.stringify(period), previousEndsOn])).rows[0].id;
      const edit = async (id, period) => db.query("select save_teacher_group_period($1, $2::jsonb)", [id, JSON.stringify(period)]);
      const cover = async (id, date) => db.query("insert into teacher_lesson_covers(lesson_group_id, cover_date, covering_teacher_name) values ($1, $2, 'Substitute') returning *", [id, date]);
      const clear = async () => db.exec("truncate teacher_lesson_groups cascade");

      const legacy = await seed();
      const unrelated = await seed();
      await cover(legacy.id, "2026-10-26");
      await db.exec(migration);

      await t.test("migration preserves existing periods/covers and is safe to rerun", async () => {
         const migrated = await get(legacy.id);
         const { group_series_id, ...unchanged } = migrated;
         assert.deepEqual(unchanged, legacy);
         assert.notEqual(group_series_id, (await get(unrelated.id)).group_series_id);
         await db.exec(migration);
         assert.equal((await get(legacy.id)).group_series_id, group_series_id);
         assert.equal((await db.query("select count(*)::integer as count from teacher_lesson_covers")).rows[0].count, 1);
      });

      await t.test("advancing creates a linked period and leaves every original field and cover unchanged", async () => {
         const before = await get(legacy.id);
         const coverBefore = (await db.query("select * from teacher_lesson_covers")).rows[0];
         const id = await advance(legacy.id);
         assert.deepEqual(await get(legacy.id), before);
         assert.deepEqual((await db.query("select * from teacher_lesson_covers")).rows[0], coverBefore);
         const next = await get(id);
         assert.equal(next.group_series_id, before.group_series_id);
         assert.equal(next.level_id, nextLevel);
         assert.equal(next.teacher_id, otherTeacher);
         assert.equal(next.starts_on, "2026-11-02");
         assert.equal(next.active_students_count, 10);
      });

      await t.test("duplicate/retried advances cannot add another direct successor", async () => {
         await clear();
         const source = await seed();
         const responses = await Promise.allSettled([advance(source.id), advance(source.id)]);
         assert.equal(responses.filter((response) => response.status === "fulfilled").length, 1);
         assert.equal(responses.filter((response) => response.status === "rejected" && /already has a next level/.test(response.reason.message)).length, 1);
         await assert.rejects(advance(source.id), /already has a next level/);
         assert.equal((await db.query("select count(*)::integer as count from teacher_lesson_groups")).rows[0].count, 2);
         assert.deepEqual(await get(source.id), source);
      });

      await t.test("invalid transitions roll back and cannot alter historical dates", async () => {
         await clear();
         const source = await seed();
         for (const bad of [
            { starts_on: "2026-10-31" }, { ends_on: null }, { ends_on: "2026-11-01" },
            { level_id: level }, { level_id: inactiveLevel }, { teacher_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" },
         ]) await assert.rejects(advance(source.id, payload(bad)));
         assert.deepEqual(await get(source.id), source);
         assert.equal((await db.query("select count(*)::integer as count from teacher_lesson_groups")).rows[0].count, 1);
         await assert.rejects(advance("ffffffff-ffff-ffff-ffff-ffffffffffff"), /Group not found/);
      });

      await t.test("closing an open period and creating its next level is atomic, with covers protected", async () => {
         await clear();
         const source = await seed({ ends_on: null });
         await assert.rejects(advance(source.id), /ending date/);
         await assert.rejects(advance(source.id, payload({ teacher_id: "ffffffff-ffff-ffff-ffff-ffffffffffff" }), "2026-10-31"));
         assert.equal((await get(source.id)).ends_on, null);
         await cover(source.id, "2026-11-04");
         await assert.rejects(advance(source.id, payload(), "2026-10-31"), /existing cover/);
         assert.equal((await get(source.id)).ends_on, null);
         await db.exec("delete from teacher_lesson_covers");
         await advance(source.id, payload(), "2026-10-31");
         assert.equal((await get(source.id)).ends_on, "2026-10-31");
      });

      await t.test("period corrections reject overlaps, reordering and hidden covers", async () => {
         await clear();
         const source = await seed();
         const id = await advance(source.id);
         await assert.rejects(edit(source.id, payload({ teacher_id: teacher, level_id: level, starts_on: source.starts_on, ends_on: "2026-11-02" })), /overlap/);
         await assert.rejects(edit(id, payload({ starts_on: "2026-10-31" })), /overlap/);
         await assert.rejects(edit(id, payload({ starts_on: "2026-08-01" })), /overlap/);
         await assert.rejects(edit(id, payload({ ends_on: null, is_intake: true })), /intake/);
         await cover(id, "2026-11-04");
         await assert.rejects(edit(id, payload({ starts_on: "2026-11-05" })), /existing cover/);
         await assert.rejects(edit(id, payload({ ends_on: "2026-11-03" })), /existing cover/);
         await assert.rejects(edit(id, payload({ weekdays: [2, 4, 6] })), /existing cover/);
         await edit(id, payload({ starts_at: "14:00", ends_at: "15:30" }));
         assert.equal((await get(id)).starts_at, "14:00:00");
         assert.deepEqual(await get(source.id), source);
         await assert.rejects(edit(id, payload({ active: false, archived_on: "2026-10-27" })), /Archive or Restore/);
      });

      await t.test("archive/restore affects all periods, preserves date ranges and retains cover records", async () => {
         await clear();
         const source = await seed();
         const id = await advance(source.id);
         await cover(source.id, "2026-10-26");
         await db.query("select set_teacher_group_active($1, false, '2026-10-27')", [source.id]);
         for (const groupId of [source.id, id]) {
            const period = await get(groupId);
            assert.equal(period.active, false);
            assert.equal(period.archived_on, "2026-10-27");
         }
         await assert.rejects(advance(id, payload({ level_id: level, starts_on: "2027-01-01", ends_on: "2027-02-28" })), /Only active regular groups/);
         await db.query("select set_teacher_group_active($1, true, '2026-11-01')", [id]);
         const restored = await get(source.id);
         assert.deepEqual({ ...restored, updated_at: source.updated_at }, source);
         assert.equal((await get(id)).active, true);
         assert.equal((await db.query("select count(*)::integer as count from teacher_lesson_covers")).rows[0].count, 1);
      });

      await t.test("intakes cannot advance and mutation functions are service-role-only", async () => {
         await clear();
         const intake = await seed({ is_intake: true, starts_on: null, ends_on: null });
         await assert.rejects(advance(intake.id), /Only active regular groups/);
         for (const signature of ["advance_teacher_group(uuid,jsonb,date)", "save_teacher_group_period(uuid,jsonb)", "set_teacher_group_active(uuid,boolean,date)"]) {
            for (const role of ["anon", "authenticated"]) {
               assert.equal((await db.query("select has_function_privilege($1, $2, 'EXECUTE') as allowed", [role, signature])).rows[0].allowed, false);
            }
            assert.equal((await db.query("select has_function_privilege('service_role', $1, 'EXECUTE') as allowed", [signature])).rows[0].allowed, true);
         }
      });
   } finally {
      await db.close();
   }
});
