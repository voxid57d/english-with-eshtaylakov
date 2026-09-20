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
const { parseStatistic, validateStatisticChanges, validateStatisticCategory, pasteStatisticCells, applyStatisticChanges } = statistics;
const categoryA = { id: "00000000-0000-0000-0000-000000000001", name: "Active debt", unit: "UZS", color: "#10b981" };
const categoryB = { id: "00000000-0000-0000-0000-000000000002", name: "Finished debt", unit: "UZS", color: "#6366f1" };
const entry = (value, entry_date = "2026-09-14", category_id = categoryA.id) => ({ category_id, entry_date, value });

test("statistics parses grouped currency values, decimals and negative figures without converting blanks to zero", () => {
   assert.equal(parseStatistic("23,758,000"), 23758000);
   assert.equal(parseStatistic("1 234.50"), 1234.5);
   assert.equal(parseStatistic("-12.25"), -12.25);
   assert.equal(parseStatistic("0"), 0);
   assert.equal(parseStatistic("   "), null);
   for (const value of ["1e3", "1.234", "12,34", "1 23", "NaN", "Infinity", "1000000000000", "-1000000000000"]) assert.throws(() => parseStatistic(value));
});

test("save validation rejects invalid dates, identifiers, precision, coercion and duplicate cells", () => {
   assert.equal(validateStatisticChanges([entry(12.5), entry(null, "2026-09-15")]).length, 2);
   for (const value of [[entry(1, "2026-02-30")], [entry(1, "2026-09-14", "bad")], [entry("2")], [entry(undefined)], [entry(0.123)], [entry(1), entry(2)], [], Array(5001).fill(entry(1))]) assert.throws(() => validateStatisticChanges(value));
});

test("category validation preserves units and rejects unknown units, invalid colors and empty names", () => {
   assert.equal(validateStatisticCategory(categoryA).unit, "UZS");
   for (const category of [{ ...categoryA, unit: "typo" }, { ...categoryA, color: "red" }, { ...categoryA, name: "  " }, { ...categoryA, id: "bad" }]) assert.throws(() => validateStatisticCategory(category));
});

test("spreadsheet paste maps rows to days and columns to visible categories, including blank and zero cells", () => {
   const pasted = pasteStatisticCells("23,758,000\t0\r\n\t122.50\r\n", marketing.monthDays("2026-09"), [categoryA, categoryB], 1, 0);
   assert.equal(pasted.length, 4);
   assert.equal(pasted[0].category_id, categoryA.id);
   assert.equal(pasted[0].entry_date, "2026-09-02");
   assert.equal(pasted[1].category_id, categoryB.id);
   assert.equal(pasted[1].text, "0");
   assert.equal(pasted[2].entry_date, "2026-09-03");
   assert.equal(pasted[2].text, "");
   assert.equal(pasteStatisticCells("5", ["2026-09-14"], [categoryB], 0, 0)[0].category_id, categoryB.id);
   assert.throws(() => pasteStatisticCells("1\tbad", ["2026-09-14"], [categoryA, categoryB], 0, 0));
   assert.throws(() => pasteStatisticCells("1\n2", ["2026-09-14"], [categoryA], 0, 0));
   assert.throws(() => pasteStatisticCells("1\t2", ["2026-09-14"], [categoryA], 0, 0));
});

test("saved corrections and clears update only the requested month while preserving explicit zeros", () => {
   const originals = [entry(100), entry(200, "2026-09-15"), entry(300, "2026-10-01")];
   const result = applyStatisticChanges(originals, [entry(0), entry(null, "2026-09-15"), entry(99, "2026-10-02")], "2026-09");
   assert.equal(result.length, 1);
   assert.equal(result[0].value, 0);
   assert.equal(originals.length, 3);
   assert.equal(originals[0].value, 100);
});

