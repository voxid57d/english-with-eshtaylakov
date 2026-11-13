import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(file, modules = {}) {
   const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, Error, URL, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}
const marketing = load("lib/marketingMetrics.ts");
const statistics = load("lib/statistics.ts", { "@/lib/marketingMetrics": marketing });
const { parseStatistic, validateStatisticCategory, validateStatisticReading, statisticInstant, statisticDate, statisticTime, statisticMonthWindow, dayChange, monthChange, dayPoints, changeSincePrevious } = statistics;
const categoryA = { id: "00000000-0000-0000-0000-000000000001", name: "Active debt", unit: "UZS", color: "#10b981" };
const categoryB = { id: "00000000-0000-0000-0000-000000000002", name: "Finished debt", unit: "UZS", color: "#6366f1" };
const students = { id: "00000000-0000-0000-0000-000000000003", name: "Students", unit: "number", color: "#ff0000" };
let nextId = 0;
// A check-in at a Tashkent date and time holding the given category figures.
const reading = (date, time, values, note = null) => ({ id: `00000000-0000-0000-0001-${String(++nextId).padStart(12, "0")}`, recorded_at: statisticInstant(date, time), note, values });
const NOW = Date.parse("2026-11-13T12:00:00Z");

test("statistics parses grouped currency values, decimals and negative figures without converting blanks to zero", () => {
   assert.equal(parseStatistic("23,758,000"), 23758000);
   assert.equal(parseStatistic("1 234.50"), 1234.5);
   assert.equal(parseStatistic("-12.25"), -12.25);
   assert.equal(parseStatistic("0"), 0);
   assert.equal(parseStatistic("   "), null);
   for (const value of ["1e3", "1.234", "12,34", "1 23", "NaN", "Infinity", "1000000000000", "-1000000000000"]) assert.throws(() => parseStatistic(value));
});

test("category validation preserves units and rejects unknown units, invalid colors and empty names", () => {
   assert.equal(validateStatisticCategory(categoryA).unit, "UZS");
   for (const category of [{ ...categoryA, unit: "typo" }, { ...categoryA, color: "red" }, { ...categoryA, name: "  " }, { ...categoryA, id: "bad" }]) assert.throws(() => validateStatisticCategory(category));
});

test("entry times are Tashkent time and month windows include the lookback days", () => {
   assert.equal(statisticInstant("2026-11-12", "09:30"), "2026-11-12T04:30:00.000Z");
   assert.equal(statisticDate("2026-11-11T20:00:00Z"), "2026-11-12");
   assert.equal(statisticTime("2026-11-11T20:00:00Z"), "01:00");
   for (const [date, time] of [["2026-02-30", "10:00"], ["2026-11-12", "24:00"], ["2026-11-12", "9:30"], ["bad", "10:00"]]) assert.throws(() => statisticInstant(date, time));
   const window = statisticMonthWindow("2026-11");
   assert.equal(window.from, "2026-10-17T19:00:00.000Z");
   assert.equal(window.to, "2026-11-30T19:00:00.000Z");
   assert.throws(() => statisticMonthWindow("2026-13"));
});

test("entry validation normalises time and note and rejects future, empty, duplicate or malformed figures", () => {
   const valid = { recorded_at: "2026-11-12T14:30:00+05:00", note: "  evening  ", values: [{ category_id: categoryA.id, value: 12.5 }, { category_id: categoryB.id, value: 0 }] };
   const result = validateStatisticReading(valid, NOW);
   assert.equal(result.recorded_at, "2026-11-12T09:30:00.000Z");
   assert.equal(result.note, "evening");
   assert.equal(result.values.length, 2);
   assert.equal(result.id, undefined);
   assert.equal(validateStatisticReading({ ...valid, note: "   " }, NOW).note, null);
   assert.equal(validateStatisticReading({ ...valid, id: categoryA.id }, NOW).id, categoryA.id);
   for (const body of [
      null, { ...valid, values: [] }, { ...valid, values: undefined }, { ...valid, recorded_at: "2026-11-14T10:00:00Z" }, { ...valid, recorded_at: "yesterday" },
      { ...valid, id: "bad" }, { ...valid, note: "x".repeat(201) }, { ...valid, values: [{ category_id: "bad", value: 1 }] },
      { ...valid, values: [{ category_id: categoryA.id, value: 1 }, { category_id: categoryA.id, value: 2 }] },
      { ...valid, values: [{ category_id: categoryA.id, value: "2" }] }, { ...valid, values: [{ category_id: categoryA.id, value: 0.123 }] },
      { ...valid, values: Array.from({ length: 501 }, (_, index) => ({ category_id: `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`, value: 1 })) },
   ]) assert.throws(() => validateStatisticReading(body, NOW));
});

