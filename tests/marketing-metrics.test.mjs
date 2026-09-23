import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(path, modules = {}) {
   const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, URL, Error, atob, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}
const metrics = load("lib/marketingMetrics.ts");
const logos = load("lib/marketingLogo.ts");
const insights = load("lib/marketingInsights.ts", { "./marketingMetrics": metrics });
const insightCharts = load("components/marketing/MarketingInsightChart.tsx", {
   react: React, "react/jsx-runtime": jsxRuntime, "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
});
const Insights = load("components/marketing/MarketingInsights.tsx", {
   react: React, "react/jsx-runtime": jsxRuntime, "@/lib/marketingInsights": insights,
   "./MarketingInsightChart": insightCharts, "./marketing.module.css": { default: {} },
}).default;
const logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
const { monthDays, parseSubscribers, validateChanges, platformSeries, growthBetween } = metrics;
const centre_id = "00000000-0000-0000-0000-000000000001";
const platform_id = "00000000-0000-0000-0000-000000000002";
const change = (subscribers, entry_date = "2026-09-14") => ({ centre_id, platform_id, entry_date, subscribers });

test("monthly sheets use calendar dates including leap years and year boundaries", () => {
   assert.equal(monthDays("2024-02").length, 29);
   assert.equal(monthDays("2100-02").length, 28);
   assert.equal(monthDays("2026-09").at(-1), "2026-09-30");
   assert.equal(monthDays("2026-12").at(-1), "2026-12-31");
   for (const month of ["2026-13", "2026-00", "2026-2", "bad", "0000-01"]) assert.throws(() => monthDays(month));
});

test("subscriber input distinguishes missing data, zero, and grouped counts", () => {
   assert.equal(parseSubscribers("  "), null);
   assert.equal(parseSubscribers("0"), 0);
   assert.equal(parseSubscribers("183,873"), 183873);
   assert.equal(parseSubscribers("1 234 567"), 1234567);
   for (const value of ["-1", "1.5", "1e3", "12,34", "NaN", "Infinity", "1000000000000", "12 34"]) assert.throws(() => parseSubscribers(value));
});

test("save validation rejects invalid dates, IDs, coercion, duplicates, and oversized batches", () => {
   assert.equal(validateChanges([change(0), change(null, "2026-09-15")]).length, 2);
   for (const value of [[change(1, "2026-02-30")], [change("10")], [change(-1)], [change(1.5)], [change(undefined)], [{ ...change(1), centre_id: "bad" }], [change(1), change(2)], [], Array(5001).fill(change(1))]) assert.throws(() => validateChanges(value));
});

test("chart series isolate platforms and preserve unrecorded days as gaps", () => {
   const days = monthDays("2026-09");
   const series = platformSeries([{ id: centre_id, name: "Centre", color: "#10b981" }], [change(0), change(100, "2026-09-16"), { ...change(999), platform_id: "other" }], platform_id, days);
   assert.equal(series[0].points[13].value, 0);
   assert.equal(series[0].points[14].value, null);
   assert.equal(series[0].points[15].value, 100);
   assert.equal(series[0].points[0].value, null);
});

test("growth requires two observations and reports actual observed date ranges", () => {
   const point = (date, value) => ({ date, value });
   assert.equal(growthBetween([point("2026-09-01", 100), point("2026-09-02", null)]), null);
   const decline = growthBetween([point("2026-09-01", null), point("2026-09-14", 100), point("2026-09-15", null), point("2026-09-16", 75)]);
   assert.equal(decline.change, -25);
   assert.equal(decline.percent, -25);
   assert.equal(decline.start, "2026-09-14");
   assert.equal(decline.end, "2026-09-16");
   assert.equal(growthBetween([point("a", 0), point("b", 50)]).percent, null);
});

