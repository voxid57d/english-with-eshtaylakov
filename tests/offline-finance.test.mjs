import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(path, modules = {}) {
   const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, URL, Intl, Date, Error, require: name => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`); return modules[name];
   } });
   return exports;
}
const comparison = load("lib/financeComparison.ts");
const lib = load("lib/financeBackup.ts", { "./financeComparison": comparison });
const account = (id, currency = "UZS", opening_balance = 0) => ({ id, name: id, account_type: "cash", currency, opening_balance, color: "#657568", active: true });
const category = (id = "food", entry_type = "expense") => ({ id, name: id, entry_type, parent_category_id: null, color: "#E26D5A", icon: "food", active: true });
const tx = (id, account_id = "cash", currency = "UZS", amount = 100) => ({ id, account_id, category_id: "food", entry_type: "expense", currency, amount, exchange_rate_to_uzs: currency === "USD" ? 10000 : 1, entry_date: "2026-09-10", note: "Lunch" });
function fixture() {
   const value = lib.emptyFinanceBackup(); value.currencyMode = "mixed"; value.conversionRate = 12000;
   value.tables.accounts = [account("cash", "UZS", 1000), account("usd", "USD", 100), { ...account("archived"), active: false }];
   value.tables.categories = [category(), category("salary", "income"), category("savings", "savings")];
   value.tables.transactions = [tx("old", "cash"), tx("historical", "usd", "USD", 2), { ...tx("unassigned", null), entry_date: "2025-01-02" }];
   value.tables.transfers = [{ id: "transfer", from_account_id: "usd", to_account_id: "cash", from_amount: 1, to_amount: 12000, from_currency: "USD", to_currency: "UZS", transfer_date: "2026-09-11" }];
   value.tables.budgets = [{ id: "budget", category_id: "food", month_start: "2026-09-01", amount: 5, currency: "USD" }];
   value.tables.debts = [{ id: "debt", person_name: "Friend", direction: "receivable", account_id: "usd", principal_amount: 10, currency: "USD", issued_on: "2026-09-01", due_on: null }];
   value.tables.debtPayments = [{ id: "payment", debt_id: "debt", account_id: "usd", amount: 3, payment_date: "2026-09-12" }];
   return value;
}

test("USD migration keeps historical spending and current account balances, including debts/transfers", () => {
   const original = fixture(); const converted = lib.prepareUzsBackup(original);
   assert.equal(original.tables.transactions[1].currency, "USD", "Migration must not mutate the source backup");
   assert.equal(converted.tables.transactions[1].amount, 20000);
   assert.equal(converted.tables.budgets[0].amount, 60000);
   assert.equal(lib.financeBalances(converted).get("usd"), lib.financeBalances(original).get("usd") * 12000);
   assert.equal(lib.financeBalances(converted).get("cash"), lib.financeBalances(original).get("cash"));
   assert.equal(converted.tables.accounts[2].active, false);
   assert.equal(converted.tables.transactions[2].account_id, null);
   const payload = lib.financePayload(converted, "2026-09", "2026-10-14");
   assert.equal(payload.debts[0].remainingAmount, 84000);
   assert.equal(payload.transactions.length, 2);
   assert.equal(converted.tables.transactions.length, 3, "All dates stay in the backup");
   assert.equal(lib.prepareUzsBackup(converted).tables.transactions[1].amount, 20000, "Restore must not convert twice");
});

test("bad imports fail without modifying the source; missing rates never silently erase USD records", () => {
   for (const corrupt of [b => { b.version = 99; }, b => { b.tables.accounts = []; }, b => { b.tables.transactions[0].amount = NaN; }, b => { b.tables.transactions.push(b.tables.transactions[0]); }]) {
      const backup = fixture(); corrupt(backup); assert.throws(() => lib.prepareUzsBackup(backup));
   }
   const missingRate = fixture(); missingRate.conversionRate = null; assert.throws(() => lib.prepareUzsBackup(missingRate), /rate/);
});

test("all local actions persist a coherent UZS ledger and rejected writes leave it unchanged", () => {
   let state = lib.emptyFinanceBackup(); let sequence = 0;
   const request = (method, body) => { state = lib.mutateFinance(state, method, body, `id-${++sequence}`, "2026-10-14T00:00:00Z"); };
   request("POST", { action: "account", name: "Cash", accountType: "cash", openingBalance: 1000, currency: "USD" });
   request("POST", { action: "account", name: "Card", accountType: "bank_card", openingBalance: 0 });
   request("POST", { action: "category", name: "Food", entryType: "expense" });
   request("POST", { action: "category", name: "Lunch", entryType: "expense", parentCategoryId: "id-3" });
   request("POST", { action: "transaction", accountId: "id-1", categoryId: "id-4", amount: 100, entryDate: "2026-10-14" });
   request("POST", { action: "transfer", fromAccountId: "id-1", toAccountId: "id-2", fromAmount: 200, transferDate: "2026-10-14" });
   request("POST", { action: "budget", categoryId: "id-3", amount: 500, monthStart: "2026-10-01" });
   request("POST", { action: "debt", direction: "receivable", personName: "Friend", accountId: "id-1", amount: 50, issuedOn: "2026-10-14" });
   request("POST", { action: "debt-payment", debtId: "id-8", accountId: "id-2", amount: 20, paymentDate: "2026-10-14" });
   assert.equal(lib.financeBalances(state).get("id-1"), 650); assert.equal(lib.financeBalances(state).get("id-2"), 220);
   assert.equal(state.tables.accounts[0].currency, "UZS");
   const before = JSON.stringify(state);
   assert.throws(() => request("POST", { action: "debt-payment", debtId: "id-8", accountId: "id-2", amount: 31, paymentDate: "2026-10-14" }));
   assert.equal(JSON.stringify(state), before);
   request("PATCH", { action: "transaction", id: "id-5", accountId: "id-1", categoryId: "id-3", amount: 150, entryDate: "2026-09-30" });
   assert.equal(lib.financePayload(state, "2026-10", "2026-10-14").transactions.length, 0);
   request("DELETE", { action: "transaction", id: "id-5" });
   assert.equal(lib.financeBalances(state).get("id-1"), 750);
   request("PATCH", { action: "category", id: "id-3", name: "Food", icon: "food", active: false });
   assert.equal(state.tables.categories[0].active, false);
});
