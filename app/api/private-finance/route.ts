import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { financeComparisonPeriod } from "@/lib/financeComparison";
import {
   cleanFinanceText,
   isFinanceAccountType,
   isFinanceCurrency,
   isFinanceDebtDirection,
   isFinanceEntryType,
   isIsoDate,
   isMonthStart,
   privateFinanceError,
   requirePositiveAmount,
   requirePrivateFinanceUser,
   type FinanceAccountType,
   type FinanceCurrency,
   type FinanceDebtDirection,
   type FinanceEntryType,
} from "@/lib/privateFinance";

type AccountRow = {
   id: string;
   name: string;
   account_type: FinanceAccountType;
   currency: FinanceCurrency;
   opening_balance: number | string;
   color: string;
   active: boolean;
};

type CategoryRow = {
   id: string;
   parent_category_id: string | null;
   name: string;
   entry_type: FinanceEntryType;
   color: string;
   icon: string;
   active: boolean;
};

type TransactionRow = {
   id: string;
   account_id: string | null;
   category_id: string;
   entry_type: FinanceEntryType;
   amount: number | string;
   currency: FinanceCurrency;
   exchange_rate_to_uzs: number | string;
   entry_date: string;
   note: string | null;
   created_at: string;
};

type TransferRow = {
   id: string;
   from_account_id: string;
   to_account_id: string;
   from_amount: number | string;
   to_amount: number | string;
   from_currency: FinanceCurrency;
   to_currency: FinanceCurrency;
   transfer_date: string;
   note: string | null;
   created_at: string;
};

type BalanceTransactionRow = {
   account_id: string | null;
   entry_type: FinanceEntryType;
   amount: number | string;
   currency: FinanceCurrency;
};

type BudgetRow = {
   id: string;
   category_id: string;
   month_start: string;
   amount: number | string;
   currency: FinanceCurrency;
};

type DebtRow = {
   id: string;
   person_name: string;
   direction: FinanceDebtDirection;
   account_id: string;
   principal_amount: number | string;
   currency: FinanceCurrency;
   issued_on: string;
   due_on: string | null;
   note: string | null;
   created_at: string;
};

type DebtPaymentRow = {
   id: string;
   debt_id: string;
   account_id: string;
   amount: number | string;
   payment_date: string;
   note: string | null;
   created_at: string;
};

const CATEGORY_COLORS = [
   "#E26D5A",
   "#D99B43",
   "#4F8F67",
   "#4E8297",
   "#5B7DB1",
   "#8A6BB1",
   "#A65D79",
   "#657568",
];

function jsonError(error: unknown, fallback: string) {
   const { message, status } = privateFinanceError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function monthBounds(month: string | null) {
   const fallback = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "2-digit",
   }).format(new Date());
   const selected = month && /^\d{4}-\d{2}$/.test(month) ? month : fallback;
   const [year, monthNumber] = selected.split("-").map(Number);
   if (monthNumber < 1 || monthNumber > 12) throw new Error("Valid month is required.");
   const start = `${selected}-01`;
   const next = new Date(Date.UTC(year, monthNumber, 1));
   const endDate = new Date(next.valueOf() - 86400000);
   return { month: selected, start, end: endDate.toISOString().slice(0, 10) };
}

async function getUsdRate() {
   try {
      const response = await fetch(
         "https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/",
         { next: { revalidate: 3600 } },
      );
      if (!response.ok) return null;
      const payload = (await response.json()) as Array<{
         Rate?: string;
         Date?: string;
         Diff?: string;
      }>;
      const usd = payload[0];
      const rate = Number(usd?.Rate);
      if (!Number.isFinite(rate) || rate <= 0) return null;
      return {
         rate,
         date: usd.Date || null,
         change: Number(usd.Diff || 0),
         source: "Central Bank of Uzbekistan",
      };
   } catch {
      return null;
   }
}

function mapCategory(row: CategoryRow) {
   return {
      id: row.id,
      parentCategoryId: row.parent_category_id,
      name: row.name,
      entryType: row.entry_type,
      color: row.color,
      icon: row.icon,
      active: row.active,
   };
}