test("daily changes use the previous calendar day, including leap and year boundaries", () => {
   assert.equal(metrics.previousDate("2024-03-01"), "2024-02-29");
   assert.equal(metrics.previousDate("2026-01-01"), "2025-12-31");
   assert.equal(metrics.previousDate("2100-03-01"), "2100-02-28");
   const centres = [{ id: centre_id, name: "Centre", color: "#10b981" }];
   const delta = (entries) => metrics.dailyChanges(centres, entries, platform_id, "2026-09-01")[0].value;
   assert.equal(delta([change(0, "2026-08-31"), change(10, "2026-09-01")]), 10);
   assert.equal(delta([change(10, "2026-08-31"), change(0, "2026-09-01")]), -10);
   assert.equal(delta([change(0, "2026-08-31"), change(0, "2026-09-01")]), 0);
   assert.equal(delta([change(1.2, "2026-08-31"), change(1.3, "2026-09-01")]), 0.1);
   assert.equal(delta([change(10, "2026-08-30"), change(20, "2026-09-01")]), null);
   assert.equal(delta([change(10, "2026-08-31")]), null);
   assert.equal(delta([change(10, "2026-09-01"), { ...change(1, "2026-08-31"), platform_id: "other" }]), null);
});

test("daily change exports display signed increases, decreases, zero, and missing pairs", () => {
   const Chart = load("components/marketing/MarketingChart.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
   }).default;
   const centres = ["up", "down", "zero", "missing"].map((id) => ({ id, name: id, color: "#10b981" }));
   const entries = centres.flatMap((centre, index) => [
      { ...change(100, index === 3 ? "2026-08-30" : "2026-08-31"), centre_id: centre.id },
      { ...change([125, 90, 100, 150][index], "2026-09-01"), centre_id: centre.id },
   ]);
   const props = { kind: "change", centres, entries, platformId: platform_id, platformName: "Telegram", platformLogo: logo,
      days: monthDays("2026-09"), date: "2026-09-01", monthLabel: "September 2026" };
   const html = renderToStaticMarkup(React.createElement(Chart, props));
   assert.match(html, /Daily audience change/);
   assert.match(html, /2026-09-01 vs 2026-08-31/);
   assert.match(html, />\+25<\/text>/);
   assert.match(html, />-10<\/text>/);
   assert.match(html, />0<\/text>/);
   assert.match(html, />No data<\/text>/);
   assert.ok(html.includes(`<image href="${logo}"`));
   assert.doesNotMatch(html, /NaN|Infinity/);
   const empty = renderToStaticMarkup(React.createElement(Chart, { ...props, entries: entries.filter((entry) => entry.entry_date === "2026-09-01") }));
   assert.doesNotMatch(empty, /<svg/);
   assert.match(empty, /Record counts on both 2026-08-31 and 2026-09-01/);
});

test("daily total audience sums platforms for the exact date and preserves missing versus zero", () => {
   const centres = ["complete", "partial", "zero", "missing"].map((id) => ({ id, name: id, color: "#10b981" }));
   const platforms = ["telegram", "instagram"].map((id) => ({ id, name: id }));
   const entry = (centre_id, platform_id, subscribers, entry_date = "2026-09-15") => ({ centre_id, platform_id, subscribers, entry_date });
   const totals = metrics.dailyAudienceTotals(centres, platforms, [
      entry("complete", "telegram", 100), entry("complete", "instagram", 200),
      entry("complete", "telegram", 999, "2026-09-14"), entry("complete", "unknown", 999),
      entry("partial", "telegram", 50), entry("zero", "telegram", 0), entry("zero", "instagram", 0),
   ], "2026-09-15");
   assert.equal(totals[0].value, 300);
   assert.equal(totals[0].recordedPlatforms, 2);
   assert.equal(totals[1].value, 50);
   assert.equal(totals[1].recordedPlatforms, 1);
   assert.equal(totals[1].totalPlatforms, 2);
   assert.equal(totals[2].value, 0);
   assert.equal(totals[3].value, null);
   assert.equal(totals[3].recordedPlatforms, 0);
});

