import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   cleanFinanceText,
   isFinanceCurrency,
   isFinanceEntryType,
   isIsoDate,
   isMonthStart,
   privateFinanceError,
   requirePositiveAmount,
   requirePrivateFinanceUser,
   type FinanceCurrency,
   type FinanceEntryType,
} from "@/lib/privateFinance";

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
   category_id: string;
   entry_type: FinanceEntryType;
   amount: number | string;
   currency: FinanceCurrency;
   exchange_rate_to_uzs: number | string;
   entry_date: string;
   note: string | null;
   created_at: string;
   finance_categories?: { name: string; color: string; icon: string } | null;
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

function mapTransaction(row: TransactionRow) {
   return {
      id: row.id,
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

export async function GET(req: Request) {
   try {
      const user = await requirePrivateFinanceUser(req);
      const period = monthBounds(new URL(req.url).searchParams.get("month"));

      const [categoryResult, transactionResult, budgetResult, exchangeRate] =
         await Promise.all([
            supabaseAdmin
               .from("finance_categories")
               .select("id, name, entry_type, color, icon, active")
               .eq("owner_user_id", user.id)
               .order("entry_type")
               .order("name"),
            supabaseAdmin
               .from("finance_transactions")
               .select(
                  "id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at, finance_categories(name, color, icon)",
               )
               .eq("owner_user_id", user.id)
               .gte("entry_date", period.start)
               .lte("entry_date", period.end)
               .order("entry_date", { ascending: false })
               .order("created_at", { ascending: false }),
            supabaseAdmin
               .from("finance_budgets")
               .select("id, category_id, month_start, amount, currency")
               .eq("owner_user_id", user.id)
               .eq("month_start", period.start),
            getUsdRate(),
         ]);

      if (categoryResult.error || transactionResult.error || budgetResult.error) {
         throw new Error(
            "Finance storage is not ready. Apply supabase/private_finance_schema.sql first.",
         );
      }

      return NextResponse.json({
         user: { id: user.id, email: user.email || null },
         period,
         categories: ((categoryResult.data || []) as CategoryRow[]).map(mapCategory),
         transactions: ((transactionResult.data || []) as unknown as TransactionRow[]).map(
            mapTransaction,
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
         const categoryId = cleanFinanceText(body.categoryId, 60);
         if (!categoryId) throw new Error("Choose a category.");
         const category = await getOwnedCategory(user.id, categoryId);
         if (!category.active) throw new Error("Choose an active category.");
         const amount = requirePositiveAmount(body.amount);
         if (!isFinanceCurrency(body.currency)) throw new Error("Valid currency is required.");
         if (!isIsoDate(body.entryDate)) throw new Error("Valid transaction date is required.");
         const rate =
            body.currency === "UZS"
               ? 1
               : requirePositiveAmount(body.exchangeRateToUzs, "USD exchange rate");
         const { data, error } = await supabaseAdmin
            .from("finance_transactions")
            .insert({
               owner_user_id: user.id,
               category_id: category.id,
               entry_type: category.entry_type,
               amount,
               currency: body.currency,
               exchange_rate_to_uzs: rate,
               entry_date: body.entryDate,
               note: cleanFinanceText(body.note) || null,
            })
            .select(
               "id, category_id, entry_type, amount, currency, exchange_rate_to_uzs, entry_date, note, created_at, finance_categories(name, color, icon)",
            )
            .single();
         if (error || !data) throw new Error("Failed to save transaction.");
         return NextResponse.json({
            transaction: mapTransaction(data as unknown as TransactionRow),
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
