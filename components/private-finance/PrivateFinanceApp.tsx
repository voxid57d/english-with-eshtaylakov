"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiArchiveLight,
   PiArrowsLeftRightLight,
   PiCalendarBlankLight,
   PiCaretLeftLight,
   PiCaretRightLight,
   PiChartDonutLight,
   PiHouseLineLight,
   PiLockKeyLight,
   PiPiggyBankLight,
   PiPlusLight,
   PiSignOutLight,
   PiTagLight,
   PiTrashLight,
   PiTrendDownLight,
   PiTrendUpLight,
   PiWalletLight,
   PiXLight,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { getLocalDateString } from "@/lib/localDate";
import { supabase } from "@/lib/supabaseClient";
import type { FinanceCurrency, FinanceEntryType } from "@/lib/privateFinance";
import styles from "./private-finance.module.css";

type Category = {
   id: string;
   name: string;
   entryType: FinanceEntryType;
   color: string;
   icon: string;
   active: boolean;
};

type FinanceTransaction = {
   id: string;
   categoryId: string;
   categoryName: string;
   categoryColor: string;
   categoryIcon: string;
   entryType: FinanceEntryType;
   amount: number;
   currency: FinanceCurrency;
   exchangeRateToUzs: number;
   entryDate: string;
   note: string | null;
};

type Budget = {
   id: string;
   categoryId: string;
   monthStart: string;
   amount: number;
   currency: FinanceCurrency;
};

type ExchangeRate = {
   rate: number;
   date: string | null;
   change: number;
   source: string;
} | null;

type FinancePayload = {
   user: { id: string; email: string | null };
   categories: Category[];
   transactions: FinanceTransaction[];
   budgets: Budget[];
   exchangeRate: ExchangeRate;
};

type View = "overview" | "transactions" | "plans" | "categories";
type Modal = "transaction" | "category" | "budget" | null;
type AccessState = "loading" | "ready" | "signed-out" | "denied" | "error";

const TYPE_META: Record<
   FinanceEntryType,
   { label: string; shortLabel: string; icon: IconType; sign: string }
> = {
   expense: { label: "Expenses", shortLabel: "Expense", icon: PiTrendDownLight, sign: "−" },
   income: { label: "Income", shortLabel: "Income", icon: PiTrendUpLight, sign: "+" },
   savings: { label: "Savings", shortLabel: "Saving", icon: PiPiggyBankLight, sign: "↗" },
};

const CATEGORY_ICONS: Record<string, string> = {
   circle: "●",
   home: "⌂",
   food: "◇",
   transport: "↗",
   health: "+",
   shopping: "□",
   salary: "↟",
   gift: "✦",
   education: "A",
   travel: "△",
   emergency: "!",
   goal: "◎",
};

const COLORS = [
   "#E26D5A",
   "#D99B43",
   "#4F8F67",
   "#4E8297",
   "#5B7DB1",
   "#8A6BB1",
   "#A65D79",
   "#657568",
];

const NAV_ITEMS: Array<{ id: View; label: string; icon: IconType }> = [
   { id: "overview", label: "Overview", icon: PiHouseLineLight },
   { id: "transactions", label: "Transactions", icon: PiArrowsLeftRightLight },
   { id: "plans", label: "Plans & goals", icon: PiChartDonutLight },
   { id: "categories", label: "Categories", icon: PiTagLight },
];

function currentMonth() {
   return getLocalDateString().slice(0, 7);
}

function shiftMonth(month: string, amount: number) {
   const [year, monthNumber] = month.split("-").map(Number);
   const date = new Date(year, monthNumber - 1 + amount, 1);
   return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
   const [year, monthNumber] = month.split("-").map(Number);
   return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(
      new Date(year, monthNumber - 1, 1),
   );
}

function shortDate(date: string) {
   return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      new Date(`${date}T00:00:00`),
   );
}

function initials(email: string | null) {
   return (email?.split("@")[0]?.slice(0, 2) || "ME").toUpperCase();
}

