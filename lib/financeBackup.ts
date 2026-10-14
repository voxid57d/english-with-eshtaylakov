import { financeComparisonPeriod } from "./financeComparison";
import type { FinancePayload } from "../components/private-finance/PrivateFinanceApp";

export const FINANCE_TABLES = ["accounts", "categories", "transactions", "transfers", "budgets", "debts", "debtPayments"] as const;
export type FinanceTable = typeof FINANCE_TABLES[number];
export type FinanceRow = Record<string, unknown> & { id: string };
export type FinanceBackup = {
   format: "quiet-money-backup";
   version: 1;
   exportedAt: string;
   currencyMode: "mixed" | "UZS";
   conversionRate: number | null;
   tables: Record<FinanceTable, FinanceRow[]>;
   migration?: { convertedAt: string; rate: number; convertedRecords: number };
};

const entryTypes = ["expense", "income", "savings"];
const accountTypes = ["cash", "bank_card", "savings", "person", "other"];
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function emptyFinanceBackup(): FinanceBackup {
   return { format: "quiet-money-backup", version: 1, exportedAt: new Date().toISOString(), currencyMode: "UZS", conversionRate: null,
      tables: { accounts: [], categories: [], transactions: [], transfers: [], budgets: [], debts: [], debtPayments: [] } };
}
function number(row: FinanceRow, field: string, positive = false) {
   if (row[field] === null || row[field] === "" || typeof row[field] === "boolean") throw new Error(`Invalid ${field}.`);
   const value = Number(row[field]);
   if (!Number.isFinite(value) || Math.abs(value) > 1e15 || (positive && value <= 0)) throw new Error(`Invalid ${field}.`);
   row[field] = value;
   return value;
}
function date(value: unknown) {
   if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Invalid record date.");
}
function text(value: unknown, field: string) {
   if (typeof value !== "string" || !value.trim() || value.length > 1000) throw new Error(`Invalid ${field}.`);
}
function oneOf(value: unknown, choices: string[], field: string) {
   if (typeof value !== "string" || !choices.includes(value)) throw new Error(`Invalid ${field}.`);
}
function currency(value: unknown) { oneOf(value, ["UZS", "USD"], "currency"); }

