import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import ts from "typescript";

// Run the real TypeScript calculation modules without a Next server or database.
const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function loadTs(relativePath) {
   const filename = path.join(root, relativePath);
   if (cache.has(filename)) return cache.get(filename);
   const exports = {};
   cache.set(filename, exports);
   const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
   });
   vm.runInNewContext(outputText, {
      exports,
      require: (name) => {
         if (!name.startsWith("@/")) throw new Error(`Unexpected dependency: ${name}`);
         return loadTs(`${name.slice(2)}.ts`);
      },
   }, { filename });
   return exports;
}

const { summarizeMonthly, finalWorkMinutes } = loadTs("lib/shiftPayroll.ts");
const { summarizeAttendance, attendanceLabel } = loadTs("lib/shiftCalculations.ts");
const { getLocalDateString } = loadTs("lib/localDate.ts");
const { getWeekBounds, getMonthBounds } = loadTs("lib/erp.ts");

const rates = [{
   role: "salesman", salary_tier: "tier_1", hourly_rate: 100,
   extra_hours_enabled: true, extra_hourly_rate: 200, extra_hours_threshold: 8,
}];
function shift(overrides = {}) {
   return {
      id: "shift-1", staff_user_id: "staff-1", staff_name_snapshot: "Worker",
      staff_role_snapshot: "salesman", salary_tier_snapshot: "tier_1",
      shift_date: "2026-09-07", starts_at: "08:00", ends_at: "18:00",
      break_minutes: 0, attendance_assessed: true, absence_reason: null,
      late_minutes: 0, uniform_ok: true, late_counts_penalty: false,
      work_quality: "normal", hourly_rate_snapshot: 100,
      hourly_rate_override: null, extra_hourly_rate_override: null,
      extra_hours_enabled_override: null,
      ...overrides,
   };
}
const salary = (shifts, settings = rates) => summarizeMonthly(shifts, settings, [])[0]?.grossSalary ?? 0;

test("10 worked hours pays 8 base hours and 2 extra hours", () => {
   assert.equal(salary([shift()]), 1200);
});
test("disabled overtime pays every worked hour at the base rate", () => {
   assert.equal(salary([shift()], [{ ...rates[0], extra_hours_enabled: false }]), 1000);
});
test("breaks and late deductions are removed before applying overtime", () => {
   assert.equal(salary([shift({ break_minutes: 60, late_minutes: 60 })]), 800);
   assert.equal(salary([shift({ break_minutes: 30 })]), 1100);
});
test("multiple shifts share a daily threshold regardless of query order", () => {
   const first = shift({ ends_at: "13:00" });
   const second = shift({ id: "shift-2", starts_at: "14:00", ends_at: "19:00" });
   assert.equal(salary([second, first]), 1200);
});
test("daily thresholds reset for each worker and date", () => {
   const first = shift({ ends_at: "13:00" });
   assert.equal(salary([first, shift({ ends_at: "13:00", shift_date: "2026-09-08" })]), 1000);
   const summaries = summarizeMonthly([first, shift({ staff_user_id: "staff-2", ends_at: "13:00" })], rates, []);
   assert.equal(summaries.length, 2);
   assert.equal(summaries[0].grossSalary, 500);
   assert.equal(summaries[1].grossSalary, 500);
});
test("explicit per-shift overrides take priority, including false and zero", () => {
   assert.equal(salary([shift({ extra_hours_enabled_override: false })]), 1000);
   assert.equal(salary([shift({ extra_hourly_rate_override: 0 })]), 800);
   assert.equal(salary([shift({ hourly_rate_override: 150, extra_hourly_rate_override: 300 })]), 1800);
});
test("zero and fractional thresholds work without rounding each shift", () => {
   assert.equal(salary([shift()], [{ ...rates[0], extra_hours_threshold: 0 }]), 2000);
   assert.equal(salary([shift()], [{ ...rates[0], extra_hours_threshold: 8.5 }]), 1150);
});
test("unassessed shifts cannot count as attendance, quality, penalties or pay", () => {
   const pending = { isAssessed: false, absenceReason: null };
   assert.equal(attendanceLabel(pending), "Not assessed");
   const counts = summarizeAttendance([pending, { isAssessed: true, absenceReason: null }, { isAssessed: true, absenceReason: "asked" }]);
   assert.equal(counts.total, 3);
   assert.equal(counts.came, 1);
   assert.equal(counts.absent, 1);
   assert.equal(counts.notAssessed, 1);
   const unassessed = shift({ attendance_assessed: false, uniform_ok: false, work_quality: "bad" });
   assert.equal(finalWorkMinutes(unassessed), 0);
   assert.equal(summarizeMonthly([unassessed], rates, []).length, 0);
});
test("absences earn no pay and do not consume another shift's regular hours", () => {
   const absent = shift({ absence_reason: "asked" });
   assert.equal(salary([absent]), 0);
   assert.equal(salary([absent, shift({ id: "shift-2", starts_at: "18:00", ends_at: "22:00" })]), 400);
});
test("Tashkent midnight uses the new local day, week, month and year", () => {
   const monday = new Date("2026-09-06T20:00:00Z");
   assert.equal(getLocalDateString(monday), "2026-09-07");
   assert.equal(getWeekBounds(monday).weekStart, "2026-09-07");
   const newYear = new Date("2026-12-31T19:01:00Z");
   assert.equal(getLocalDateString(newYear), "2027-01-01");
   assert.equal(getMonthBounds(newYear).periodStart, "2027-01-01");
});
test("date-only arithmetic preserves selected dates and handles leap years", () => {
   assert.equal(getWeekBounds("2026-09-06").weekStart, "2026-08-31");
   assert.equal(getMonthBounds("2028-02-15").periodEnd, "2028-02-29");
   assert.equal(getLocalDateString(new Date("2026-09-07T01:00:00Z"), "America/New_York"), "2026-09-06");
});