test("total audience chart includes all-platform totals and coverage in its export SVG", () => {
   const Chart = load("components/marketing/MarketingChart.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
   }).default;
   const html = renderToStaticMarkup(React.createElement(Chart, {
      kind: "total", centres: [{ id: centre_id, name: "IELTS ZONE", color: "#10b981" }],
      entries: [change(100), { ...change(200), platform_id: "another" }],
      platforms: [{ id: platform_id, name: "Telegram" }, { id: "another", name: "Instagram" }, { id: "third", name: "YouTube" }],
      platformId: platform_id, platformName: "Telegram", platformLogo: logo,
      days: monthDays("2026-09"), date: "2026-09-14", monthLabel: "September 2026",
   }));
   assert.match(html, /Total daily audience/);
   assert.match(html, /All platforms · 2026-09-14/);
   assert.match(html, /IELTS ZONE: 300/);
   assert.match(html, /2 \/ 3 platforms recorded · Partial total/);
   assert.match(html, /audiences may overlap/);
   assert.doesNotMatch(html, /<image|NaN|Infinity/);
});

function routeHarness({ deny = false, dbError = null, allowLinkWrites = false, allowPlatformWrites = false } = {}) {
   const calls = [];
   const route = load("app/api/erp/marketing/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erp": { erpJsonError: (error) => ({ message: error.message, status: error.message === "Forbidden." ? 403 : 400 }) },
      "@/lib/marketingMetrics": metrics,
      "@/lib/marketingLogo": logos,
      "@/lib/erpAuth": {
         requireErpPermission: async (_req, module, action) => { calls.push({ module, action }); if (deny) throw new Error("Forbidden."); return { user: { id: "actor" }, staff: { role: "admin" } }; },
         getErpPermissions: async () => ({ marketing: ["view", "manage"] }),
      },
      "@/lib/supabaseAdmin": { supabaseAdmin: {
         rpc: async (name, payload) => { calls.push({ name, payload }); return { error: dbError }; },
         from: (table) => {
            if (allowPlatformWrites) {
               const write = (payload) => {
                  calls.push({ table, payload });
                  const query = { eq: () => query, select: () => ({ single: async () => ({ data: payload, error: dbError }) }) };
                  return query;
               };
               return { insert: write, update: write };
            }
            if (!allowLinkWrites) throw new Error("Unexpected database access");
            return { upsert: (payload, options) => {
               calls.push({ table, payload, options });
               return { select: () => ({ single: async () => ({ data: payload, error: dbError }) }) };
            } };
         },
      } },
   });
   return { route, calls };
}

test("marketing writes require manage permission before accessing data", async () => {
   const { route, calls } = routeHarness({ deny: true });
   const result = await route.POST({ json: async () => ({ action: "saveEntries", changes: [change(100)] }) });
   assert.equal(result.status, 403);
   assert.equal(calls.length, 1);
   assert.equal(calls[0].module, "marketing");
   assert.equal(calls[0].action, "manage");
});

test("saving corrections and cleared cells uses one atomic RPC with the authenticated actor", async () => {
   const { route, calls } = routeHarness();
   const result = await route.POST({ json: async () => ({ action: "saveEntries", actor: "spoofed", changes: [change(100), change(null, "2026-09-15")] }) });
   assert.equal(result.status, 200);
   assert.equal(calls[1].name, "save_marketing_entries");
   assert.equal(calls[1].payload.actor, "actor");
   assert.equal(calls[1].payload.changes[1].subscribers, null);
});

test("invalid batches never reach the database and failed saves are not reported as success", async () => {
   const invalid = routeHarness();
   assert.equal((await invalid.route.POST({ json: async () => ({ action: "saveEntries", changes: [change(-1)] }) })).status, 400);
   assert.equal(invalid.calls.length, 1);
   const failed = routeHarness({ dbError: { code: "PGRST202" } });
   const result = await failed.route.POST({ json: async () => ({ action: "saveEntries", changes: [change(100)] }) });
   assert.equal(result.status, 400);
   assert.match(result.body.error, /marketing_metrics_schema.sql/);
});