/** Validate a complete backup before touching any existing data. */
export function validateFinanceBackup(input: unknown): FinanceBackup {
   if (!input || typeof input !== "object") throw new Error("Choose a Quiet Money backup file.");
   const original = input as FinanceBackup;
   if (original.format !== "quiet-money-backup" || original.version !== 1 || !original.tables) throw new Error("Unsupported backup format or version.");
   const backup = JSON.parse(JSON.stringify(input)) as FinanceBackup;
   oneOf(backup.currencyMode, ["mixed", "UZS"], "currency mode");
   const ids = {} as Record<FinanceTable, Set<string>>;
   for (const table of FINANCE_TABLES) {
      if (!Array.isArray(backup.tables[table])) throw new Error(`Missing ${table} in backup.`);
      ids[table] = new Set();
      for (const row of backup.tables[table]) {
         if (!row || typeof row !== "object") throw new Error(`Invalid ${table} record.`);
         text(row.id, "record ID");
         if (ids[table].has(row.id)) throw new Error(`Duplicate ${table} record ID.`);
         ids[table].add(row.id);
         delete row.owner_user_id;
         if (row.created_at != null && (typeof row.created_at !== "string" || Number.isNaN(Date.parse(row.created_at)))) throw new Error("Invalid creation date.");
         if (row.note != null && typeof row.note !== "string") throw new Error("Invalid note.");
      }
   }
   function reference(row: FinanceRow, field: string, table: FinanceTable, optional = false) {
      if (optional && row[field] == null) return;
      if (typeof row[field] !== "string" || !ids[table].has(row[field] as string)) throw new Error(`Missing ${table} reference for ${field}.`);
   }
   for (const row of backup.tables.accounts) {
      text(row.name, "account name"); oneOf(row.account_type, accountTypes, "account type"); currency(row.currency); number(row, "opening_balance");
      if (typeof row.active !== "boolean") throw new Error("Invalid account active state.");
   }
   const categories = new Map(backup.tables.categories.map(row => [row.id, row]));
   for (const row of categories.values()) {
      text(row.name, "category name"); oneOf(row.entry_type, entryTypes, "category type");
      if (typeof row.active !== "boolean") throw new Error("Invalid category active state.");
      reference(row, "parent_category_id", "categories", true);
      const parent = categories.get(row.parent_category_id as string);
      if (parent && (parent.id === row.id || parent.parent_category_id || parent.entry_type !== row.entry_type)) throw new Error("Invalid category hierarchy.");
   }
   for (const row of backup.tables.transactions) {
      reference(row, "account_id", "accounts", true); reference(row, "category_id", "categories");
      oneOf(row.entry_type, entryTypes, "transaction type"); currency(row.currency); number(row, "amount", true); number(row, "exchange_rate_to_uzs", true); date(row.entry_date);
      if (categories.get(row.category_id as string)?.entry_type !== row.entry_type) throw new Error("Transaction category type does not match.");
   }
   for (const row of backup.tables.transfers) {
      reference(row, "from_account_id", "accounts"); reference(row, "to_account_id", "accounts");
      if (row.from_account_id === row.to_account_id) throw new Error("Transfer accounts must differ.");
      currency(row.from_currency); currency(row.to_currency); number(row, "from_amount", true); number(row, "to_amount", true); date(row.transfer_date);
   }
   for (const row of backup.tables.budgets) {
      reference(row, "category_id", "categories"); currency(row.currency); number(row, "amount", true); date(row.month_start);
      const category = categories.get(row.category_id as string)!;
      if (!(row.month_start as string).endsWith("-01") || category.parent_category_id || category.entry_type === "income") throw new Error("Invalid budget category or month.");
   }
   const debts = new Map(backup.tables.debts.map(row => [row.id, row]));
   for (const row of debts.values()) {
      reference(row, "account_id", "accounts"); text(row.person_name, "person name"); oneOf(row.direction, ["receivable", "payable"], "debt direction"); currency(row.currency); number(row, "principal_amount", true); date(row.issued_on);
      if (row.due_on != null) { date(row.due_on); if ((row.due_on as string) < (row.issued_on as string)) throw new Error("Debt due date is before its issue date."); }
   }
   for (const row of backup.tables.debtPayments) {
      reference(row, "debt_id", "debts"); reference(row, "account_id", "accounts"); number(row, "amount", true); date(row.payment_date);
   }
   for (const row of debts.values()) {
      const totalPaid = backup.tables.debtPayments.filter(payment => payment.debt_id === row.id).reduce((sum, payment) => sum + Number(payment.amount), 0);
      if (round(totalPaid - Number(row.principal_amount)) > 0.01) throw new Error("Debt payments exceed the original debt amount.");
   }
   if (backup.currencyMode === "UZS") {
      for (const table of FINANCE_TABLES) for (const row of backup.tables[table]) for (const key of ["currency", "from_currency", "to_currency"]) {
         if (row[key] != null && row[key] !== "UZS") throw new Error("UZS backup contains another currency.");
      }
   }
   return backup;
}

export function financeBalances(backup: FinanceBackup) {
   const { accounts, transactions, transfers, debts, debtPayments } = backup.tables;
   const result = new Map(accounts.map(row => [row.id, Number(row.opening_balance)]));
   const add = (id: unknown, value: number) => { if (typeof id === "string" && result.has(id)) result.set(id, round(result.get(id)! + value)); };
   for (const row of transactions) add(row.account_id, Number(row.amount) * (row.entry_type === "income" ? 1 : -1));
   for (const row of transfers) { add(row.from_account_id, -Number(row.from_amount)); add(row.to_account_id, Number(row.to_amount)); }
   const debtIndex = new Map(debts.map(row => [row.id, row]));
   for (const row of debts) add(row.account_id, Number(row.principal_amount) * (row.direction === "receivable" ? -1 : 1));
   for (const row of debtPayments) add(row.account_id, Number(row.amount) * (debtIndex.get(row.debt_id as string)?.direction === "receivable" ? 1 : -1));
   return result;
}

