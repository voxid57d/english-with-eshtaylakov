import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   cleanFinanceText,
   isFinanceAccountType,
   isFinanceCurrency,
   isFinanceEntryType,
   isIsoDate,
   isMonthStart,
   privateFinanceError,
   requirePositiveAmount,
   requirePrivateFinanceUser,
   type FinanceAccountType,
   type FinanceCurrency,
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
   finance_categories?: { name: string; color: string; icon: string } | null;
   finance_accounts?: { name: string } | null;
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

function mapTransaction(row: TransactionRow) {
   return {
      id: row.id,
      accountId: row.account_id,
      accountName: row.finance_accounts?.name || "Unassigned",
      categoryId: row.category_id,
      categoryName: row.finance_categories?.name || "Category",
      categoryColor: row.finance_categories?.color || "#657568",
      categoryIcon: row.finance_categories?.icon || "circle",
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

async function getOwnedCategory(userId: string, categoryId: string) {
   const { data, error } = await supabaseAdmin
      .from("finance_categories")
      .select("id, name, entry_type, color, icon, active")
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

      const [
         accountResult,
         categoryResult,
         transactionResult,
         transferResult,
         budgetResult,
         balanceTransactionResult,
         balanceTransferResult,
         exchangeRate,
      ] = await Promise.all([
            supabaseAdmin
               .from("finance_accounts")
               .select("id, name, account_type, currency, opening_balance, color, active")
               .eq("owner_user_id", user.id)
               .order("active", { ascending: false })
               .order("name"),
            supabaseAdmin
               .from("finance_categories")
               .select("id, name, entry_type, color, icon, active")
               .eq("owner_user_id", user.id)
               .order("entry_type")
               .order("name"),
            supabaseAdmin
               .from("finance_transactions")
               .select(
                  "id, account_id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at, finance_categories(name, color, icon), finance_accounts(name)",
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
            getUsdRate(),
         ]);

      if (
         accountResult.error ||
         categoryResult.error ||
         transactionResult.error ||
         transferResult.error ||
         budgetResult.error ||
         balanceTransactionResult.error ||
         balanceTransferResult.error
      ) {
         throw new Error(
            "Finance storage is not ready. Apply supabase/private_finance_schema.sql first.",
         );
      }

      const accountRows = (accountResult.data || []) as AccountRow[];
      const accountNames = new Map(accountRows.map((account) => [account.id, account.name]));
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

      return NextResponse.json({
         user: { id: user.id, email: user.email || null },
         period,
         accounts: accountRows.map((account) => mapAccount(account, balances.get(account.id))),
         categories: ((categoryResult.data || []) as CategoryRow[]).map(mapCategory),
         transactions: ((transactionResult.data || []) as unknown as TransactionRow[]).map(
            mapTransaction,
         ),
         transfers: ((transferResult.data || []) as TransferRow[]).map((transfer) =>
            mapTransfer(transfer, accountNames),
         ),
         budgets: ((budgetResult.data || []) as BudgetRow[]).map(mapBudget),
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
         const color = CATEGORY_COLORS.includes(body.color) ? body.color : "#657568";
         const icon = cleanFinanceText(body.icon, 40) || "circle";
         const { data, error } = await supabaseAdmin
            .from("finance_categories")
            .insert({
               owner_user_id: user.id,
               name,
               entry_type: body.entryType,
               color,
               icon,
            })
            .select("id, name, entry_type, color, icon, active")
            .single();
         if (error || !data) {
            if (error?.code === "23505") throw new Error("This category already exists.");
            throw new Error("Failed to create category.");
         }
         return NextResponse.json({ category: mapCategory(data as CategoryRow) });
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
               "id, account_id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at, finance_categories(name, color, icon), finance_accounts(name)",
            )
            .single();
         if (error || !data) throw new Error("Failed to save transaction.");
         return NextResponse.json({
            transaction: mapTransaction(data as unknown as TransactionRow),
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
      const { data, error } = await supabaseAdmin
         .from("finance_categories")
         .update({ name, color, active: body.active !== false })
         .eq("id", id)
         .eq("owner_user_id", user.id)
         .select("id, name, entry_type, color, icon, active")
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