function mapAccount(row: AccountRow, balance?: number) {
   return {
      id: row.id,
      name: row.name,
      accountType: row.account_type,
      currency: row.currency,
      openingBalance: Number(row.opening_balance),
      balance: balance ?? Number(row.opening_balance),
      color: row.color,
      active: row.active,
   };
}

function mapTransaction(
   row: TransactionRow,
   categories: Map<string, CategoryRow>,
   accountNames: Map<string, string>,
) {
   const category = categories.get(row.category_id);
   const parent = category?.parent_category_id
      ? categories.get(category.parent_category_id)
      : null;

   return {
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_id ? accountNames.get(row.account_id) || "Account" : "Unassigned",
      categoryId: row.category_id,
      categoryName: category?.name || "Category",
      categoryColor: category?.color || "#657568",
      categoryIcon: category?.icon || "circle",
      parentCategoryId: parent?.id || null,
      parentCategoryName: parent?.name || null,
      entryType: row.entry_type,
      amount: Number(row.amount),
      currency: row.currency,
      exchangeRateToUzs: Number(row.exchange_rate_to_uzs),
      entryDate: row.entry_date,
      note: row.note,
      createdAt: row.created_at,
   };
}

function mapTransfer(row: TransferRow, accountNames: Map<string, string>) {
   return {
      id: row.id,
      fromAccountId: row.from_account_id,
      fromAccountName: accountNames.get(row.from_account_id) || "Account",
      toAccountId: row.to_account_id,
      toAccountName: accountNames.get(row.to_account_id) || "Account",
      fromAmount: Number(row.from_amount),
      toAmount: Number(row.to_amount),
      fromCurrency: row.from_currency,
      toCurrency: row.to_currency,
      transferDate: row.transfer_date,
      note: row.note,
      createdAt: row.created_at,
   };
}

function mapBudget(row: BudgetRow) {
   return {
      id: row.id,
      categoryId: row.category_id,
      monthStart: row.month_start,
      amount: Number(row.amount),
      currency: row.currency,
   };
}

function mapDebt(
   row: DebtRow,
   accountNames: Map<string, string>,
   paidAmount: number,
) {
   return {
      id: row.id,
      personName: row.person_name,
      direction: row.direction,
      accountId: row.account_id,
      accountName: accountNames.get(row.account_id) || "Account",
      principalAmount: Number(row.principal_amount),
      remainingAmount: Math.max(0, Number(row.principal_amount) - paidAmount),
      currency: row.currency,
      issuedOn: row.issued_on,
      dueOn: row.due_on,
      note: row.note,
   };
}

function mapDebtPayment(row: DebtPaymentRow, accountNames: Map<string, string>) {
   return {
      id: row.id,
      debtId: row.debt_id,
      accountId: row.account_id,
      accountName: accountNames.get(row.account_id) || "Account",
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      note: row.note,
   };
}

async function getOwnedDebt(userId: string, debtId: string) {
   const { data, error } = await supabaseAdmin
      .from("finance_debts")
      .select("id, person_name, direction, account_id, principal_amount, currency, issued_on, due_on, note, created_at")
      .eq("id", debtId)
      .eq("owner_user_id", userId)
      .single();
   if (error || !data) throw new Error("Choose a valid debt.");
   return data as DebtRow;
}

async function getOwnedCategory(userId: string, categoryId: string) {
   const { data, error } = await supabaseAdmin
      .from("finance_categories")
      .select("id, parent_category_id, name, entry_type, color, icon, active")
      .eq("id", categoryId)
      .eq("owner_user_id", userId)
      .single();
   if (error || !data) throw new Error("Choose a valid category.");
   return data as CategoryRow;
}

async function getOwnedAccount(userId: string, accountId: string) {
   const { data, error } = await supabaseAdmin
      .from("finance_accounts")
      .select("id, name, account_type, currency, opening_balance, color, active")
      .eq("id", accountId)
      .eq("owner_user_id", userId)
      .single();
   if (error || !data) throw new Error("Choose a valid account.");
   return data as AccountRow;
}