/** Preserve historical transaction valuation AND the website's displayed account balances. */
export function prepareUzsBackup(input: unknown): FinanceBackup {
   const backup = validateFinanceBackup(input);
   if (backup.currencyMode === "UZS") return backup;
   const sourceBalances = financeBalances(backup);
   const sourceCurrencies = new Map(backup.tables.accounts.map(row => [row.id, row.currency]));
   const debtCurrencies = new Map(backup.tables.debts.map(row => [row.id, row.currency]));
   const hasUsd = FINANCE_TABLES.some(table => backup.tables[table].some(row => [row.currency, row.from_currency, row.to_currency].includes("USD")));
   const rate = Number(backup.conversionRate);
   if (hasUsd && (!Number.isFinite(rate) || rate <= 0)) throw new Error("The website export needs a valid USD/UZS conversion rate. Export again when its exchange rate is available.");
   let convertedRecords = 0;
   function convert(row: FinanceRow, amount: string, currencyField: string, conversion = rate) {
      if (row[currencyField] !== "USD") return;
      row[`original_${amount}_usd`] = Number(row[amount]);
      row[amount] = round(Number(row[amount]) * conversion);
      row[currencyField] = "UZS";
      convertedRecords++;
   }
   for (const row of backup.tables.accounts) convert(row, "opening_balance", "currency");
   for (const row of backup.tables.transactions) {
      convert(row, "amount", "currency", Number(row.exchange_rate_to_uzs));
      row.exchange_rate_to_uzs = 1;
   }
   for (const row of backup.tables.transfers) { convert(row, "from_amount", "from_currency"); convert(row, "to_amount", "to_currency"); }
   for (const row of backup.tables.budgets) convert(row, "amount", "currency");
   for (const row of backup.tables.debts) convert(row, "principal_amount", "currency");
   for (const row of backup.tables.debtPayments) if (debtCurrencies.get(row.debt_id as string) === "USD") {
      row.original_amount_usd = row.amount; row.amount = round(Number(row.amount) * rate); convertedRecords++;
   }
   const convertedBalances = financeBalances(backup);
   for (const row of backup.tables.accounts) if (sourceCurrencies.get(row.id) === "USD") {
      const adjustment = round(round(sourceBalances.get(row.id)! * rate) - convertedBalances.get(row.id)!);
      row.opening_balance = round(Number(row.opening_balance) + adjustment);
      row.migration_balance_adjustment_uzs = adjustment;
   }
   backup.currencyMode = "UZS";
   backup.migration = { convertedAt: new Date().toISOString(), rate: hasUsd ? rate : 1, convertedRecords };
   return validateFinanceBackup(backup);
}