test("marketing reads also enforce view permission", async () => {
   const { route, calls } = routeHarness({ deny: true });
   assert.equal((await route.GET({ url: "https://app.test/api/erp/marketing?month=2026-09" })).status, 403);
   assert.equal(calls[0].action, "view");
});

test("profile links accept common pasted domains and reject executable schemes and credentials", () => {
   assert.equal(metrics.parseProfileLink(" t.me/ieltszone "), "https://t.me/ieltszone");
   assert.equal(metrics.parseProfileLink("https://www.instagram.com/ieltszone/?hl=en"), "https://www.instagram.com/ieltszone/?hl=en");
   for (const url of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/a", "ftp://example.com", "https://user:password@example.com", "not a link", "", null, "https://", "https://example.com/" + "a".repeat(2048)]) assert.throws(() => metrics.parseProfileLink(url));
});

test("profile URL saves are scoped to centre and platform and require manage access", async () => {
   const body = { action: "profileLink", centre_id, platform_id, url: "t.me/ieltszone" };
   const denied = routeHarness({ deny: true });
   assert.equal((await denied.route.POST({ json: async () => body })).status, 403);
   assert.equal(denied.calls.length, 1);
   const allowed = routeHarness({ allowLinkWrites: true });
   const result = await allowed.route.POST({ json: async () => body });
   assert.equal(result.status, 200);
   assert.equal(allowed.calls[0].action, "manage");
   assert.equal(allowed.calls[1].table, "marketing_profile_links");
   assert.equal(allowed.calls[1].options.onConflict, "centre_id,platform_id");
   assert.equal(result.body.profileLink.centre_id, centre_id);
   assert.equal(result.body.profileLink.platform_id, platform_id);
   assert.equal(result.body.profileLink.url, "https://t.me/ieltszone");
});

test("invalid profile URLs never reach the database", async () => {
   const { route, calls } = routeHarness();
   assert.equal((await route.POST({ json: async () => ({ action: "profileLink", centre_id, platform_id, url: "javascript:alert(1)" }) })).status, 400);
   assert.equal(calls.length, 1);
});

test("platform names open saved URLs in a new tab and only managers can add or edit links", () => {
   const Component = load("components/marketing/PlatformProfileLink.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
   }).default;
   const props = { centreName: "IELTS ZONE", platformName: "Telegram", onSave: async () => {} };
   const render = (extra) => renderToStaticMarkup(React.createElement(Component, { ...props, ...extra }));
   const saved = render({ url: "https://t.me/ieltszone", canManage: true });
   assert.match(saved, /href="https:\/\/t.me\/ieltszone" target="_blank" rel="noopener noreferrer"/);
   assert.match(saved, /Edit IELTS ZONE&#x27;s Telegram link/);
   const unsaved = render({ canManage: true });
   assert.match(unsaved, /Add IELTS ZONE&#x27;s Telegram link/);
   assert.doesNotMatch(unsaved, /target="_blank"/);
   const readOnly = render({ url: "https://t.me/ieltszone", canManage: false });
   assert.match(readOnly, /target="_blank"/);
   assert.doesNotMatch(readOnly, /<button|<dialog/);
});

test("all export charts render valid standalone SVGs with accessible titles and no invalid coordinates", () => {
   const Chart = load("components/marketing/MarketingChart.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
   }).default;
   const centres = [{ id: centre_id, name: "Centre & Academy", color: "#10b981" }];
   for (const kind of ["daily", "trend", "growth"]) {
      const html = renderToStaticMarkup(React.createElement(Chart, {
         kind, centres, entries: [change(100), change(75, "2026-09-16")],
         platformId: platform_id, platformName: "Instagram", days: monthDays("2026-09"),
         date: "2026-09-14", monthLabel: "September 2026", platformLogo: logo,
      }));
      assert.match(html, /xmlns="http:\/\/www.w3.org\/2000\/svg"/);
      assert.match(html, /<title>[^<]+Instagram[^<]*<\/title>/);
      assert.match(html, /Centre &amp; Academy/);
      assert.ok(html.includes(`<image href="${logo}"`));
      assert.match(html, /<text x="91" y="90"/);
      assert.doesNotMatch(html, /NaN|Infinity/);
      if (kind === "growth") assert.match(html, /-25/);
   }
});

test("platform logos accept bounded PNG data and reject external images, SVGs, and oversized dimensions", () => {
   assert.equal(logos.validatePlatformLogo(logo), logo);
   assert.equal(logos.validatePlatformLogo(null), null);
   for (const invalid of ["https://example.com/logo.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,aGVsbG8=", "data:image/png;base64," + "A".repeat(350000), undefined]) assert.throws(() => logos.validatePlatformLogo(invalid));
   const oversized = Buffer.from(logo.slice(22), "base64");
   oversized.writeUInt32BE(257, 16);
   assert.throws(() => logos.validatePlatformLogo(`data:image/png;base64,${oversized.toString("base64")}`));
});

test("centre checkboxes exclude centres from every chart and export while allowing an empty selection", () => {
   const Chart = load("components/marketing/MarketingChart.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "@/lib/marketingMetrics": metrics, "./marketing.module.css": { default: {} },
   }).default;
   const Charts = load("components/marketing/MarketingCharts.tsx", {
      react: React, "react/jsx-runtime": jsxRuntime,
      "./MarketingChart": { default: Chart }, "./MarketingInsights": { default: Insights }, "./marketing.module.css": { default: {} },
   }).default;
   const centres = [{ id: centre_id, name: "Visible centre", color: "#10b981" }, { id: "hidden", name: "Hidden centre", color: "#6366f1" }];
   const platform = { id: platform_id, name: "Telegram" };
   const props = { centres, platform, platforms: [platform], days: monthDays("2026-09"), date: "2026-09-15", monthLabel: "September 2026", onToggle: () => {},
      entries: [change(100), change(120, "2026-09-15"), { ...change(99999), centre_id: "hidden" }, { ...change(199999, "2026-09-15"), centre_id: "hidden" }] };
   const html = renderToStaticMarkup(React.createElement(Charts, { ...props, excluded: new Set(["hidden"]) }));
   assert.equal((html.match(/type="checkbox"/g) || []).length, 2);
   const charts = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map((match) => match[0]);
   assert.equal(charts.length, 8); // Existing five, growth rate, heatmap, and audience share.
   for (const chart of charts) {
      assert.match(chart, /Visible centre/);
      assert.doesNotMatch(chart, /Hidden centre|99,999|199,999/);
   }
   const empty = renderToStaticMarkup(React.createElement(Charts, { ...props, excluded: new Set(centres.map((centre) => centre.id)) }));
   assert.match(empty, /Select at least one learning centre/);
   assert.doesNotMatch(empty, /<svg|Export JPG/);
});

