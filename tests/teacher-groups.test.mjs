import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(file, modules = {}) {
   const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
   });
   const exports = {};
   vm.runInNewContext(outputText, { exports, Error, URL, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}

const dates = load("lib/localDate.ts");
const erp = load("lib/erp.ts", { "@/lib/localDate": dates });
const { groupIsOnDate, groupIsWithinDates, groupProgressStage, groupSeries } = load("lib/teacherGroups.ts");
const old = {
   id: "old", seriesId: "cohort", startsOn: "2026-09-01", endsOn: "2026-10-31",
   weekdays: [1, 3, 5], active: true, archivedOn: null, isIntake: false,
   levelId: "elementary", teacherId: "teacher-1", activeStudentsCount: 12,
};
const next = {
   ...old, id: "next", startsOn: "2026-11-02", endsOn: "2026-12-30",
   levelId: "pre-intermediate", teacherId: "teacher-2", activeStudentsCount: 10,
   weekdays: [2, 4, 6],
};

test("schedule colours divide the inclusive period into five equal calendar stages", () => {
   const period = { startsOn: "2026-01-01", endsOn: "2026-01-25", isIntake: false };
   for (let day = 1; day <= 25; day++) {
      assert.equal(groupProgressStage(period, `2026-01-${String(day).padStart(2, "0")}`), Math.floor((day - 1) / 5));
   }
   assert.equal(groupProgressStage(period, "2025-12-31"), 0);
   assert.equal(groupProgressStage(period, "2026-01-26"), 4);
});

test("historical lesson colours use the saved level period and reset for the next level", () => {
   assert.equal(groupProgressStage(old, "2026-09-01"), 0);
   assert.equal(groupProgressStage(old, "2026-10-28"), 4);
   assert.equal(groupProgressStage(next, "2026-11-02"), 0);
   assert.equal(groupProgressStage(next, "2026-12-30"), 4);
});

test("progress stays stable across leap days, year changes and very short periods", () => {
   const period = { startsOn: "2024-02-27", endsOn: "2024-03-02", isIntake: false };
   assert.equal(groupProgressStage(period, "2024-02-29"), 2);
   assert.equal(groupProgressStage({ ...period, startsOn: "2026-12-30", endsOn: "2027-01-03" }, "2027-01-01"), 2);
   assert.equal(groupProgressStage({ ...period, startsOn: "2026-10-28", endsOn: "2026-10-28" }, "2026-10-28"), 4);
   assert.equal(groupProgressStage({ ...period, startsOn: "2026-10-28", endsOn: "2026-10-29" }, "2026-10-28"), 0);
   assert.equal(groupProgressStage({ ...period, startsOn: "2026-10-28", endsOn: "2026-10-29" }, "2026-10-29"), 4);
});

test("open-ended periods and intakes have no estimated progress", () => {
   for (const overrides of [{ startsOn: null }, { endsOn: null }, { isIntake: true }, { endsOn: "2026-08-01" }, { endsOn: "invalid" }]) {
      assert.equal(groupProgressStage({ ...old, ...overrides }, "2026-10-28"), null);
   }
});

test("advancing preserves old lesson dates, levels, teachers and cover lookup IDs", () => {
   const groups = [old, next];
   const covers = new Map([["old:2026-10-26", "substitute"]]);
   const past = groups.filter((group) => groupIsOnDate(group, "2026-10-26"));
   assert.equal(past.length, 1);
   assert.equal(past[0].levelId, "elementary");
   assert.equal(past[0].teacherId, "teacher-1");
   assert.equal(covers.get(`${past[0].id}:2026-10-26`), "substitute");
   assert.equal(groups.filter((group) => groupIsOnDate(group, "2026-11-03"))[0].levelId, "pre-intermediate");
   assert.equal(groupIsOnDate(next, "2026-10-27"), false);
   assert.equal(groupIsOnDate(old, "2026-11-02"), false);
});

test("period boundaries are inclusive and the gap between levels has no lessons", () => {
   assert.equal(groupIsWithinDates(old, "2026-09-01"), true);
   assert.equal(groupIsWithinDates(old, "2026-10-31"), true);
   assert.equal(groupIsWithinDates(old, "2026-11-01"), false);
   assert.equal(groupIsWithinDates(next, "2026-11-01"), false);
   assert.equal(groupIsWithinDates(next, "2026-11-02"), true);
   assert.equal(groupIsWithinDates(next, "2026-12-30"), true);
   assert.equal(groupIsWithinDates(next, "2026-12-31"), false);
});

test("one group card and one student count follow today's period, including non-lesson days", () => {
   const groups = [next, old];
   for (const [day, expected, students] of [["2026-10-27", "old", 12], ["2026-11-02", "next", 10]]) {
      const series = groupSeries(groups, day);
      assert.equal(series.length, 1);
      assert.equal(series[0].representative.id, expected);
      assert.equal(series[0].current.activeStudentsCount, students);
      assert.equal(series[0].periods[0].id, "old");
      assert.equal(series[0].latest.id, "next");
   }
   assert.equal(groups[0], next); // Sorting history never mutates the schedule's data.
});

test("future and completed groups remain accessible but do not inflate current totals", () => {
   for (const day of ["2026-08-31", "2026-11-01", "2027-01-01"]) {
      const series = groupSeries([old, next], day);
      assert.equal(series.length, 1);
      assert.equal(series[0].current, undefined);
   }
   assert.equal(groupSeries([old, next], "2026-08-31")[0].representative.id, "old");
   assert.equal(groupSeries([old, next], "2026-11-01")[0].representative.id, "next");
   assert.equal(groupSeries([old, next], "2027-01-01")[0].representative.id, "next");
   assert.equal(groupSeries([old, { ...next, seriesId: "different-group" }], "2026-10-27").length, 2);
});

test("archiving a group hides current and future lessons while retaining its past and covers", () => {
   const archived = [old, next].map((period) => ({ ...period, active: false, archivedOn: "2026-10-27" }));
   assert.equal(groupIsOnDate(archived[0], "2026-10-26"), true);
   assert.equal(groupIsOnDate(archived[0], "2026-10-28"), false);
   assert.equal(groupIsOnDate(archived[1], "2026-11-03"), false);
   assert.equal(groupSeries(archived, "2026-10-28")[0].current, undefined);
   const restored = archived.map((period) => ({ ...period, active: true, archivedOn: null }));
   assert.equal(groupIsOnDate(restored[0], "2026-10-28"), true);
   assert.equal(groupIsOnDate(restored[1], "2026-11-03"), true);
});

test("intake groups retain their existing recurring weekly schedule", () => {
   const intake = { ...old, isIntake: true, startsOn: null, endsOn: null, weekdays: [7] };
   assert.equal(groupIsOnDate(intake, "2026-11-01"), true);
   assert.equal(groupIsOnDate(intake, "2026-11-02"), false);
   assert.equal(groupSeries([intake], "2027-01-01")[0].current.id, "old");
});

const groupBody = {
   teacherId: "00000000-0000-0000-0000-000000000001",
   levelId: "00000000-0000-0000-0000-000000000002",
   lmsGroupName: "Morning group", lmsGroupId: "123",
   startsOn: "2026-11-02", endsOn: "2026-12-30", startsAt: "09:00", endsAt: "10:30",
   weekdays: [1, 3, 5], activeStudentsCount: 12, active: true, isIntake: false,
};
function apiHarness({ deny = false, rpcError = null, pages = {} } = {}) {
   const calls = [];
   const route = load("app/api/erp/teachers/route.ts", {
      "@/lib/localDate": dates,
      "@/lib/erp": erp,
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erpAuth": {
         canErp: async () => true,
         requireErpPermission: async (_req, module, action) => {
            calls.push({ permission: [module, action] });
            if (deny) throw new Error("Forbidden.");
            return { staff: { role: "admin" }, user: { id: "manager" } };
         },
      },
      "@/lib/supabaseAdmin": { supabaseAdmin: {
         rpc: async (name, payload) => { calls.push({ name, payload }); return { error: rpcError }; },
         from: (table) => {
            const query = {
               select: () => query, order: () => query, gte: () => query, lte: () => query,
               range: async (start, end) => {
                  calls.push({ table, start, end });
                  return { data: (pages[table] || []).slice(start, end + 1), error: null };
               },
               then: (resolve) => resolve({ data: pages[table] || [], error: null }),
            };
            return query;
         },
      } },
   });
   return { route, calls };
}
const request = (body) => ({ url: "https://app.test/api/erp/teachers?month=2026-10", json: async () => body });