export default function PrivateFinanceApp() {
   const [access, setAccess] = useState<AccessState>("loading");
   const [payload, setPayload] = useState<FinancePayload | null>(null);
   const [view, setView] = useState<View>("overview");
   const [modal, setModal] = useState<Modal>(null);
   const [month, setMonth] = useState(currentMonth);
   const [displayCurrency, setDisplayCurrency] = useState<FinanceCurrency>("UZS");
   const [filter, setFilter] = useState<FinanceEntryType | "all">("all");
   const [busy, setBusy] = useState(false);
   const [message, setMessage] = useState<string | null>(null);

   const loadData = useCallback(async () => {
      try {
         setMessage(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(`/api/private-finance?month=${month}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
         });
         const data = await response.json();
         if (!response.ok) {
            if (response.status === 401) {
               setAccess("signed-out");
               return;
            }
            if (response.status === 403) {
               setAccess("denied");
               return;
            }
            throw new Error(data.error || "Could not open your finance space.");
         }
         setPayload(data);
         setAccess("ready");
      } catch (error) {
         const text = error instanceof Error ? error.message : "Could not open this page.";
         if (text.includes("sign in") || text.includes("session")) {
            setAccess("signed-out");
         } else {
            setMessage(text);
            setAccess("error");
         }
      }
   }, [month]);

   useEffect(() => {
      void loadData();
   }, [loadData]);

   const request = useCallback(
      async (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => {
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/private-finance", {
            method,
            headers: {
               Authorization: `Bearer ${token}`,
               "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
         });
         const data = await response.json();
         if (!response.ok) throw new Error(data.error || "Something went wrong.");
         return data;
      },
      [],
   );

   const rate = payload?.exchangeRate?.rate || 1;
   const toUzs = useCallback(
      (transaction: FinanceTransaction) =>
         transaction.amount * (transaction.currency === "USD" ? transaction.exchangeRateToUzs : 1),
      [],
   );
   const planToUzs = useCallback(
      (budget: Budget) => budget.amount * (budget.currency === "USD" ? rate : 1),
      [rate],
   );
   const displayMoney = useCallback(
      (uzsAmount: number, compact = false) => {
         const value = displayCurrency === "USD" ? uzsAmount / rate : uzsAmount;
         const formatter = new Intl.NumberFormat("en-US", {
            notation: compact && Math.abs(value) >= 1000000 ? "compact" : "standard",
            maximumFractionDigits: displayCurrency === "USD" ? 2 : 0,
         });
         return displayCurrency === "USD"
            ? `$${formatter.format(value)}`
            : `${formatter.format(value)} UZS`;
      },
      [displayCurrency, rate],
   );

   const totals = useMemo(() => {
      const result = { expense: 0, income: 0, savings: 0 };
      for (const transaction of payload?.transactions || []) {
         result[transaction.entryType] += toUzs(transaction);
      }
      return { ...result, available: result.income - result.expense - result.savings };
   }, [payload?.transactions, toUzs]);

   const signIn = async () => {
      setBusy(true);
      setMessage(null);
      await supabase.auth.signInWithOAuth({
         provider: "google",
         options: {
            redirectTo: `${window.location.origin}/auth/callback?next=/x97-private-portal`,
         },
      });
      setBusy(false);
   };

   const signOut = async () => {
      await supabase.auth.signOut();
      setPayload(null);
      setAccess("signed-out");
   };

   if (access !== "ready" || !payload) {
      return (
         <main className={styles.gate}>
            <section className={styles.gateCard}>
               <div className={styles.gateIcon}><PiLockKeyLight /></div>
               <p className={styles.eyebrow}>Private space</p>
               <h1>{access === "denied" ? "Access not granted" : "Your money, in one quiet place."}</h1>
               <p>
                  {access === "loading"
                     ? "Checking your secure session…"
                     : access === "denied"
                       ? "This account is not the owner of this private finance space."
                       : message || "Sign in with the approved Google account to continue."}
               </p>
               {access === "loading" ? (
                  <div className={styles.loader} aria-label="Loading" />
               ) : access === "signed-out" ? (
                  <button className={styles.primaryButton} onClick={signIn} disabled={busy}>
                     <PiLockKeyLight /> {busy ? "Opening…" : "Unlock with Google"}
                  </button>
               ) : access === "error" ? (
                  <button className={styles.secondaryButton} onClick={() => void loadData()}>
                     Try again
                  </button>
               ) : null}
               <span className={styles.privateNote}>Encrypted in transit · Private by account</span>
            </section>
         </main>
      );
   }

   const recent = payload.transactions.slice(0, 6);
   const filteredTransactions = payload.transactions.filter(
      (transaction) => filter === "all" || transaction.entryType === filter,
   );

   return (
      <div className={styles.financeApp}>
         <aside className={styles.sidebar}>
            <div className={styles.brand}>
               <span className={styles.brandMark}><PiWalletLight /></span>
               <span><b>Quiet Money</b><small>Personal finance</small></span>
            </div>
            <nav className={styles.nav} aria-label="Finance navigation">
               {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                     <button key={item.id} className={view === item.id ? styles.navActive : ""} onClick={() => setView(item.id)}>
                        <Icon /><span>{item.label}</span>
                     </button>
                  );
               })}
            </nav>
            <div className={styles.sideFooter}>
               <div className={styles.avatar}>{initials(payload.user.email)}</div>
               <div><b>{payload.user.email?.split("@")[0] || "Owner"}</b><small>Private owner</small></div>
               <button onClick={signOut} title="Sign out"><PiSignOutLight /></button>
            </div>
         </aside>

         <main className={styles.main}>
            <header className={styles.topbar}>
               <div className={styles.monthPicker}>
                  <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><PiCaretLeftLight /></button>
                  <span><PiCalendarBlankLight /> {monthLabel(month)}</span>
                  <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month"><PiCaretRightLight /></button>
               </div>
               <div className={styles.topActions}>
                  <div className={styles.ratePill} title="Official Central Bank rate">
                     <span>$</span>
                     <div><small>1 USD</small><b>{payload.exchangeRate ? `${new Intl.NumberFormat("en-US").format(rate)} UZS` : "Rate unavailable"}</b></div>
                     {payload.exchangeRate && <em className={payload.exchangeRate.change >= 0 ? styles.rateUp : styles.rateDown}>{payload.exchangeRate.change >= 0 ? "+" : ""}{payload.exchangeRate.change.toFixed(2)}</em>}
                  </div>
                  <div className={styles.currencyToggle}>
                     {(["UZS", "USD"] as const).map((currency) => (
                        <button key={currency} className={displayCurrency === currency ? styles.currencyActive : ""} onClick={() => setDisplayCurrency(currency)}>{currency}</button>
                     ))}
                  </div>
                  <button className={styles.addButton} onClick={() => setModal("transaction")}><PiPlusLight /> Add transaction</button>
               </div>
            </header>

            {message && <div className={styles.toast}>{message}<button onClick={() => setMessage(null)}><PiXLight /></button></div>}

            <div className={styles.mobileNav}>
               {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return <button key={item.id} className={view === item.id ? styles.mobileActive : ""} onClick={() => setView(item.id)}><Icon /><span>{item.label.split(" ")[0]}</span></button>;
               })}
            </div>

            {view === "overview" && (
               <Overview
                  totals={totals}
                  transactions={recent}
                  categories={payload.categories}
                  budgets={payload.budgets}
                  displayMoney={displayMoney}
                  toUzs={toUzs}
                  planToUzs={planToUzs}
                  onAdd={() => setModal("transaction")}
                  onViewAll={() => setView("transactions")}
               />
            )}
            {view === "transactions" && (
               <Transactions
                  transactions={filteredTransactions}
                  filter={filter}
                  setFilter={setFilter}
                  displayMoney={displayMoney}
                  toUzs={toUzs}
                  onAdd={() => setModal("transaction")}
                  onDelete={async (id) => {
                     if (!window.confirm("Delete this transaction?")) return;
                     try { await request("DELETE", { action: "transaction", id }); await loadData(); }
                     catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed."); }
                  }}
               />
            )}
            {view === "plans" && (
               <Plans
                  budgets={payload.budgets}
                  categories={payload.categories}
                  transactions={payload.transactions}
                  displayMoney={displayMoney}
                  toUzs={toUzs}
                  planToUzs={planToUzs}
                  onAdd={() => setModal("budget")}
                  onDelete={async (id) => {
                     try { await request("DELETE", { action: "budget", id }); await loadData(); }
                     catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed."); }
                  }}
               />
            )}
            {view === "categories" && (
               <Categories
                  categories={payload.categories}
                  onAdd={() => setModal("category")}
                  onToggle={async (category) => {
                     try {
                        await request("PATCH", { action: "category", ...category, active: !category.active });
                        await loadData();
                     } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); }
                  }}
               />
            )}
         </main>

         {modal === "transaction" && (
            <TransactionModal
               categories={payload.categories}
               rate={rate}
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "category" && (
            <CategoryModal
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "budget" && (
            <BudgetModal
               categories={payload.categories}
               month={month}
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
      </div>
   );
}

function PageHeading({
   eyebrow,
   title,
   description,
   action,
   actionLabel,
}: {
   eyebrow: string;
   title: string;
   description: string;
   action?: () => void;
   actionLabel?: string;
}) {
   return (
      <div className={styles.pageHeading}>
         <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
         </div>
         {action && <button className={styles.secondaryButton} onClick={action}><PiPlusLight /> {actionLabel}</button>}
      </div>
   );
}

function SummaryCard({
   label,
   value,
   note,
   icon: Icon,
   tone,
}: {
   label: string;
   value: string;
   note: string;
   icon: IconType;
   tone: "green" | "red" | "blue" | "ink";
}) {
   return (
      <article className={`${styles.summaryCard} ${styles[`tone_${tone}`]}`}>
         <div className={styles.summaryIcon}><Icon /></div>
         <p>{label}</p>
         <strong>{value}</strong>
         <small>{note}</small>
      </article>
   );
}

function Overview({
   totals,
   transactions,
   categories,
   budgets,
   displayMoney,
   toUzs,
   planToUzs,
   onAdd,
   onViewAll,
}: {
   totals: { expense: number; income: number; savings: number; available: number };
   transactions: FinanceTransaction[];
   categories: Category[];
   budgets: Budget[];
   displayMoney: (amount: number, compact?: boolean) => string;
   toUzs: (transaction: FinanceTransaction) => number;
   planToUzs: (budget: Budget) => number;
   onAdd: () => void;
   onViewAll: () => void;
}) {
   const expenseByCategory = categories
      .filter((category) => category.entryType === "expense")
      .map((category) => ({
         ...category,
         total: transactions
            .filter((transaction) => transaction.categoryId === category.id)
            .reduce((sum, transaction) => sum + toUzs(transaction), 0),
      }))
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total);
   const biggestExpense = Math.max(...expenseByCategory.map((item) => item.total), 1);
   const planned = budgets
      .filter((budget) => categories.find((category) => category.id === budget.categoryId)?.entryType === "expense")
      .reduce((sum, budget) => sum + planToUzs(budget), 0);

   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Monthly snapshot" title="Good to see you." description="A calm view of what came in, went out, and moved toward your goals." />
         <section className={styles.summaryGrid}>
            <SummaryCard label="Available" value={displayMoney(totals.available, true)} note="Income after spending & savings" icon={PiWalletLight} tone="ink" />
            <SummaryCard label="Income" value={displayMoney(totals.income, true)} note="Received this month" icon={PiTrendUpLight} tone="green" />
            <SummaryCard label="Expenses" value={displayMoney(totals.expense, true)} note={planned ? `${Math.round((totals.expense / planned) * 100)}% of planned limits` : "No spending limits yet"} icon={PiTrendDownLight} tone="red" />
            <SummaryCard label="Saved" value={displayMoney(totals.savings, true)} note={totals.income ? `${Math.round((totals.savings / totals.income) * 100)}% of income` : "Start with your first deposit"} icon={PiPiggyBankLight} tone="blue" />
         </section>

         <section className={styles.dashboardGrid}>
            <article className={styles.panel}>
               <div className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Spending</p><h2>Where your money went</h2></div>
                  <span className={styles.panelTotal}>{displayMoney(totals.expense, true)}</span>
               </div>
               {expenseByCategory.length ? (
                  <div className={styles.breakdownList}>
                     {expenseByCategory.slice(0, 6).map((category) => (
                        <div key={category.id} className={styles.breakdownRow}>
                           <span className={styles.categoryGlyph} style={{ background: `${category.color}1A`, color: category.color }}>{CATEGORY_ICONS[category.icon] || "●"}</span>
                           <div className={styles.breakdownBody}>
                              <div><b>{category.name}</b><span>{displayMoney(category.total)}</span></div>
                              <div className={styles.progressTrack}><span style={{ width: `${(category.total / biggestExpense) * 100}%`, background: category.color }} /></div>
                           </div>
                        </div>
                     ))}
                  </div>
               ) : <EmptyState icon={PiChartDonutLight} title="Nothing spent yet" text="Your category breakdown will appear here." action={onAdd} actionLabel="Add expense" />}
            </article>

            <article className={styles.panel}>
               <div className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Activity</p><h2>Recent transactions</h2></div>
                  <button className={styles.textButton} onClick={onViewAll}>View all</button>
               </div>
               {transactions.length ? <TransactionList transactions={transactions} displayMoney={displayMoney} toUzs={toUzs} /> : <EmptyState icon={PiArrowsLeftRightLight} title="Your ledger is empty" text="Add income or an expense to begin." action={onAdd} actionLabel="Add transaction" />}
            </article>
         </section>
      </div>
   );
}

function TransactionList({
   transactions,
   displayMoney,
   toUzs,
   onDelete,
}: {
   transactions: FinanceTransaction[];
   displayMoney: (amount: number) => string;
   toUzs: (transaction: FinanceTransaction) => number;
   onDelete?: (id: string) => void;
}) {
   return (
      <div className={styles.transactionList}>
         {transactions.map((transaction) => {
            const meta = TYPE_META[transaction.entryType];
            return (
               <div key={transaction.id} className={styles.transactionRow}>
                  <span className={styles.categoryGlyph} style={{ background: `${transaction.categoryColor}1A`, color: transaction.categoryColor }}>{CATEGORY_ICONS[transaction.categoryIcon] || "●"}</span>
                  <div className={styles.transactionName}><b>{transaction.categoryName}</b><small>{transaction.note || meta.shortLabel} · {shortDate(transaction.entryDate)}</small></div>
                  <div className={`${styles.transactionAmount} ${styles[`amount_${transaction.entryType}`]}`}><b>{meta.sign}{displayMoney(toUzs(transaction))}</b>{transaction.currency === "USD" && <small>${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(transaction.amount)} original</small>}</div>
                  {onDelete && <button className={styles.iconButton} onClick={() => onDelete(transaction.id)} title="Delete transaction"><PiTrashLight /></button>}
               </div>
            );
         })}
      </div>
   );
}

function Transactions({
   transactions,
   filter,
   setFilter,
   displayMoney,
   toUzs,
   onAdd,
   onDelete,
}: {
   transactions: FinanceTransaction[];
   filter: FinanceEntryType | "all";
   setFilter: (filter: FinanceEntryType | "all") => void;
   displayMoney: (amount: number) => string;
   toUzs: (transaction: FinanceTransaction) => number;
   onAdd: () => void;
   onDelete: (id: string) => void;
}) {
   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Ledger" title="Transactions" description="Every movement, clearly organized and easy to scan." action={onAdd} actionLabel="New transaction" />
         <div className={styles.filterRow}>
            {(["all", "expense", "income", "savings"] as const).map((item) => <button key={item} className={filter === item ? styles.filterActive : ""} onClick={() => setFilter(item)}>{item === "all" ? "All" : TYPE_META[item].label}</button>)}
            <span>{transactions.length} {transactions.length === 1 ? "entry" : "entries"}</span>
         </div>
         <section className={styles.panel}>
            {transactions.length ? <TransactionList transactions={transactions} displayMoney={displayMoney} toUzs={toUzs} onDelete={onDelete} /> : <EmptyState icon={PiArrowsLeftRightLight} title="No matching transactions" text="Try another filter or add a new entry." action={onAdd} actionLabel="Add transaction" />}
         </section>
      </div>
   );
}

function Plans({
   budgets,
   categories,
   transactions,
   displayMoney,
   toUzs,
   planToUzs,
   onAdd,
   onDelete,
}: {
   budgets: Budget[];
   categories: Category[];
   transactions: FinanceTransaction[];
   displayMoney: (amount: number) => string;
   toUzs: (transaction: FinanceTransaction) => number;
   planToUzs: (budget: Budget) => number;
   onAdd: () => void;
   onDelete: (id: string) => void;
}) {
   const items = budgets.map((budget) => {
      const category = categories.find((item) => item.id === budget.categoryId);
      const actual = transactions
         .filter((transaction) => transaction.categoryId === budget.categoryId)
         .reduce((sum, transaction) => sum + toUzs(transaction), 0);
      const planned = planToUzs(budget);
      return { budget, category, actual, planned, progress: planned ? (actual / planned) * 100 : 0 };
   });

   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Intentional money" title="Plans & goals" description="Set limits for spending and monthly targets for saving." action={onAdd} actionLabel="Add a plan" />
         <div className={styles.planLegend}><span><i className={styles.limitDot} /> Expense limit</span><span><i className={styles.goalDot} /> Savings goal</span></div>
         {items.length ? (
            <section className={styles.planGrid}>
               {items.map(({ budget, category, actual, planned, progress }) => {
                  const isGoal = category?.entryType === "savings";
                  const visualProgress = Math.min(progress, 100);
                  return (
                     <article className={styles.planCard} key={budget.id}>
                        <div className={styles.planTop}>
                           <span className={styles.categoryGlyph} style={{ background: `${category?.color || "#657568"}1A`, color: category?.color || "#657568" }}>{CATEGORY_ICONS[category?.icon || "circle"]}</span>
                           <div><small>{isGoal ? "Savings goal" : "Spending limit"}</small><h2>{category?.name || "Category"}</h2></div>
                           <button className={styles.iconButton} onClick={() => onDelete(budget.id)} title="Remove plan"><PiTrashLight /></button>
                        </div>
                        <div className={styles.planNumbers}><strong>{displayMoney(actual)}</strong><span>of {displayMoney(planned)}</span></div>
                        <div className={styles.planTrack}><span style={{ width: `${visualProgress}%`, background: isGoal ? "#4E8297" : progress > 100 ? "#B85549" : "#4F8F67" }} /></div>
                        <p className={progress > 100 && !isGoal ? styles.overPlan : ""}>
                           {isGoal
                              ? progress >= 100 ? "Goal reached — nicely done." : `${Math.max(0, Math.round(100 - progress))}% left to reach your goal`
                              : progress > 100 ? `${displayMoney(actual - planned)} over the limit` : `${displayMoney(planned - actual)} left to spend`}
                        </p>
                     </article>
                  );
               })}
            </section>
         ) : (
            <section className={styles.panel}><EmptyState icon={PiChartDonutLight} title="Give your money a direction" text="Create an expense limit or a savings goal for this month." action={onAdd} actionLabel="Create first plan" /></section>
         )}
      </div>
   );
}

function Categories({
   categories,
   onAdd,
   onToggle,
}: {
   categories: Category[];
   onAdd: () => void;
   onToggle: (category: Category) => void;
}) {
   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Organization" title="Categories" description="Shape the labels that make your money easy to understand." action={onAdd} actionLabel="New category" />
         <div className={styles.categoryColumns}>
            {(["expense", "income", "savings"] as const).map((type) => {
               const meta = TYPE_META[type];
               const Icon = meta.icon;
               const items = categories.filter((category) => category.entryType === type);
               return (
                  <section className={styles.categoryGroup} key={type}>
                     <div className={styles.categoryGroupTitle}><span><Icon /></span><div><h2>{meta.label}</h2><small>{items.length} categories</small></div></div>
                     <div className={styles.categoryCards}>
                        {items.map((category) => (
                           <div className={`${styles.categoryCard} ${!category.active ? styles.inactive : ""}`} key={category.id}>
                              <span className={styles.categoryGlyph} style={{ background: `${category.color}1A`, color: category.color }}>{CATEGORY_ICONS[category.icon] || "●"}</span>
                              <b>{category.name}</b>
                              <button className={styles.iconButton} onClick={() => onToggle(category)} title={category.active ? "Archive category" : "Restore category"}><PiArchiveLight /></button>
                           </div>
                        ))}
                        {!items.length && <p className={styles.categoryEmpty}>No {meta.label.toLowerCase()} categories yet.</p>}
                     </div>
                  </section>
               );
            })}
         </div>
      </div>
   );
}

function EmptyState({
   icon: Icon,
   title,
   text,
   action,
   actionLabel,
}: {
   icon: IconType;
   title: string;
   text: string;
   action: () => void;
   actionLabel: string;
}) {
   return (
      <div className={styles.emptyState}>
         <span><Icon /></span><h3>{title}</h3><p>{text}</p>
         <button className={styles.textButton} onClick={action}><PiPlusLight /> {actionLabel}</button>
      </div>
   );
}

function ModalShell({ title, description, close, children }: { title: string; description: string; close: () => void; children: React.ReactNode }) {
   return (
      <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
         <section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}>
            <div className={styles.modalHeader}><div><h2>{title}</h2><p>{description}</p></div><button onClick={close} aria-label="Close"><PiXLight /></button></div>
            {children}
         </section>
      </div>
   );
}

function TypePicker({ value, onChange }: { value: FinanceEntryType; onChange: (value: FinanceEntryType) => void }) {
   return (
      <div className={styles.typePicker}>
         {(["expense", "income", "savings"] as const).map((type) => {
            const Icon = TYPE_META[type].icon;
            return <button type="button" key={type} className={value === type ? styles.typeActive : ""} onClick={() => onChange(type)}><Icon />{TYPE_META[type].shortLabel}</button>;
         })}
      </div>
   );
}

function TransactionModal({ categories, rate, request, close, refresh, showMessage }: {
   categories: Category[];
   rate: number;
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const [type, setType] = useState<FinanceEntryType>("expense");
   const [categoryId, setCategoryId] = useState("");
   const [amount, setAmount] = useState("");
   const [currency, setCurrency] = useState<FinanceCurrency>("UZS");
   const [date, setDate] = useState(getLocalDateString);
   const [note, setNote] = useState("");
   const [saving, setSaving] = useState(false);
   const options = categories.filter((category) => category.entryType === type && category.active);

   useEffect(() => {
      if (!options.some((category) => category.id === categoryId)) setCategoryId(options[0]?.id || "");
   }, [categoryId, options]);

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", { action: "transaction", categoryId, amount, currency, entryDate: date, note, exchangeRateToUzs: rate });
         close();
         await refresh();
      } catch (error) { showMessage(error instanceof Error ? error.message : "Could not save transaction."); }
      finally { setSaving(false); }
   };

   return (
      <ModalShell title="Add transaction" description="Record a movement in a few seconds." close={close}>
         <form onSubmit={submit} className={styles.form}>
            <TypePicker value={type} onChange={setType} />
            <label><span>Category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="">Choose a category</option>{options.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            {!options.length && <button type="button" className={styles.inlineNotice} disabled>Add a {TYPE_META[type].shortLabel.toLowerCase()} category first</button>}
            <div className={styles.amountField}><label><span>Amount</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required /></label><div className={styles.currencySelect}>{(["UZS", "USD"] as const).map((item) => <button type="button" key={item} className={currency === item ? styles.currencyActive : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div></div>
            {currency === "USD" && <p className={styles.rateHint}>Saved using 1 USD = {new Intl.NumberFormat("en-US").format(rate)} UZS</p>}
            <div className={styles.formGrid}><label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label><span>Note <em>optional</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="A short reminder" /></label></div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || !categoryId}>{saving ? "Saving…" : "Save transaction"}</button></div>
         </form>
      </ModalShell>
   );
}

function CategoryModal({ request, close, refresh, showMessage }: {
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const [type, setType] = useState<FinanceEntryType>("expense");
   const [name, setName] = useState("");
   const [color, setColor] = useState(COLORS[0]);
   const [icon, setIcon] = useState("circle");
   const [saving, setSaving] = useState(false);
   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try { setSaving(true); await request("POST", { action: "category", entryType: type, name, color, icon }); close(); await refresh(); }
      catch (error) { showMessage(error instanceof Error ? error.message : "Could not create category."); }
      finally { setSaving(false); }
   };
   return (
      <ModalShell title="New category" description="Create a label that feels natural to you." close={close}>
         <form onSubmit={submit} className={styles.form}>
            <TypePicker value={type} onChange={setType} />
            <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={type === "expense" ? "e.g. Groceries" : type === "income" ? "e.g. Salary" : "e.g. Emergency fund"} autoFocus required /></label>
            <fieldset><legend>Icon</legend><div className={styles.iconChoices}>{Object.entries(CATEGORY_ICONS).map(([key, glyph]) => <button type="button" key={key} className={icon === key ? styles.choiceActive : ""} onClick={() => setIcon(key)}>{glyph}</button>)}</div></fieldset>
            <fieldset><legend>Color</legend><div className={styles.colorChoices}>{COLORS.map((item) => <button type="button" key={item} className={color === item ? styles.choiceActive : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Choose ${item}`} />)}</div></fieldset>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving}>{saving ? "Creating…" : "Create category"}</button></div>
         </form>
      </ModalShell>
   );
}