test("insight growth compares exact shared endpoints and leaves zero baselines undefined", () => {
   const centres = [{ id: centre_id }, { id: "missing" }, { id: "zero" }];
   const rows = insights.comparisonGrowth(centres, [change(100), change(125, "2026-09-21"),
      { ...change(50, "2026-09-15"), centre_id: "missing" }, { ...change(75, "2026-09-21"), centre_id: "missing" },
      { ...change(0), centre_id: "zero" }, { ...change(40, "2026-09-21"), centre_id: "zero" },
      { ...change(999), platform_id: "other" }], platform_id, "2026-09-14", "2026-09-21");
   assert.equal(rows[0].percent, 25);
   assert.equal(rows[0].change, 25);
   assert.equal(rows[1].change, null);
   assert.equal(rows[2].change, 40);
   assert.equal(rows[2].percent, null);
   assert.equal(insights.comparisonGrowth(centres, [change(100)], platform_id, "2026-09-14", "2026-09-14")[0].change, null);
});

test("momentum uses exact seven-day endpoints, supports losses, and crosses calendar boundaries", () => {
   assert.equal(metrics.previousDate("2024-03-01", 7), "2024-02-23");
   assert.equal(metrics.previousDate("2026-01-01", 7), "2025-12-25");
   const series = insights.momentumSeries([{ id: centre_id }], [change(100, "2026-08-31"), change(90, "2026-09-07"), change(130, "2026-09-08")], platform_id, ["2026-09-07", "2026-09-08"]);
   assert.equal(series[0].points[0].value, -10);
   assert.equal(series[0].points[1].value, null);
   const zero = insights.momentumSeries([{ id: centre_id }], [change(0), change(0, "2026-09-21")], platform_id, ["2026-09-21"]);
   assert.equal(zero[0].points[0].value, 0);
});