export async function GET(req: Request) {
   try {
      const user = await requirePrivateFinanceUser(req);
      const period = monthBounds(new URL(req.url).searchParams.get("month"));
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const comparisonPeriod = financeComparisonPeriod(period.month, today);

      const [
         accountResult,
         categoryResult,
         transactionResult,
         transferResult,
         budgetResult,
         balanceTransactionResult,
         balanceTransferResult,
         debtResult,
         debtPaymentResult,
         exchangeRate,
         previousTransactionResult,
      ] = await Promise.all([
            supabaseAdmin
               .from("finance_accounts")
               .select("id, name, account_type, currency, opening_balance, color, active")
               .eq("owner_user_id", user.id)
               .order("active", { ascending: false })
               .order("name"),
            supabaseAdmin
               .from("finance_categories")
               .select("id, parent_category_id, name, entry_type, color, icon, active")
               .eq("owner_user_id", user.id)
               .order("entry_type")
               .order("parent_category_id", { ascending: true })
               .order("name"),
            supabaseAdmin
               .from("finance_transactions")
               .select(
                  "id, account_id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at",
               )
               .eq("owner_user_id", user.id)
               .gte("entry_date", period.start)
               .lte("entry_date", period.end)
               .order("entry_date", { ascending: false })
               .order("created_at", { ascending: false }),
            supabaseAdmin
               .from("finance_transfers")
               .select(
                  "id, from_account_id, to_account_id, from_amount, to_amount, from_currency, to_currency, transfer_date, note, created_at",
               )
               .eq("owner_user_id", user.id)
               .gte("transfer_date", period.start)
               .lte("transfer_date", period.end)
               .order("transfer_date", { ascending: false })
               .order("created_at", { ascending: false }),
            supabaseAdmin
               .from("finance_budgets")
               .select("id, category_id, month_start, amount, currency")
               .eq("owner_user_id", user.id)
               .eq("month_start", period.start),
            supabaseAdmin
               .from("finance_transactions")
               .select("account_id, entry_type, amount, currency")
               .eq("owner_user_id", user.id)
               .not("account_id", "is", null),
            supabaseAdmin
               .from("finance_transfers")
               .select(
                  "id, from_account_id, to_account_id, from_amount, to_amount, from_currency, to_currency, transfer_date, note, created_at",
               )
               .eq("owner_user_id", user.id),
            supabaseAdmin
               .from("finance_debts")
               .select("id, person_name, direction, account_id, principal_amount, currency, issued_on, due_on, note, created_at")
               .eq("owner_user_id", user.id)
               .order("issued_on", { ascending: false })
               .order("created_at", { ascending: false }),
            supabaseAdmin
               .from("finance_debt_payments")
               .select("id, debt_id, account_id, amount, payment_date, note, created_at")
               .eq("owner_user_id", user.id)
               .order("payment_date", { ascending: false })
               .order("created_at", { ascending: false }),
            getUsdRate(),
            supabaseAdmin
               .from("finance_transactions")
               .select("id, account_id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at")
               .eq("owner_user_id", user.id)
               .gte("entry_date", comparisonPeriod.previousStart)
               .lte("entry_date", comparisonPeriod.previousEnd),
         ]);

      if (
         accountResult.error ||
         categoryResult.error ||
         transactionResult.error ||
         transferResult.error ||
         budgetResult.error ||
         balanceTransactionResult.error ||
         balanceTransferResult.error ||
         debtResult.error ||
         debtPaymentResult.error ||
         previousTransactionResult.error
      ) {
         throw new Error(
            "Finance storage is not ready. Apply supabase/private_finance_schema.sql first.",
         );
      }

      const accountRows = (accountResult.data || []) as AccountRow[];
      const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
      const categoryRows = (categoryResult.data || []) as CategoryRow[];
      const categories = new Map(categoryRows.map((category) => [category.id, category]));
      const debtRows = (debtResult.data || []) as DebtRow[];
      const debtPaymentRows = (debtPaymentResult.data || []) as DebtPaymentRow[];
      const paidByDebt = new Map<string, number>();
      for (const payment of debtPaymentRows) {
         paidByDebt.set(
            payment.debt_id,
            (paidByDebt.get(payment.debt_id) || 0) + Number(payment.amount),
         );
      }
      const balances = new Map(
         accountRows.map((account) => [account.id, Number(account.opening_balance)]),
      );

      for (const transaction of (balanceTransactionResult.data || []) as BalanceTransactionRow[]) {
         if (!transaction.account_id || !balances.has(transaction.account_id)) continue;
         const direction = transaction.entry_type === "income" ? 1 : -1;
         balances.set(
            transaction.account_id,
            (balances.get(transaction.account_id) || 0) +
               direction * Number(transaction.amount),
         );
      }

      for (const transfer of (balanceTransferResult.data || []) as TransferRow[]) {
         if (balances.has(transfer.from_account_id)) {
            balances.set(
               transfer.from_account_id,
               (balances.get(transfer.from_account_id) || 0) - Number(transfer.from_amount),
            );
         }
         if (balances.has(transfer.to_account_id)) {
            balances.set(
               transfer.to_account_id,
               (balances.get(transfer.to_account_id) || 0) + Number(transfer.to_amount),
            );
         }
      }

      for (const debt of debtRows) {
         if (!balances.has(debt.account_id)) continue;
         const direction = debt.direction === "receivable" ? -1 : 1;
         balances.set(
            debt.account_id,
            (balances.get(debt.account_id) || 0) +
               direction * Number(debt.principal_amount),
         );
      }

      for (const payment of debtPaymentRows) {
         const debt = debtRows.find((item) => item.id === payment.debt_id);
         if (!debt || !balances.has(payment.account_id)) continue;
         const direction = debt.direction === "receivable" ? 1 : -1;
         balances.set(
            payment.account_id,
            (balances.get(payment.account_id) || 0) + direction * Number(payment.amount),
         );
      }

      return NextResponse.json({
         user: { id: user.id, email: user.email || null },
         period,
         comparisonPeriod,
         previousTransactions: ((previousTransactionResult.data || []) as unknown as TransactionRow[]).map(
            (transaction) => mapTransaction(transaction, categories, accountNames),
         ),
         accounts: accountRows.map((account) => mapAccount(account, balances.get(account.id))),
         categories: categoryRows.map(mapCategory),
         transactions: ((transactionResult.data || []) as unknown as TransactionRow[]).map(
            (transaction) => mapTransaction(transaction, categories, accountNames),
         ),
         transfers: ((transferResult.data || []) as TransferRow[]).map((transfer) =>
            mapTransfer(transfer, accountNames),
         ),
         budgets: ((budgetResult.data || []) as BudgetRow[]).map(mapBudget),
         debts: debtRows.map((debt) =>
            mapDebt(debt, accountNames, paidByDebt.get(debt.id) || 0),
         ),
         debtPayments: debtPaymentRows.map((payment) =>
            mapDebtPayment(payment, accountNames),
         ),
         exchangeRate,
      });
   } catch (error) {
      return jsonError(error, "Failed to load your private finances.");
   }
}