test("next level, period corrections and archive require teacher manage permission", async () => {
   for (const [method, body] of [
      ["POST", { entity: "next_level", ...groupBody, sourceGroupId: "old" }],
      ["PATCH", { entity: "group", ...groupBody, id: "old" }],
      ["PATCH", { entity: "group_status", id: "old", active: false }],
   ]) {
      const { route, calls } = apiHarness({ deny: true });
      assert.equal((await route[method](request(body))).status, 403);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0].permission, ["teachers", "manage"]);
   }
});

test("next level uses an atomic transition and ignores client attempts to change group identity or archive history", async () => {
   const { route, calls } = apiHarness();
   const response = await route.POST(request({
      entity: "next_level", ...groupBody, sourceGroupId: "old", previousEndsOn: "2026-10-31",
      group_series_id: "forged", seriesId: "forged", active: false, isIntake: true,
   }));
   assert.equal(response.status, 200);
   const rpc = calls.find((call) => call.name);
   assert.equal(rpc.name, "advance_teacher_group");
   assert.equal(rpc.payload.source_group_id, "old");
   assert.equal(rpc.payload.next_period.starts_on, "2026-11-02");
   assert.equal(rpc.payload.next_period.active, true);
   assert.equal(rpc.payload.next_period.is_intake, false);
   assert.equal(rpc.payload.next_period.group_series_id, undefined);
});

