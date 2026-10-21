import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(path, modules = {}) {
   const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, URL, Intl, Date, Error, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}

const comparison = load("lib/financeComparison.ts");

test("comparison periods handle year boundaries, leap years, and matching days", () => {
   const january = comparison.financeComparisonPeriod("2026-01", "2026-09-20");
   assert.equal(january.previousStart, "2025-12-01");
   assert.equal(january.previousEnd, "2025-12-31");
   assert.equal(january.end, "2026-01-31");
   const leap = comparison.financeComparisonPeriod("2024-03", "2024-03-31");
   assert.equal(leap.previousEnd, "2024-02-29");
   assert.equal(leap.end, "2024-03-29");
   const current = comparison.financeComparisonPeriod("2026-09", "2026-09-20");
   assert.equal(current.end, "2026-09-20");
   assert.equal(current.previousEnd, "2026-08-20");
   assert.equal(comparison.financeComparisonPeriod("2026-10", "2026-09-20").available, false);
});

const row = (overrides = {}) => ({ entryType: "expense", entryDate: "2026-09-10", amount: 10, currency: "UZS", exchangeRateToUzs: 1, categoryId: "food", categoryName: "Food", parentCategoryId: null, parentCategoryName: null, ...overrides });

test("comparisons exclude future days and use each transaction's historical USD rate", () => {
   const result = comparison.compareFinanceMonths([
      row({ amount: 2, currency: "USD", exchangeRateToUzs: 12000 }),
      row({ amount: 900000, entryDate: "2026-09-21" }),
      row({ entryType: "income", amount: 70000 }),
      row({ entryType: "savings", amount: 5000 }),
   ], [row({ entryDate: "2026-08-10", amount: 2, currency: "USD", exchangeRateToUzs: 10000 }), row({ entryDate: "2026-08-21", amount: 1000000 })], comparison.financeComparisonPeriod("2026-09", "2026-09-20"));
   assert.equal(result.current.expense, 24000);
   assert.equal(result.previous.expense, 20000);
   assert.equal(result.current.income, 70000);
   assert.equal(result.current.savings, 5000);
   assert.equal(result.changes[0].difference, 4000);
});

test("category comparisons combine children and include spending that disappeared", () => {
   const result = comparison.compareFinanceMonths([
      row({ categoryId: "food-child", parentCategoryId: "food", parentCategoryName: "Food", amount: 20 }), row({ amount: 10 }),
   ], [row({ entryDate: "2026-08-10", amount: 5 }), row({ entryDate: "2026-08-12", categoryId: "travel", categoryName: "Travel", amount: 100 })], comparison.financeComparisonPeriod("2026-09", "2026-10-01"));
   assert.equal(result.changes[0].name, "Travel");
   assert.equal(result.changes[0].difference, -100);
   assert.equal(result.changes[1].name, "Food");
   assert.equal(result.changes[1].difference, 25);
   assert.equal(comparison.compareFinanceMonths([], [], comparison.financeComparisonPeriod("2026-09", "2026-10-01")).changes.length, 0);
});