export async function POST(req: Request) {
   try {
      const user = await requirePrivateFinanceUser(req);
      const body = await req.json();

      if (body?.action === "account") {
         const name = cleanFinanceText(body.name, 80);
         if (!name) throw new Error("Account name is required.");
         if (!isFinanceAccountType(body.accountType)) {
            throw new Error("Valid account type is required.");
         }
         if (!isFinanceCurrency(body.currency)) {
            throw new Error("Valid account currency is required.");
         }
         const openingBalance = Number(body.openingBalance || 0);
         if (!Number.isFinite(openingBalance)) {
            throw new Error("Opening balance must be a valid number.");
         }
         const color = CATEGORY_COLORS.includes(body.color) ? body.color : "#657568";
         const { data, error } = await supabaseAdmin
            .from("finance_accounts")
            .insert({
               owner_user_id: user.id,
               name,
               account_type: body.accountType,
               currency: body.currency,
               opening_balance: Number(openingBalance.toFixed(2)),
               color,
            })
            .select("id, name, account_type, currency, opening_balance, color, active")
            .single();
         if (error || !data) {
            if (error?.code === "23505") throw new Error("This account already exists.");
            throw new Error("Failed to create account.");
         }
         return NextResponse.json({ account: mapAccount(data as AccountRow) });
      }

      if (body?.action === "category") {
         const name = cleanFinanceText(body.name, 80);
         if (!name) throw new Error("Category name is required.");
         if (!isFinanceEntryType(body.entryType)) {
            throw new Error("Valid category type is required.");
         }
         const parentCategoryId = cleanFinanceText(body.parentCategoryId, 60) || null;
         if (parentCategoryId) {
            const parent = await getOwnedCategory(user.id, parentCategoryId);
            if (!parent.active) throw new Error("Choose an active parent category.");
            if (parent.entry_type !== body.entryType) {
               throw new Error("A subcategory must use its parent category type.");
            }
            if (parent.parent_category_id) {
               throw new Error("Only one subcategory level is supported.");
            }
         }
         const color = CATEGORY_COLORS.includes(body.color) ? body.color : "#657568";
         const icon = cleanFinanceText(body.icon, 40) || "circle";
         const { data, error } = await supabaseAdmin
            .from("finance_categories")
            .insert({
               owner_user_id: user.id,
               parent_category_id: parentCategoryId,
               name,
               entry_type: body.entryType,
               color,
               icon,
            })
            .select("id, parent_category_id, name, entry_type, color, icon, active")
            .single();
         if (error || !data) {
            if (error?.code === "23505") throw new Error("This category already exists.");
            throw new Error("Failed to create category.");
         }
         return NextResponse.json({ category: mapCategory(data as CategoryRow) });
      }

      if (body?.action === "debt") {
         const personName = cleanFinanceText(body.personName, 80);
         const accountId = cleanFinanceText(body.accountId, 60);
         if (!personName) throw new Error("Person name is required.");
         if (!isFinanceDebtDirection(body.direction)) {
            throw new Error("Valid debt direction is required.");
         }
         if (!accountId) throw new Error("Choose an account.");
         if (!isIsoDate(body.issuedOn)) throw new Error("Valid debt date is required.");
         const dueOn = cleanFinanceText(body.dueOn, 10) || null;
         if (dueOn && (!isIsoDate(dueOn) || dueOn < body.issuedOn)) {
            throw new Error("Due date must be on or after the debt date.");
         }
         const account = await getOwnedAccount(user.id, accountId);
         if (!account.active) throw new Error("Choose an active account.");
         const principalAmount = requirePositiveAmount(body.amount);
         const note = cleanFinanceText(body.note, 240) || null;
         const { data, error } = await supabaseAdmin
            .from("finance_debts")
            .insert({
               owner_user_id: user.id,
               person_name: personName,
               direction: body.direction,
               account_id: account.id,
               principal_amount: principalAmount,
               currency: account.currency,
               issued_on: body.issuedOn,
               due_on: dueOn,
               note,
            })
            .select("id, person_name, direction, account_id, principal_amount, currency, issued_on, due_on, note, created_at")
            .single();
         if (error || !data) throw new Error("Failed to record debt.");
         return NextResponse.json({ debt: mapDebt(data as DebtRow, new Map([[account.id, account.name]]), 0) });
      }

      if (body?.action === "debt-payment") {
         const debtId = cleanFinanceText(body.debtId, 60);
         const accountId = cleanFinanceText(body.accountId, 60);
         if (!debtId) throw new Error("Choose a debt.");
         if (!accountId) throw new Error("Choose an account.");
         if (!isIsoDate(body.paymentDate)) throw new Error("Valid payment date is required.");
         const debt = await getOwnedDebt(user.id, debtId);
         const account = await getOwnedAccount(user.id, accountId);
         if (!account.active) throw new Error("Choose an active account.");
         if (account.currency !== debt.currency) {
            throw new Error(`Use a ${debt.currency} account for this debt.`);
         }
         const amount = requirePositiveAmount(body.amount);
         const { data: paymentRows, error: paymentError } = await supabaseAdmin
            .from("finance_debt_payments")
            .select("amount")
            .eq("owner_user_id", user.id)
            .eq("debt_id", debt.id);
         if (paymentError) throw new Error("Could not verify debt balance.");
         const remaining =
            Number(debt.principal_amount) -
            (paymentRows || []).reduce((sum, payment) => sum + Number(payment.amount), 0);
         if (amount > remaining) {
            throw new Error(`Payment cannot exceed the remaining ${debt.currency} ${remaining.toFixed(2)}.`);
         }
         const note = cleanFinanceText(body.note, 240) || null;
         const { data, error } = await supabaseAdmin
            .from("finance_debt_payments")
            .insert({
               owner_user_id: user.id,
               debt_id: debt.id,
               account_id: account.id,
               amount,
               payment_date: body.paymentDate,
               note,
            })
            .select("id, debt_id, account_id, amount, payment_date, note, created_at")
            .single();
         if (error || !data) throw new Error("Failed to record debt payment.");
         return NextResponse.json({ payment: mapDebtPayment(data as DebtPaymentRow, new Map([[account.id, account.name]])) });
      }

      if (body?.action === "transaction") {
         const accountId = cleanFinanceText(body.accountId, 60);
         const categoryId = cleanFinanceText(body.categoryId, 60);
         if (!accountId) throw new Error("Choose an account.");
         if (!categoryId) throw new Error("Choose a category.");
         const account = await getOwnedAccount(user.id, accountId);
         const category = await getOwnedCategory(user.id, categoryId);
         if (!account.active) throw new Error("Choose an active account.");
         if (!category.active) throw new Error("Choose an active category.");
         const amount = requirePositiveAmount(body.amount);
         if (!isIsoDate(body.entryDate)) throw new Error("Valid transaction date is required.");
         const rate =
            account.currency === "UZS"
               ? 1
               : requirePositiveAmount(body.exchangeRateToUzs, "USD exchange rate");
         const { data, error } = await supabaseAdmin
            .from("finance_transactions")
            .insert({
               owner_user_id: user.id,
               account_id: account.id,
               category_id: category.id,
               entry_type: category.entry_type,
               amount,
               currency: account.currency,
               exchange_rate_to_uzs: rate,
               entry_date: body.entryDate,
               note: cleanFinanceText(body.note) || null,
            })
            .select(
               "id, account_id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at",
            )
            .single();
         if (error || !data) throw new Error("Failed to save transaction.");
         return NextResponse.json({
            transaction: mapTransaction(
               data as unknown as TransactionRow,
               new Map([[category.id, category]]),
               new Map([[account.id, account.name]]),
            ),
         });
      }

      if (body?.action === "transfer") {
         const fromAccountId = cleanFinanceText(body.fromAccountId, 60);
         const toAccountId = cleanFinanceText(body.toAccountId, 60);
         if (!fromAccountId || !toAccountId) {
            throw new Error("Choose both transfer accounts.");
         }
         if (fromAccountId === toAccountId) {
            throw new Error("Transfer accounts must be different.");
         }
         if (!isIsoDate(body.transferDate)) {
            throw new Error("Valid transfer date is required.");
         }
         const [fromAccount, toAccount] = await Promise.all([
            getOwnedAccount(user.id, fromAccountId),
            getOwnedAccount(user.id, toAccountId),
         ]);
         if (!fromAccount.active || !toAccount.active) {
            throw new Error("Choose active accounts.");
         }
         const fromAmount = requirePositiveAmount(body.fromAmount, "Sent amount");
         const toAmount =
            fromAccount.currency === toAccount.currency
               ? fromAmount
               : requirePositiveAmount(body.toAmount, "Received amount");
         const { data, error } = await supabaseAdmin
            .from("finance_transfers")
            .insert({
               owner_user_id: user.id,
               from_account_id: fromAccount.id,
               to_account_id: toAccount.id,
               from_amount: fromAmount,
               to_amount: toAmount,
               from_currency: fromAccount.currency,
               to_currency: toAccount.currency,
               transfer_date: body.transferDate,
               note: cleanFinanceText(body.note) || null,
            })
            .select(
               "id, from_account_id, to_account_id, from_amount, to_amount, from_currency, to_currency, transfer_date, note, created_at",
            )
            .single();
         if (error || !data) throw new Error("Failed to save transfer.");
         return NextResponse.json({
            transfer: mapTransfer(
               data as TransferRow,
               new Map([
                  [fromAccount.id, fromAccount.name],
                  [toAccount.id, toAccount.name],
               ]),
            ),
         });
      }

      if (body?.action === "budget") {
         const categoryId = cleanFinanceText(body.categoryId, 60);
         if (!categoryId) throw new Error("Choose a category.");
         const category = await getOwnedCategory(user.id, categoryId);
         if (category.entry_type === "income") {
            throw new Error("Budgets can be set for expenses and savings.");
         }
         if (category.parent_category_id) {
            throw new Error("Set budgets on the parent category so every subcategory rolls up.");
         }
         if (!isMonthStart(body.monthStart)) throw new Error("Valid budget month is required.");
         if (!isFinanceCurrency(body.currency)) throw new Error("Valid currency is required.");
         const amount = requirePositiveAmount(body.amount, "Plan amount");
         const { data, error } = await supabaseAdmin
            .from("finance_budgets")
            .upsert(
               {
                  owner_user_id: user.id,
                  category_id: category.id,
                  month_start: body.monthStart,
                  amount,
                  currency: body.currency,
               },
               { onConflict: "owner_user_id,category_id,month_start" },
            )
            .select("id, category_id, month_start, amount, currency")
            .single();
         if (error || !data) throw new Error("Failed to save plan.");
         return NextResponse.json({ budget: mapBudget(data as BudgetRow) });
      }

      throw new Error("Valid action is required.");
   } catch (error) {
      return jsonError(error, "Failed to save your finance data.");
   }
}