// Saturday evening, nothing on Sunday, then morning and night on Monday.
const week = [
   reading("2026-11-07", "18:00", { [categoryA.id]: 100, [categoryB.id]: 50 }),
   reading("2026-11-09", "09:00", { [categoryA.id]: 110 }),
   reading("2026-11-09", "21:00", { [categoryA.id]: 130, [categoryB.id]: 55 }, "after classes"),
];

test("change on the day compares the latest entry with the last entry of an earlier day, skipping empty days", () => {
   const change = dayChange(week, categoryA.id, "2026-11-09");
   assert.equal(change.value, 130);
   assert.equal(change.change, 30);
   assert.equal(change.since, week[0].recorded_at);
   assert.equal(change.stepChange, 20);
   assert.equal(change.stepSince, week[1].recorded_at);
   assert.equal(dayChange(week, categoryB.id, "2026-11-09").change, 5);
   assert.equal(dayChange(week, categoryA.id, "2026-11-08"), null);
   const sparse = [reading("2026-10-30", "10:00", { [categoryA.id]: 1 }), reading("2026-11-09", "10:00", { [categoryA.id]: 5 })];
   assert.equal(dayChange(sparse, categoryA.id, "2026-11-09").change, null);
   assert.equal(dayChange(sparse, categoryA.id, "2026-11-09").stepChange, 4);
   assert.equal(changeSincePrevious(week, week[2].id, categoryA.id), 20);
   assert.equal(changeSincePrevious(week, week[2].id, categoryB.id), 5);
   assert.equal(changeSincePrevious(week, week[0].id, categoryA.id), null);
});

test("monthly change starts from the last figure before the month and ignores later months", () => {
   const readings = [
      reading("2026-10-31", "18:00", { [categoryA.id]: 80 }), reading("2026-11-03", "09:00", { [categoryA.id]: 90 }),
      reading("2026-11-30", "23:59", { [categoryA.id]: 100 }), reading("2026-12-01", "00:30", { [categoryA.id]: 999 }),
   ];
   const change = monthChange(readings, categoryA.id, "2026-11");
   assert.equal(change.change, 20);
   assert.equal(change.percent, 25);
   assert.equal(change.start, readings[0].recorded_at);
   assert.equal(change.end, readings[2].recorded_at);
   assert.equal(monthChange(readings.slice(1), categoryA.id, "2026-11").start, readings[1].recorded_at);
   assert.equal(monthChange([readings[1]], categoryA.id, "2026-11"), null);
   assert.equal(monthChange([reading("2026-11-03", "09:00", { [categoryA.id]: 0 }), reading("2026-11-04", "09:00", { [categoryA.id]: 5 })], categoryA.id, "2026-11").percent, null);
});

test("day view returns the day's entries plus the last earlier figure", () => {
   const day = dayPoints(week, categoryA.id, "2026-11-09");
   assert.equal(day.points.length, 2);
   assert.equal(day.before.value, 100);
   assert.equal(dayPoints(week, categoryA.id, "2026-11-07").before, null);
});

function apiHarness({ deny = false, dbError = null, pages = null, rpcData = "00000000-0000-0000-0000-0000000000aa" } = {}) {
   const calls = [];
   const route = load("app/api/erp/statistics/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erp": { erpJsonError: (error) => ({ message: error.message, status: error.message === "Forbidden." ? 403 : 400 }) },
      "@/lib/statistics": statistics,
      "@/lib/erpAuth": {
         requireErpPermission: async (_req, module, action) => { calls.push({ module, action }); if (deny) throw new Error("Forbidden."); return { user: { id: "authenticated-user" }, staff: { role: "admin" } }; },
         getErpPermissions: async () => ({ statistics: ["view", "manage"] }),
      },
      "@/lib/supabaseAdmin": { supabaseAdmin: {
         rpc: async (name, payload) => { calls.push({ name, payload }); return { data: dbError ? null : rpcData, error: dbError }; },
         from: (table) => {
            if (!pages) throw new Error("Unexpected table access");
            const query = {
               select: (columns) => { calls.push({ table, columns, op: "select" }); return query; }, order: () => query,
               gte: (column, value) => { calls.push({ column, value, op: "gte" }); return query; },
               lt: (column, value) => { calls.push({ column, value, op: "lt" }); return query; },
               range: async (start, end) => { calls.push({ table, start, end }); return { data: (pages[table] || []).slice(start, end + 1), error: dbError }; },
            };
            return query;
         },
      } },
   });
   return { route, calls };
}
const saveBody = (recorded_at = new Date(Date.now() - 3600_000).toISOString()) => ({ action: "saveReading", actor: "spoofed", reading: { recorded_at, note: null, values: [{ category_id: categoryA.id, value: 12.5 }] } });