export function financePayload(backup: FinanceBackup, month: string, today: string): FinancePayload {
   const { accounts, categories, transactions, transfers, budgets, debts, debtPayments } = backup.tables;
   const accountNames = new Map(accounts.map(row => [row.id, row.name]));
   const categoryIndex = new Map(categories.map(row => [row.id, row]));
   const balances = financeBalances(backup);
   const sorted = (rows: FinanceRow[], field: string) => [...rows].sort((a, b) => String(b[field]).localeCompare(String(a[field])) || String(b.created_at || "").localeCompare(String(a.created_at || "")));
   const mapTransaction = (row: FinanceRow) => {
      const category = categoryIndex.get(row.category_id as string)!;
      return { id: row.id, accountId: row.account_id || null, accountName: accountNames.get(row.account_id as string) || "Unassigned", categoryId: row.category_id,
         categoryName: category.name, categoryColor: category.color, categoryIcon: category.icon, parentCategoryId: category.parent_category_id || null,
         parentCategoryName: categoryIndex.get(category.parent_category_id as string)?.name || null, entryType: row.entry_type, amount: Number(row.amount), currency: row.currency,
         exchangeRateToUzs: Number(row.exchange_rate_to_uzs), entryDate: row.entry_date, note: row.note || null };
   };
   const period = financeComparisonPeriod(month, today);
   const repayments = new Map<string, number>();
   for (const payment of debtPayments) repayments.set(String(payment.debt_id), (repayments.get(String(payment.debt_id)) || 0) + Number(payment.amount));
   return {
      user: { id: "local", email: null }, exchangeRate: null, comparisonPeriod: period,
      accounts: accounts.map(row => ({ id: row.id, name: row.name, accountType: row.account_type, currency: row.currency, openingBalance: Number(row.opening_balance), balance: balances.get(row.id), color: row.color, active: row.active })),
      categories: categories.map(row => ({ id: row.id, name: row.name, entryType: row.entry_type, color: row.color, icon: row.icon, parentCategoryId: row.parent_category_id || null, active: row.active })),
      transactions: sorted(transactions.filter(row => String(row.entry_date).startsWith(month)), "entry_date").map(mapTransaction),
      previousTransactions: transactions.filter(row => String(row.entry_date) >= period.previousStart && String(row.entry_date) <= period.previousEnd).map(mapTransaction),
      transfers: sorted(transfers.filter(row => String(row.transfer_date).startsWith(month)), "transfer_date").map(row => ({ id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id, fromAccountName: accountNames.get(row.from_account_id as string), toAccountName: accountNames.get(row.to_account_id as string), fromAmount: Number(row.from_amount), toAmount: Number(row.to_amount), fromCurrency: row.from_currency, toCurrency: row.to_currency, transferDate: row.transfer_date, note: row.note || null })),
      budgets: budgets.filter(row => String(row.month_start).startsWith(month)).map(row => ({ id: row.id, categoryId: row.category_id, monthStart: row.month_start, amount: Number(row.amount), currency: row.currency })),
      debts: sorted(debts, "issued_on").map(row => ({ id: row.id, personName: row.person_name, direction: row.direction, accountId: row.account_id, accountName: accountNames.get(row.account_id as string), principalAmount: Number(row.principal_amount), remainingAmount: round(Number(row.principal_amount) - (repayments.get(row.id) || 0)), currency: row.currency, issuedOn: row.issued_on, dueOn: row.due_on || null, note: row.note || null })),
      debtPayments: sorted(debtPayments, "payment_date").map(row => ({ id: row.id, debtId: row.debt_id, accountId: row.account_id, accountName: accountNames.get(row.account_id as string), amount: Number(row.amount), paymentDate: row.payment_date, note: row.note || null })),
   } as FinancePayload;
}

