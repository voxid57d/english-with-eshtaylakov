import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getFinanceOwner, privateFinanceError } from "@/lib/privateFinance";
import { emptyFinanceBackup, FINANCE_TABLES, validateFinanceBackup, type FinanceRow, type FinanceTable } from "@/lib/financeBackup";

export const dynamic = "force-dynamic";
const tableNames: Record<FinanceTable, string> = {
   accounts: "finance_accounts", categories: "finance_categories", transactions: "finance_transactions", transfers: "finance_transfers",
   budgets: "finance_budgets", debts: "finance_debts", debtPayments: "finance_debt_payments",
};

export async function GET() {
   try {
      const owner = getFinanceOwner();
      const backup = emptyFinanceBackup();
      backup.currencyMode = "mixed";
      // Pagination is essential: the usual Supabase result limit is not a full backup.
      const results = await Promise.all(FINANCE_TABLES.map(async table => {
         const rows: FinanceRow[] = [];
         for (let offset = 0; ; offset += 500) {
            const { data, error } = await supabaseAdmin.from(tableNames[table]).select("*").eq("owner_user_id", owner.id).order("id").range(offset, offset + 499);
            if (error) throw new Error(`Could not export ${table}. ${error.message}`);
            rows.push(...(data || []) as FinanceRow[]);
            if (!data || data.length < 500) break;
         }
         return [table, rows] as const;
      }));
      for (const [table, rows] of results) backup.tables[table] = rows;
      const needsRate = FINANCE_TABLES.some(table => backup.tables[table].some(row => [row.currency, row.from_currency, row.to_currency].includes("USD")));
      if (needsRate) {
         const response = await fetch("https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/", { cache: "no-store" });
         if (!response.ok) throw new Error("Could not fetch the migration exchange rate. Please try exporting again.");
         const rates = await response.json();
         const rate = Number(rates[0]?.Rate);
         if (!Number.isFinite(rate) || rate <= 0) throw new Error("A valid migration exchange rate is unavailable.");
         backup.conversionRate = rate;
      }
      const validated = validateFinanceBackup(backup);
      return NextResponse.json(validated, { headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="quiet-money-website-${backup.exportedAt.slice(0, 10)}.json"` } });
   } catch (error) {
      const result = privateFinanceError(error, "Could not export finance data.");
      return NextResponse.json({ error: result.message }, { status: result.status, headers: { "Cache-Control": "no-store" } });
   }
}