function apiHarness({ deny = false, dbError = null, pages = null } = {}) {
   const calls = [];
   const route = load("app/api/erp/statistics/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erp": { erpJsonError: (error) => ({ message: error.message, status: error.message === "Forbidden." ? 403 : 400 }) },
      "@/lib/marketingMetrics": marketing,
      "@/lib/statistics": statistics,
      "@/lib/erpAuth": {
         requireErpPermission: async (_req, module, action) => { calls.push({ module, action }); if (deny) throw new Error("Forbidden."); return { user: { id: "authenticated-user" }, staff: { role: "admin" } }; },
         getErpPermissions: async () => ({ statistics: ["view", "manage"] }),
      },
      "@/lib/supabaseAdmin": { supabaseAdmin: {
         rpc: async (name, payload) => { calls.push({ name, payload }); return { error: dbError }; },
         from: (table) => {
            if (!pages) throw new Error("Unexpected table access");
            const query = {
               select: () => query, order: () => query,
               gte: (column, value) => { calls.push({ column, value, op: "gte" }); return query; },
               lte: (column, value) => { calls.push({ column, value, op: "lte" }); return query; },
               range: async (start, end) => { calls.push({ table, start, end }); return { data: (pages[table] || []).slice(start, end + 1), error: dbError }; },
            };
            return query;
         },
      } },
   });
   return { route, calls };
}

test("Statistics requires its own view/manage permission before accessing data", async () => {
   const { route, calls } = apiHarness({ deny: true });
   assert.equal((await route.GET({ url: "https://app.test/api/erp/statistics?month=2026-09" })).status, 403);
   assert.equal((await route.POST({ json: async () => ({ action: "saveEntries", changes: [entry(10)] }) })).status, 403);
   assert.equal(calls.length, 2);
   assert.equal(calls[0].module, "statistics");
   assert.equal(calls[0].action, "view");
   assert.equal(calls[1].action, "manage");
});

test("batch saving uses one atomic RPC and the authenticated user, including cleared cells", async () => {
   const { route, calls } = apiHarness();
   const response = await route.POST({ json: async () => ({ action: "saveEntries", actor: "spoofed", changes: [entry(12.5), entry(null, "2026-09-15")] }) });
   assert.equal(response.status, 200);
   assert.equal(calls[1].name, "save_statistics_entries");
   assert.equal(calls[1].payload.actor, "authenticated-user");
   assert.equal(calls[1].payload.changes[1].value, null);
});

test("deleting a category requires manage access and uses one atomic database operation", async () => {
   const body = { action: "deleteCategory", id: categoryA.id };
   const denied = apiHarness({ deny: true });
   assert.equal((await denied.route.POST({ json: async () => body })).status, 403);
   assert.equal(denied.calls.length, 1);
   const allowed = apiHarness();
   assert.equal((await allowed.route.POST({ json: async () => body })).status, 200);
   assert.equal(allowed.calls[0].module, "statistics");
   assert.equal(allowed.calls[0].action, "manage");
   assert.equal(allowed.calls.length, 2);
   assert.equal(allowed.calls[1].name, "delete_statistics_category");
   assert.equal(allowed.calls[1].payload.target_category_id, categoryA.id);
});

test("invalid category deletion never reaches storage and failed deletion is not reported as success", async () => {
   const invalid = apiHarness();
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "deleteCategory", id: "bad" }) })).status, 400);
   assert.equal(invalid.calls.length, 1);
   const failed = apiHarness({ dbError: { code: "PGRST202" } });
   const response = await failed.route.POST({ json: async () => ({ action: "deleteCategory", id: categoryA.id }) });
   assert.equal(response.status, 400);
   assert.match(response.body.error, /statistics_schema.sql/);
});

