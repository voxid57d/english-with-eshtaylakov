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
   vm.runInNewContext(outputText, { exports, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}

const { financeCategoryTotals } = load("lib/financeTotals.ts");

test("indexed finance totals match the original calculation for parent and child categories", () => {
   const rows = Array.from({ length: 500 }, (_, index) => ({
      categoryId: `child-${index % 15}`,
      parentCategoryId: index % 4 === 0 ? null : `parent-${index % 3}`,
      amount: (index + 1) * 0.17,
      currency: index % 2 ? "USD" : "UZS",
      exchangeRateToUzs: 12500 + index,
   }));
   rows.push({ categoryId: "same", parentCategoryId: "same", amount: 12, currency: "UZS", exchangeRateToUzs: 1 });
   const toUzs = (row) => row.amount * (row.currency === "USD" ? row.exchangeRateToUzs : 1);
   const snapshot = JSON.stringify(rows);
   let conversions = 0;
   const totals = financeCategoryTotals(rows, (row) => { conversions++; return toUzs(row); });
   for (const categoryId of [...rows.map((row) => row.categoryId), "parent-0", "parent-1", "parent-2", "empty"]) {
      const original = rows.filter((row) => row.categoryId === categoryId || row.parentCategoryId === categoryId).reduce((sum, row) => sum + toUzs(row), 0);
      assert.equal(totals.get(categoryId) || 0, original);
   }
   assert.equal(conversions, rows.length);
   assert.equal(JSON.stringify(rows), snapshot);
   assert.equal(financeCategoryTotals([], toUzs).size, 0);
});

const { default: Sidebar } = load("components/Sidebar.tsx", {
   react: React,
   "react/jsx-runtime": jsxRuntime,
   "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
   "next/navigation": { usePathname: () => "/dashboard/tasks", useSearchParams: () => new URLSearchParams() },
   "react-icons/pi": new Proxy({}, { get: () => () => null }),
   "@/lib/erpVisibility": { isErpModuleVisible: () => true },
});

test("sidebar preserves view permissions using the profile already loaded by its parent", () => {
   const html = renderToStaticMarkup(React.createElement(Sidebar, {
      isOpenOnMobile: false, closeMobile() {},
      permissions: { tasks: ["view"], marketing: ["view", "manage"], staff: ["manage"], settings: "view" },
   }));
   assert.match(html, /href="\/dashboard\/tasks"/);
   assert.match(html, /href="\/dashboard\/marketing"/);
   assert.doesNotMatch(html, /href="\/dashboard\/staff"/);
   assert.doesNotMatch(html, /href="\/dashboard\/settings"/);
   const empty = renderToStaticMarkup(React.createElement(Sidebar, { isOpenOnMobile: false, closeMobile() {}, permissions: {} }));
   assert.doesNotMatch(empty, /href="\/dashboard/);
});