test("Statistics requires its own view/manage permission before accessing data", async () => {
   const { route, calls } = apiHarness({ deny: true });
   assert.equal((await route.GET({ url: "https://app.test/api/erp/statistics?month=2026-09" })).status, 403);
   assert.equal((await route.POST({ json: async () => saveBody() })).status, 403);
   assert.equal(calls.length, 2);
   assert.equal(calls[0].module, "statistics");
   assert.equal(calls[0].action, "view");
   assert.equal(calls[1].action, "manage");
});

test("monthly reads fetch all pages of entries in the Tashkent month window with numeric figures", async () => {
   const row = { id: "r1", recorded_at: "2024-02-10T04:30:00+00:00", note: "morning", statistics_reading_values: [{ category_id: categoryA.id, value: "12.50" }, { category_id: categoryB.id, value: "0" }] };
   const { route, calls } = apiHarness({ pages: { statistics_categories: [categoryA], statistics_readings: Array.from({ length: 1001 }, () => row) } });
   const response = await route.GET({ url: "https://app.test/api/erp/statistics?month=2024-02" });
   assert.equal(response.status, 200);
   assert.equal(response.body.readings.length, 1001);
   assert.equal(response.body.readings[0].values[categoryA.id], 12.5);
   assert.equal(response.body.readings[0].values[categoryB.id], 0);
   assert.equal(response.body.readings[0].recorded_at, "2024-02-10T04:30:00.000Z");
   assert.ok(calls.some((call) => call.table === "statistics_readings" && call.start === 1000));
   assert.ok(calls.some((call) => call.op === "gte" && call.column === "recorded_at" && call.value === "2024-01-17T19:00:00.000Z"));
   assert.ok(calls.some((call) => call.op === "lt" && call.column === "recorded_at" && call.value === "2024-02-29T19:00:00.000Z"));
   assert.equal(response.body.canManage, true);
   assert.equal((await route.GET({ url: "https://app.test/api/erp/statistics?month=bad" })).status, 400);
});

test("saving an entry uses one atomic RPC with the authenticated user and normalised time", async () => {
   const { route, calls } = apiHarness();
   const response = await route.POST({ json: async () => saveBody("2026-11-12T14:30:00+05:00") });
   assert.equal(response.status, 200);
   assert.equal(response.body.id, "00000000-0000-0000-0000-0000000000aa");
   assert.equal(calls[1].name, "save_statistics_reading");
   assert.equal(calls[1].payload.actor, "authenticated-user");
   assert.equal(calls[1].payload.reading.recorded_at, "2026-11-12T09:30:00.000Z");
   assert.equal(calls[1].payload.reading.values[0].value, 12.5);
});

test("invalid entries never reach the database and setup or conflict failures are explained", async () => {
   const invalid = apiHarness();
   assert.equal((await invalid.route.POST({ json: async () => saveBody(new Date(Date.now() + 3600_000).toISOString()) })).status, 400);
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "saveReading", reading: { recorded_at: new Date().toISOString(), values: [] } }) })).status, 400);
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "saveEntries", changes: [] }) })).status, 400);
   assert.equal(invalid.calls.filter((call) => call.name).length, 0);
   const setup = apiHarness({ dbError: { code: "PGRST202" } });
   assert.match((await setup.route.POST({ json: async () => saveBody() })).body.error, /statistics_readings\.sql/);
   const gone = apiHarness({ dbError: { code: "P0002" } });
   assert.match((await gone.route.POST({ json: async () => saveBody() })).body.error, /no longer exists/);
});

test("deleting an entry requires manage access, a valid id, and reports entries that are already gone", async () => {
   const body = { action: "deleteReading", id: categoryA.id };
   const denied = apiHarness({ deny: true });
   assert.equal((await denied.route.POST({ json: async () => body })).status, 403);
   assert.equal(denied.calls.length, 1);
   const allowed = apiHarness({ rpcData: true });
   assert.equal((await allowed.route.POST({ json: async () => body })).status, 200);
   assert.equal(allowed.calls[1].name, "delete_statistics_reading");
   assert.equal(allowed.calls[1].payload.target_reading_id, categoryA.id);
   assert.equal((await allowed.route.POST({ json: async () => ({ action: "deleteReading", id: "bad" }) })).status, 400);
   const gone = apiHarness({ rpcData: false });
   const response = await gone.route.POST({ json: async () => body });
   assert.equal(response.status, 400);
   assert.match(response.body.error, /no longer exists/);
});

