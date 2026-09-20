/** Index direct and parent totals once, preserving transaction order and amounts. */
export function financeCategoryTotals<T extends { categoryId: string; parentCategoryId: string | null }>(
   transactions: T[],
   amount: (transaction: T) => number,
) {
   const totals = new Map<string, number>();
   for (const transaction of transactions) {
      const value = amount(transaction);
      totals.set(transaction.categoryId, (totals.get(transaction.categoryId) || 0) + value);
      if (transaction.parentCategoryId && transaction.parentCategoryId !== transaction.categoryId) {
         totals.set(transaction.parentCategoryId, (totals.get(transaction.parentCategoryId) || 0) + value);
      }
   }
   return totals;
}