export function mutateFinance(backup: FinanceBackup, method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, id: string, timestamp: string): FinanceBackup {
   const next = JSON.parse(JSON.stringify(backup)) as FinanceBackup;
   const tables = next.tables;
   const find = (table: FinanceTable, key: unknown) => { const row = tables[table].find(row => row.id === key); if (!row) throw new Error(`Choose a valid ${table} record.`); return row; };
   const activeAccount = (key: unknown) => { const row = find("accounts", key); if (!row.active) throw new Error("Choose an active account."); return row; };
   const amount = (key = "amount") => { const row = { id, [key]: body[key] }; return round(number(row, key, true)); };
   const note = typeof body.note === "string" ? body.note.trim().slice(0, 240) : null;
   const base = { id, created_at: timestamp };
   const action = body.action;
   if (method === "DELETE") {
      const table = ({ transaction: "transactions", transfer: "transfers", budget: "budgets" } as const)[action as "transaction" | "transfer" | "budget"];
      if (!table) throw new Error("Unsupported delete action.");
      find(table, body.id); next.tables[table] = tables[table].filter(row => row.id !== body.id);
   } else if (method === "PATCH" && (action === "account" || action === "category")) {
      const row = find(action === "account" ? "accounts" : "categories", body.id);
      row.name = String(body.name || "").trim().slice(0, 80); row.color = body.color || "#657568"; row.active = body.active !== false;
      if (action === "account") row.opening_balance = Number(body.openingBalance || 0);
      else row.icon = body.icon || "circle";
   } else if (action === "transaction") {
      const existing = method === "PATCH" ? find("transactions", body.id) : null;
      const category = find("categories", body.categoryId);
      if (!category.active && category.id !== existing?.category_id) throw new Error("Choose an active category.");
      const account = body.accountId ? find("accounts", body.accountId) : null;
      if (!account && (!existing || existing.account_id)) throw new Error("Choose an account.");
      if (account && !account.active && account.id !== existing?.account_id) throw new Error("Choose an active account.");
      const fields = { account_id: account?.id || null, category_id: category.id, entry_type: category.entry_type, amount: amount(), currency: "UZS", exchange_rate_to_uzs: 1, entry_date: body.entryDate, note };
      if (existing) Object.assign(existing, fields); else tables.transactions.push({ ...base, ...fields });
   } else if (method !== "POST") throw new Error("Unsupported update action.");
   else if (action === "account") tables.accounts.push({ ...base, name: String(body.name || "").trim().slice(0, 80), account_type: body.accountType, currency: "UZS", opening_balance: Number(body.openingBalance || 0), color: body.color || "#657568", active: true });
   else if (action === "category") tables.categories.push({ ...base, name: String(body.name || "").trim().slice(0, 80), entry_type: body.entryType, parent_category_id: body.parentCategoryId || null, color: body.color || "#657568", icon: body.icon || "circle", active: true });
   else if (action === "transfer") {
      activeAccount(body.fromAccountId); activeAccount(body.toAccountId);
      tables.transfers.push({ ...base, from_account_id: body.fromAccountId, to_account_id: body.toAccountId, from_currency: "UZS", to_currency: "UZS", from_amount: amount("fromAmount"), to_amount: amount("fromAmount"), transfer_date: body.transferDate, note });
   } else if (action === "budget") {
      const existing = tables.budgets.find(row => row.category_id === body.categoryId && row.month_start === body.monthStart);
      const fields = { category_id: body.categoryId, month_start: body.monthStart, amount: amount(), currency: "UZS" };
      if (existing) Object.assign(existing, fields); else tables.budgets.push({ ...base, ...fields });
   } else if (action === "debt") {
      activeAccount(body.accountId);
      tables.debts.push({ ...base, person_name: String(body.personName || "").trim().slice(0, 80), direction: body.direction, account_id: body.accountId, principal_amount: amount(), currency: "UZS", issued_on: body.issuedOn, due_on: body.dueOn || null, note });
   } else if (action === "debt-payment") {
      activeAccount(body.accountId); const debt = find("debts", body.debtId);
      const remaining = Number(debt.principal_amount) - tables.debtPayments.filter(row => row.debt_id === debt.id).reduce((sum, row) => sum + Number(row.amount), 0);
      if (amount() > round(remaining)) throw new Error("Payment exceeds the remaining debt.");
      tables.debtPayments.push({ ...base, debt_id: debt.id, account_id: body.accountId, amount: amount(), payment_date: body.paymentDate, note });
   } else throw new Error("Unsupported action.");
   // Mirror the website's unique account/category names.
   for (const table of ["accounts", "categories"] as const) {
      const names = new Set();
      for (const row of tables[table]) {
         const key = `${table === "categories" ? `${row.entry_type}/${row.parent_category_id || ""}/` : ""}${String(row.name).toLowerCase()}`;
         if (names.has(key)) throw new Error(`This ${table === "accounts" ? "account" : "category"} already exists.`);
         names.add(key);
      }
   }
   next.exportedAt = timestamp;
   return validateFinanceBackup(next);
}