test("marketing reads include the prior seven days and paginate all observations for momentum", async () => {
   const calls = [];
   const page = Array.from({ length: 1000 }, () => change(100, "2026-08-25"));
   const route = load("app/api/erp/marketing/route.ts", {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erp": { erpJsonError: (error) => ({ message: error.message, status: 400 }) },
      "@/lib/marketingMetrics": metrics, "@/lib/marketingLogo": logos,
      "@/lib/erpAuth": { requireErpPermission: async () => ({ staff: { role: "admin" } }), getErpPermissions: async () => ({ marketing: ["view"] }) },
      "@/lib/supabaseAdmin": { supabaseAdmin: { from: (table) => {
         const query = { select: () => query, order: () => query,
            gte: (field, value) => { calls.push({ table, field, min: value }); return query; },
            lte: (field, value) => { calls.push({ table, field, max: value }); return query; },
            range: async (start) => ({ data: table === "marketing_entries" ? start === 0 ? page : [change(120)] : [], error: null }),
            then: (resolve) => resolve({ data: [], error: null }),
         };
         return query;
      } } },
   });
   const result = await route.GET({ url: "https://app.test/api/erp/marketing?month=2026-09" });
   assert.equal(result.status, 200);
   assert.equal(result.body.entries.length, 1001);
   assert.equal(result.body.canManage, false);
   assert.equal(calls.filter((call) => call.min === "2026-08-25").length, 2);
   assert.equal(calls.filter((call) => call.max === "2026-09-30").length, 2);
});

test("audience shares use a complete fixed cohort and never turn missing or all-zero totals into shares", () => {
   const centres = [{ id: centre_id }, { id: "second" }];
   const entries = [change(100), { ...change(300), centre_id: "second" }, change(200, "2026-09-15"),
      change(0, "2026-09-16"), { ...change(0, "2026-09-16"), centre_id: "second" }];
   const shares = insights.audienceShareSeries(centres, entries, platform_id, ["2026-09-14", "2026-09-15", "2026-09-16"]);
   assert.equal(shares[0].points[0].value, 25);
   assert.equal(shares[1].points[0].value, 75);
   for (const series of shares) {
      assert.equal(series.points[1].value, null);
      assert.equal(series.points[2].value, null);
   }
   assert.equal(insights.audienceShareSeries(centres.slice(0, 1), entries, platform_id, ["2026-09-15"])[0].points[0].value, 100);
});