test("invalid next periods never reach storage", async () => {
   for (const invalid of [
      { sourceGroupId: "" }, { endsOn: "" }, { startsOn: "bad" },
      { endsOn: "2026-10-01" }, { weekdays: [] }, { startsAt: "11:00" }, { activeStudentsCount: -1 },
   ]) {
      const { route, calls } = apiHarness();
      const response = await route.POST(request({ entity: "next_level", ...groupBody, sourceGroupId: "old", ...invalid }));
      assert.equal(response.status, 400);
      assert.equal(calls.some((call) => call.name), false);
   }
});

test("database rejections preserve their useful message and missing migrations have setup instructions", async () => {
   for (const [rpcError, expected] of [
      [{ code: "P0001", message: "This group already has a next level." }, /already has a next level/],
      [{ code: "PGRST202" }, /teacher_group_periods.sql/],
      [{ code: "23503", message: "internal database details" }, /Failed to save the group period/],
   ]) {
      const { route } = apiHarness({ rpcError });
      const response = await route.POST(request({ entity: "next_level", ...groupBody, sourceGroupId: "old" }));
      assert.equal(response.status, 400);
      assert.match(response.body.error, expected);
   }
});

test("corrections and status updates use the protected series operations", async () => {
   const { route, calls } = apiHarness();
   assert.equal((await route.PATCH(request({ entity: "group", ...groupBody, id: "old" }))).status, 200);
   assert.equal(calls.find((call) => call.name).name, "save_teacher_group_period");
   assert.equal((await route.PATCH(request({ entity: "group_status", id: "old", active: false, archivedOn: "1900-01-01" }))).status, 200);
   const status = calls.find((call) => call.name === "set_teacher_group_active");
   assert.equal(status.payload.enabled, false);
   assert.equal(status.payload.archive_date, dates.getLocalDateString());
});

test("group history is paginated and returns the stable series identity", async () => {
   const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `period-${index}`, group_series_id: "cohort", starts_at: "09:00:00", ends_at: "10:30:00",
      weekdays: [1, 3, 5], active: true,
   }));
   const { route, calls } = apiHarness({ pages: { teacher_lesson_groups: rows } });
   const response = await route.GET(request({}));
   assert.equal(response.status, 200);
   assert.equal(response.body.groups.length, 1001);
   assert.equal(response.body.groups[0].seriesId, "cohort");
   assert.ok(calls.some((call) => call.table === "teacher_lesson_groups" && call.start === 1000));
});
