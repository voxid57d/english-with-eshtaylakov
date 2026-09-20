export function financeComparisonPeriod(month: string, today: string) {
   const [year, monthNumber] = month.split("-").map(Number);
   const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1)).toISOString().slice(0, 7);
   const daysInMonth = (value: string) => {
      const [y, m] = value.split("-").map(Number);
      return new Date(Date.UTC(y, m, 0)).getUTCDate();
   };
   const current = month === today.slice(0, 7);
   const matchedDays = Math.min(Number(today.slice(8)), daysInMonth(previousMonth));
   return {
      available: month <= today.slice(0, 7),
      partial: current,
      start: `${month}-01`,
      end: `${month}-${String(current ? matchedDays : daysInMonth(month)).padStart(2, "0")}`,
      previousStart: `${previousMonth}-01`,
      previousEnd: `${previousMonth}-${String(current ? matchedDays : daysInMonth(previousMonth)).padStart(2, "0")}`,
   };
}

type ComparisonTransaction = {
   entryType: "expense" | "income" | "savings";
   entryDate: string;
   amount: number;
   currency: string;
   exchangeRateToUzs: number;
   categoryId: string;
   categoryName: string;
   parentCategoryId: string | null;
   parentCategoryName: string | null;
};

export function compareFinanceMonths(
   transactions: ComparisonTransaction[],
   previousTransactions: ComparisonTransaction[],
   period: ReturnType<typeof financeComparisonPeriod>,
) {
   const summarize = (rows: ComparisonTransaction[], start: string, end: string) => {
      const totals = { expense: 0, income: 0, savings: 0 };
      const categories = new Map<string, { name: string; amount: number }>();
      for (const row of rows) {
         if (row.entryDate < start || row.entryDate > end) continue;
         const amount = row.amount * (row.currency === "USD" ? row.exchangeRateToUzs : 1);
         totals[row.entryType] += amount;
         if (row.entryType === "expense") {
            const id = row.parentCategoryId || row.categoryId;
            categories.set(id, {
               name: row.parentCategoryName || row.categoryName,
               amount: (categories.get(id)?.amount || 0) + amount,
            });
         }
      }
      return { totals, categories };
   };
   const current = summarize(transactions, period.start, period.end);
   const previous = summarize(previousTransactions, period.previousStart, period.previousEnd);
   const changes = [...new Set([...current.categories.keys(), ...previous.categories.keys()])]
      .map((id) => ({
         id,
         name: current.categories.get(id)?.name || previous.categories.get(id)!.name,
         difference: (current.categories.get(id)?.amount || 0) - (previous.categories.get(id)?.amount || 0),
      }))
      .filter((item) => Math.abs(item.difference) >= 0.01)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));
   return { current: current.totals, previous: previous.totals, changes };
}