test("deleting a category requires manage access and uses one atomic database operation", async () => {
   const body = { action: "deleteCategory", id: categoryA.id };
   const allowed = apiHarness({ rpcData: true });
   assert.equal((await allowed.route.POST({ json: async () => body })).status, 200);
   assert.equal(allowed.calls[1].name, "delete_statistics_category");
   assert.equal(allowed.calls[1].payload.target_category_id, categoryA.id);
   const invalid = apiHarness();
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "deleteCategory", id: "bad" }) })).status, 400);
   assert.equal(invalid.calls.length, 1);
});

const css = { default: {} };
const Chart = load("components/statistics/StatisticsChart.tsx", {
   react: React, "react/jsx-runtime": jsxRuntime, "@/lib/chartExport": load("lib/chartExport.ts"),
   "@/lib/marketingMetrics": marketing, "@/lib/statistics": statistics, "@/components/marketing/marketing.module.css": css,
});
const CalendarInput = load("components/ui/CalendarInput.tsx", { react: React, "react-dom": { createPortal: (child) => child }, "react/jsx-runtime": jsxRuntime, "@/lib/marketingMetrics": marketing, "./CalendarInput.module.css": css }).default;
const Charts = load("components/statistics/StatisticsCharts.tsx", {
   "@/components/ui/CalendarInput": { default: CalendarInput }, "@/lib/marketingCalendar": load("lib/marketingCalendar.ts"),
   react: React, "react/jsx-runtime": jsxRuntime, "@/lib/statistics": statistics, "@/lib/marketingMetrics": marketing,
   "./StatisticsChart": Chart, "@/components/marketing/marketing.module.css": css, "./statistics.module.css": css,
}).default;
const renderCharts = (readings, date = "2026-11-09") => renderToStaticMarkup(React.createElement(Charts, {
   categories: [categoryA, categoryB, students], readings, month: "2026-11", date, monthLabel: "November 2026", onDateChange: () => {},
}));

test("Statistics charts draw four views per unit from timestamped entries and keep other units out", () => {
   const html = renderCharts([...week, reading("2026-11-09", "10:00", { [students.id]: 40 })]);
   assert.equal((html.match(/role="img"/g) || []).length, 4);
   for (const title of ["Change on the day", "Through the day", "Over the month", "Change over the month"]) assert.match(html, new RegExp(title));
   assert.match(html, /\+30/);
   assert.match(html, /130 at 21:00 · vs Sat 11-07 18:00 · \+20 since Mon 11-09 09:00/);
   assert.match(html, /STATISTICS \//);
   assert.doesNotMatch(html, /Students|NaN|Infinity|MARKETING/);
});

test("trend lines stay solid within a day and dash across skipped days; the day view starts from the earlier figure", () => {
   const html = renderCharts(week);
   const trend = html.slice(html.indexOf("03 / MONTHLY TREND"), html.indexOf("04 / MONTHLY CHANGE"));
   // A: Sat → Mon 09:00 crosses Sunday (dashed), 09:00 → 21:00 is solid. B: Sat → Mon (dashed).
   assert.equal((trend.match(/stroke-dasharray="5 6"/g) || []).length, 2);
   assert.equal((trend.match(/<circle[^>]+r="4" fill="#(10b981|6366f1)"/g) || []).length, 5);
   const day = html.slice(html.indexOf("02 / DAY VIEW"), html.indexOf("03 / MONTHLY TREND"));
   assert.match(day, /before this day, Sat 11-07 18:00: 100/);
   assert.equal((day.match(/<circle[^>]+r="4" fill="#(10b981|6366f1)"/g) || []).length, 3);
});

test("charts explain what is missing instead of drawing broken or empty plots", () => {
   const html = renderCharts([reading("2026-11-09", "09:00", { [categoryA.id]: 110 })], "2026-11-12");
   assert.match(html, /Record a figure on Thu, Nov 12/);
   assert.match(html, /No entries on Thu, Nov 12/);
   assert.match(html, /Record at least two figures/);
   assert.equal((html.match(/role="img"/g) || []).length, 1);
});