test("competitor gap preserves direction, requires both counts, and excludes unselected centres", () => {
   const centres = [{ id: centre_id, name: "Focus" }, { id: "second", name: "Competitor" }];
   const entries = [change(100), { ...change(150), centre_id: "second" }, change(175, "2026-09-15")];
   const gap = insights.competitorGapSeries(centres, entries, platform_id, ["2026-09-14", "2026-09-15"], centre_id, "second");
   assert.equal(gap[0].points[0].value, -50);
   assert.equal(gap[0].points[1].value, null);
   assert.equal(insights.competitorGapSeries(centres, entries, platform_id, ["2026-09-14"], "second", centre_id)[0].points[0].value, 50);
   assert.equal(insights.competitorGapSeries(centres.slice(0, 1), entries, platform_id, ["2026-09-14"], centre_id, "second").length, 0);
   assert.equal(insights.competitorGapSeries(centres, entries, platform_id, ["2026-09-14"], centre_id, centre_id).length, 0);
});

test("all five insights render exportable SVGs, shared dates, signed results, and explicit missing cells", () => {
   const centres = [{ id: centre_id, name: "Focus & Academy", color: "#10b981" }, { id: "second", name: "Competitor", color: "#6366f1" }];
   const platform = { id: platform_id, name: "Instagram" };
   const entries = [change(100), change(125, "2026-09-21"), { ...change(200), centre_id: "second" }, { ...change(180, "2026-09-21"), centre_id: "second" }];
   const props = { centres, entries, platform, platforms: [platform, { id: "empty", name: "Telegram" }], days: monthDays("2026-09"), monthLabel: "September 2026" };
   const html = renderToStaticMarkup(React.createElement(Insights, props));
   assert.equal((html.match(/<svg /g) || []).length, 5);
   for (const title of ["Growth rate comparison", "Growth momentum", "Centre × platform growth", "Share of tracked audience", "Gap to competitor"]) assert.ok(html.includes(title));
   assert.match(html, /value="2026-09-14"/);
   assert.match(html, /value="2026-09-21"/);
   assert.match(html, /\+25%/);
   assert.match(html, /-10%/);
   assert.match(html, /-100/);
   assert.match(html, /No data/);
   assert.match(html, /Focus &amp; Academy minus Competitor/);
   assert.doesNotMatch(html, /NaN|Infinity|STATISTICS/);
   const empty = renderToStaticMarkup(React.createElement(Insights, { ...props, entries: [] }));
   assert.doesNotMatch(empty, /<svg/);
   assert.equal((empty.match(/disabled=""/g) || []).length, 5);
   const zeros = renderToStaticMarkup(React.createElement(Insights, { ...props, entries: entries.map((entry) => ({ ...entry, subscribers: 0 })) }));
   assert.match(zeros, /N\/A \(starts at 0\)/);
   assert.doesNotMatch(zeros, /NaN|Infinity/);
});

test("platform create, replace, remove, and name-only edits preserve intended logo state", async () => {
   for (const body of [
      { action: "platform", name: "Telegram", logo_data_url: logo },
      { action: "platform", id: platform_id, name: "Telegram", logo_data_url: logo },
      { action: "platform", id: platform_id, name: "Telegram", logo_data_url: null },
      { action: "platform", id: platform_id, name: "Telegram renamed" },
   ]) {
      const { route, calls } = routeHarness({ allowPlatformWrites: true });
      const response = await route.POST({ json: async () => body });
      assert.equal(response.status, 200);
      assert.equal(calls[0].action, "manage");
      assert.equal(calls[1].table, "marketing_platforms");
      assert.equal(response.body.record.logo_data_url, body.logo_data_url);
      assert.equal(Object.hasOwn(response.body.record, "logo_data_url"), Object.hasOwn(body, "logo_data_url"));
   }
});

test("invalid or unauthorized logo changes do not reach the database", async () => {
   const invalid = routeHarness();
   const body = { action: "platform", name: "Telegram", logo_data_url: "data:image/svg+xml;base64,PHN2Zz4=" };
   assert.equal((await invalid.route.POST({ json: async () => body })).status, 400);
   assert.equal(invalid.calls.length, 1);
   const denied = routeHarness({ deny: true });
   assert.equal((await denied.route.POST({ json: async () => ({ ...body, logo_data_url: logo }) })).status, 403);
   assert.equal(denied.calls.length, 1);
});