test("invalid writes never reach the database and migration failures are surfaced", async () => {
   const invalid = apiHarness();
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "saveEntries", changes: [entry("wrong")] }) })).status, 400);
   assert.equal(invalid.calls.length, 1);
   const failed = apiHarness({ dbError: { code: "PGRST202" } });
   const response = await failed.route.POST({ json: async () => ({ action: "saveEntries", changes: [entry(12.5)] }) });
   assert.equal(response.status, 400);
   assert.match(response.body.error, /statistics_schema.sql/);
});

test("monthly reads fetch all pages and return numeric values with calendar bounds", async () => {
   const { route, calls } = apiHarness({ pages: { statistics_categories: [categoryA], statistics_entries: Array.from({ length: 1001 }, () => entry("12.50")) } });
   const response = await route.GET({ url: "https://app.test/api/erp/statistics?month=2024-02" });
   assert.equal(response.status, 200);
   assert.equal(response.body.entries.length, 1001);
   assert.equal(response.body.entries[0].value, 12.5);
   assert.ok(calls.some((call) => call.table === "statistics_entries" && call.start === 1000));
   assert.ok(calls.some((call) => call.op === "gte" && call.value === "2024-02-01"));
   assert.ok(calls.some((call) => call.op === "lte" && call.value === "2024-02-29"));
   assert.equal(response.body.canManage, true);
});

const Chart = load("components/marketing/MarketingChart.tsx", {
   react: React, "react/jsx-runtime": jsxRuntime,
   "@/lib/marketingMetrics": marketing, "./marketing.module.css": { default: {} },
}).default;
const Charts = load("components/statistics/StatisticsCharts.tsx", {
   react: React, "react/jsx-runtime": jsxRuntime, "@/lib/statistics": statistics,
   "@/components/marketing/MarketingChart": { default: Chart },
   "@/components/marketing/marketing.module.css": { default: {} }, "./statistics.module.css": { default: {} },
}).default;

test("Statistics shares chart rendering but uses category labels and keeps incompatible units out", () => {
   const html = renderToStaticMarkup(React.createElement(Charts, {
      categories: [categoryA, categoryB, { id: "students", name: "Students", unit: "number", color: "#ff0000" }],
      entries: [entry(23758000), entry(20000000, "2026-09-15"), entry(100, "2026-09-14", "students")],
      days: marketing.monthDays("2026-09"), date: "2026-09-14", monthLabel: "September 2026", onDateChange: () => {},
   }));
   assert.equal((html.match(/<svg /g) || []).length, 3);
   assert.match(html, /Daily category comparison/);
   assert.match(html, /Monthly category trends/);
   assert.match(html, /Change over the month/);
   assert.match(html, /23,758,000/);
   assert.match(html, /STATISTICS/);
   assert.doesNotMatch(html, /Students|SUBSCRIBERS|MARKETING METRICS|NaN|Infinity/);
});

test("shared line plots keep negative values inside the plot and decimals display cleanly", () => {
   const props = {
      centres: [categoryA], entries: [{ centre_id: categoryA.id, platform_id: "stats", entry_date: "2026-09-14", subscribers: -12.25 }, { centre_id: categoryA.id, platform_id: "stats", entry_date: "2026-09-15", subscribers: 1.5 }],
      platformId: "stats", platformName: "USD", days: marketing.monthDays("2026-09"), date: "2026-09-14", monthLabel: "September 2026",
      presentation: { title: "Trend", subtitle: "USD", toolbar: "Statistics", axisLabel: "USD", footer: "Recorded values", filename: "statistics.jpg", emptyMessage: "No data" },
   };
   const trend = renderToStaticMarkup(React.createElement(Chart, { ...props, kind: "trend" }));
   for (const match of trend.matchAll(/<circle[^>]+cy="([\d.]+)"/g)) { const y = Number(match[1]); assert.ok(y >= 165 && y <= 500); }
   assert.match(trend, /-12.25/);
   const growth = renderToStaticMarkup(React.createElement(Chart, { ...props, kind: "growth" }));
   assert.match(growth, /13.75/);
   assert.match(growth, /non-positive baseline/);
});
