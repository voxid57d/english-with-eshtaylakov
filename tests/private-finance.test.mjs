import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(path, modules = {}) {
   const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, URL, Intl, Date, Error, process: { env: { PRIVATE_FINANCE_USER_ID: "owner" } }, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}

const comparison = load("lib/financeComparison.ts");
const finance = load("lib/privateFinance.ts", { "@/lib/serverAuth": { requireAuthenticatedUser: async () => ({ id: "owner" }) } });

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

function editHarness(options = {}) {
   const queries = [];
   const existing = { id: "transaction", account_id: "old-account", category_id: "food", currency: "USD", exchange_rate_to_uzs: 12500, ...options.existing };
   const account = { id: "old-account", currency: "USD", active: true, ...options.account };
   const category = { id: "food", entry_type: "expense", active: true, ...options.category };
   const supabaseAdmin = { from(table) {
      const query = { table, filters: [], update: null };
      queries.push(query);
      const chain = {
         select() { return chain; },
         eq(key, value) { query.filters.push([key, value]); return chain; },
         update(data) { query.update = data; return chain; },
         async single() {
            if (table === "finance_transactions") return { data: options.missing ? null : query.update ? { id: existing.id } : existing, error: null };
            if (table === "finance_accounts") return { data: options.foreignAccount ? null : account, error: null };
            return { data: options.foreignCategory ? null : category, error: null };
         },
      };
      return chain;
   } };
   const route = load("app/api/private-finance/route.ts", {
      "next/server": { NextResponse: { json: (data, init) => ({ data, status: init?.status || 200 }) } },
      "@/lib/supabaseAdmin": { supabaseAdmin },
      "@/lib/privateFinance": finance,
      "@/lib/financeComparison": comparison,
   });
   return {
      queries,
      edit: (overrides = {}) => route.PATCH({ json: async () => ({ action: "transaction", id: "transaction", accountId: account.id, categoryId: category.id, amount: 12, entryDate: "2026-09-15", note: "Updated", exchangeRateToUzs: 99999, ...overrides }) }),
   };
}

test("editing preserves historical USD rates and scopes every lookup and write to the owner", async () => {
   const harness = editHarness();
   assert.equal((await harness.edit()).status, 200);
   const update = harness.queries.find((query) => query.update).update;
   assert.equal(update.exchange_rate_to_uzs, 12500);
   assert.equal(update.amount, 12);
   assert.equal(update.note, "Updated");
   for (const query of harness.queries) assert.ok(query.filters.some(([key, value]) => key === "owner_user_id" && value === "owner"));
});

test("editing can move an entry to another account, month, and transaction type", async () => {
   const harness = editHarness({ account: { id: "cash", currency: "UZS" }, category: { id: "salary", entry_type: "income" } });
   assert.equal((await harness.edit({ entryDate: "2026-08-31" })).status, 200);
   const update = harness.queries.find((query) => query.update).update;
   assert.equal(update.account_id, "cash");
   assert.equal(update.currency, "UZS");
   assert.equal(update.exchange_rate_to_uzs, 1);
   assert.equal(update.category_id, "salary");
   assert.equal(update.entry_type, "income");
   assert.equal(update.entry_date, "2026-08-31");
});

test("editing rejects inaccessible transactions, accounts, and categories without writing", async () => {
   for (const options of [{ missing: true }, { foreignAccount: true }, { foreignCategory: true }]) {
      const harness = editHarness(options);
      assert.equal((await harness.edit()).status, 400);
      assert.ok(harness.queries.every((query) => !query.update));
   }
});

test("editing permits original archived references but rejects switching to archived records", async () => {
   assert.equal((await editHarness({ account: { active: false }, category: { active: false } }).edit()).status, 200);
   for (const options of [{ account: { id: "archived", active: false } }, { category: { id: "archived", active: false } }]) {
      const harness = editHarness(options);
      assert.equal((await harness.edit()).status, 400);
      assert.ok(harness.queries.every((query) => !query.update));
   }
});

test("editing rejects invalid dates and amounts and supports legacy unassigned entries", async () => {
   for (const body of [{ amount: 0 }, { amount: -1 }, { amount: 0.001 }, { amount: "NaN" }, { entryDate: "2026-02-30" }, { accountId: "" }]) {
      const harness = editHarness();
      assert.equal((await harness.edit(body)).status, 400);
      assert.ok(harness.queries.every((query) => !query.update));
   }
   const harness = editHarness({ existing: { account_id: null } });
   assert.equal((await harness.edit({ accountId: "" })).status, 200);
   assert.equal(harness.queries.find((query) => query.update).update.account_id, null);
});