export async function PATCH(req: Request) {
   try {
      const user = await requirePrivateFinanceUser(req);
      const body = await req.json();

      if (body?.action === "transaction") {
         const id = cleanFinanceText(body.id, 60);
         if (!id) throw new Error("Transaction id is required.");
         const { data: existing, error: existingError } = await supabaseAdmin
            .from("finance_transactions")
            .select("id, account_id, category_id, currency, exchange_rate_to_uzs")
            .eq("id", id)
            .eq("owner_user_id", user.id)
            .single();
         if (existingError || !existing) throw new Error("Choose a valid transaction.");
         const accountId = cleanFinanceText(body.accountId, 60);
         const categoryId = cleanFinanceText(body.categoryId, 60);
         if (!accountId && existing.account_id) throw new Error("Choose an account.");
         if (!categoryId) throw new Error("Choose a category.");
         const account = accountId ? await getOwnedAccount(user.id, accountId) : null;
         const category = await getOwnedCategory(user.id, categoryId);
         if (account && !account.active && account.id !== existing.account_id) throw new Error("Choose an active account.");
         if (!category.active && category.id !== existing.category_id) throw new Error("Choose an active category.");
         const amount = requirePositiveAmount(body.amount);
         if (amount <= 0) throw new Error("Amount must be at least 0.01.");
         if (!isIsoDate(body.entryDate)) throw new Error("Valid transaction date is required.");
         const currency = account?.currency || existing.currency;
         // Editing a historical transaction must not revalue it at today's rate.
         const exchangeRate = currency === "UZS" ? 1 : currency === existing.currency
            ? Number(existing.exchange_rate_to_uzs)
            : requirePositiveAmount(body.exchangeRateToUzs, "USD exchange rate");
         const { data, error } = await supabaseAdmin
            .from("finance_transactions")
            .update({
               account_id: account?.id || null,
               category_id: category.id,
               entry_type: category.entry_type,
               amount,
               currency,
               exchange_rate_to_uzs: exchangeRate,
               entry_date: body.entryDate,
               note: cleanFinanceText(body.note) || null,
            })
            .eq("id", id)
            .eq("owner_user_id", user.id)
            .select("id")
            .single();
         if (error || !data) throw new Error("Failed to update transaction.");
         return NextResponse.json({ ok: true });
      }

      if (body?.action === "account") {
         const id = cleanFinanceText(body.id, 60);
         const name = cleanFinanceText(body.name, 80);
         if (!id || !name) throw new Error("Account name is required.");
         const openingBalance = Number(body.openingBalance || 0);
         if (!Number.isFinite(openingBalance)) {
            throw new Error("Opening balance must be a valid number.");
         }
         const color = CATEGORY_COLORS.includes(body.color) ? body.color : "#657568";
         const { data, error } = await supabaseAdmin
            .from("finance_accounts")
            .update({
               name,
               opening_balance: Number(openingBalance.toFixed(2)),
               color,
               active: body.active !== false,
            })
            .eq("id", id)
            .eq("owner_user_id", user.id)
            .select("id, name, account_type, currency, opening_balance, color, active")
            .single();
         if (error || !data) {
            if (error?.code === "23505") throw new Error("This account already exists.");
            throw new Error("Failed to update account.");
         }
         return NextResponse.json({ account: mapAccount(data as AccountRow) });
      }

      if (body?.action !== "category") throw new Error("Valid action is required.");
      const id = cleanFinanceText(body.id, 60);
      const name = cleanFinanceText(body.name, 80);
      if (!id || !name) throw new Error("Category name is required.");
      const color = CATEGORY_COLORS.includes(body.color) ? body.color : "#657568";
      const icon = cleanFinanceText(body.icon, 40) || "circle";
      const { data, error } = await supabaseAdmin
         .from("finance_categories")
         .update({ name, color, icon, active: body.active !== false })
         .eq("id", id)
         .eq("owner_user_id", user.id)
         .select("id, parent_category_id, name, entry_type, color, icon, active")
         .single();
      if (error || !data) {
         if (error?.code === "23505") throw new Error("This category already exists.");
         throw new Error("Failed to update category.");
      }
      return NextResponse.json({ category: mapCategory(data as CategoryRow) });
   } catch (error) {
      return jsonError(error, "Failed to update category.");
   }
}

export async function DELETE(req: Request) {
   try {
      const user = await requirePrivateFinanceUser(req);
      const body = await req.json();
      const id = cleanFinanceText(body.id, 60);
      if (!id) throw new Error("Record id is required.");

      if (body?.action === "transaction") {
         const { error } = await supabaseAdmin
            .from("finance_transactions")
            .delete()
            .eq("id", id)
            .eq("owner_user_id", user.id);
         if (error) throw new Error("Failed to delete transaction.");
         return NextResponse.json({ ok: true });
      }

      if (body?.action === "transfer") {
         const { error } = await supabaseAdmin
            .from("finance_transfers")
            .delete()
            .eq("id", id)
            .eq("owner_user_id", user.id);
         if (error) throw new Error("Failed to delete transfer.");
         return NextResponse.json({ ok: true });
      }

      if (body?.action === "budget") {
         const { error } = await supabaseAdmin
            .from("finance_budgets")
            .delete()
            .eq("id", id)
            .eq("owner_user_id", user.id);
         if (error) throw new Error("Failed to delete plan.");
         return NextResponse.json({ ok: true });
      }

      throw new Error("Valid action is required.");
   } catch (error) {
      return jsonError(error, "Failed to delete record.");
   }
}