function BudgetModal({ categories, month, request, close, refresh, showMessage }: {
   categories: Category[];
   month: string;
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const options = categories.filter((category) => category.active && category.entryType !== "income");
   const [categoryId, setCategoryId] = useState(options[0]?.id || "");
   const [amount, setAmount] = useState("");
   const [currency, setCurrency] = useState<FinanceCurrency>("UZS");
   const [saving, setSaving] = useState(false);
   const selected = options.find((category) => category.id === categoryId);
   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try { setSaving(true); await request("POST", { action: "budget", categoryId, amount, currency, monthStart: `${month}-01` }); close(); await refresh(); }
      catch (error) { showMessage(error instanceof Error ? error.message : "Could not save plan."); }
      finally { setSaving(false); }
   };
   return (
      <ModalShell title="Create a plan" description={`Set an intention for ${monthLabel(month)}.`} close={close}>
         <form onSubmit={submit} className={styles.form}>
            <label><span>Category</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required><option value="">Choose a category</option>{options.map((category) => <option key={category.id} value={category.id}>{category.entryType === "savings" ? "Goal · " : "Limit · "}{category.name}</option>)}</select></label>
            <p className={styles.planExplanation}>{selected?.entryType === "savings" ? "This is the amount you want to save this month." : "This is the most you plan to spend this month."}</p>
            <div className={styles.amountField}><label><span>Planned amount</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required /></label><div className={styles.currencySelect}>{(["UZS", "USD"] as const).map((item) => <button type="button" key={item} className={currency === item ? styles.currencyActive : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div></div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || !categoryId}>{saving ? "Saving…" : "Save plan"}</button></div>
         </form>
      </ModalShell>
   );
}
