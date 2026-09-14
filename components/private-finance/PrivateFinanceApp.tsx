"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiArchiveLight,
   PiAirplaneLight,
   PiArrowsLeftRightLight,
   PiBankLight,
   PiBowlFoodLight,
   PiCalendarBlankLight,
   PiCaretLeftLight,
   PiCaretRightLight,
   PiChartDonutLight,
   PiCircleLight,
   PiCoinsLight,
   PiCreditCardLight,
   PiGiftLight,
   PiGraduationCapLight,
   PiHeartLight,
   PiHouseLineLight,
   PiHouseLight,
   PiLockKeyLight,
   PiMoneyLight,
   PiPiggyBankLight,
   PiPencilSimpleLight,
   PiPlusLight,
   PiSignOutLight,
   PiShoppingBagLight,
   PiStethoscopeLight,
   PiTagLight,
   PiTShirtLight,
   PiTrashLight,
   PiTrendDownLight,
   PiTrendUpLight,
   PiWifiHighLight,
   PiWalletLight,
   PiXLight,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { getLocalDateString } from "@/lib/localDate";
import { supabase } from "@/lib/supabaseClient";
import type {
   FinanceAccountType,
   FinanceCurrency,
   FinanceDebtDirection,
   FinanceEntryType,
} from "@/lib/privateFinance";
import styles from "./private-finance.module.css";

type Category = {
   id: string;
   parentCategoryId: string | null;
   name: string;
   entryType: FinanceEntryType;
   color: string;
   icon: string;
   active: boolean;
};

type FinanceTransaction = {
   id: string;
   accountId: string | null;
   accountName: string;
   categoryId: string;
   categoryName: string;
   categoryColor: string;
   categoryIcon: string;
   parentCategoryId: string | null;
   parentCategoryName: string | null;
   entryType: FinanceEntryType;
   amount: number;
   currency: FinanceCurrency;
   exchangeRateToUzs: number;
   entryDate: string;
   note: string | null;
};

type Account = {
   id: string;
   name: string;
   accountType: FinanceAccountType;
   currency: FinanceCurrency;
   openingBalance: number;
   balance: number;
   color: string;
   active: boolean;
};

type Transfer = {
   id: string;
   fromAccountId: string;
   fromAccountName: string;
   toAccountId: string;
   toAccountName: string;
   fromAmount: number;
   toAmount: number;
   fromCurrency: FinanceCurrency;
   toCurrency: FinanceCurrency;
   transferDate: string;
   note: string | null;
};

type Budget = {
   id: string;
   categoryId: string;
   monthStart: string;
   amount: number;
   currency: FinanceCurrency;
};

type Debt = {
   id: string;
   personName: string;
   direction: FinanceDebtDirection;
   accountId: string;
   accountName: string;
   principalAmount: number;
   remainingAmount: number;
   currency: FinanceCurrency;
   issuedOn: string;
   dueOn: string | null;
   note: string | null;
};

type DebtPayment = {
   id: string;
   debtId: string;
   accountId: string;
   accountName: string;
   amount: number;
   paymentDate: string;
   note: string | null;
};

type ExchangeRate = {
   rate: number;
   date: string | null;
   change: number;
   source: string;
} | null;

type FinancePayload = {
   user: { id: string; email: string | null };
   accounts: Account[];
   categories: Category[];
   transactions: FinanceTransaction[];
   transfers: Transfer[];
   budgets: Budget[];
   debts: Debt[];
   debtPayments: DebtPayment[];
   exchangeRate: ExchangeRate;
};

type View = "overview" | "accounts" | "transactions" | "debts" | "plans" | "categories";
type Modal = "transaction" | "transfer" | "account" | "category" | "budget" | "debt" | "debt-payment" | "debt-history" | null;
type AccessState = "loading" | "ready" | "signed-out" | "denied" | "error";
const TYPE_META: Record<
   FinanceEntryType,
   { label: string; shortLabel: string; icon: IconType; sign: string }
> = {
   expense: { label: "Expenses", shortLabel: "Expense", icon: PiTrendDownLight, sign: "−" },
   income: { label: "Income", shortLabel: "Income", icon: PiTrendUpLight, sign: "+" },
   savings: { label: "Savings", shortLabel: "Saving", icon: PiPiggyBankLight, sign: "↗" },
};

const CATEGORY_ICONS: Record<string, IconType> = {
   circle: PiCircleLight,
   home: PiHouseLight,
   food: PiBowlFoodLight,
   transport: PiArrowsLeftRightLight,
   health: PiHeartLight,
   shopping: PiShoppingBagLight,
   salary: PiMoneyLight,
   gift: PiGiftLight,
   education: PiGraduationCapLight,
   travel: PiAirplaneLight,
   emergency: PiStethoscopeLight,
   goal: PiPiggyBankLight,
   connectivity: PiWifiHighLight,
   appearance: PiTShirtLight,
   debt: PiCreditCardLight,
   bank: PiBankLight,
   cash: PiCoinsLight,
};

function CategoryIcon({ icon }: { icon: string }) {
   const Icon = CATEGORY_ICONS[icon] || PiCircleLight;
   return <Icon aria-hidden="true" />;
}

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

const ACCOUNT_META: Record<FinanceAccountType, { label: string; glyph: string }> = {
   cash: { label: "Cash", glyph: "◫" },
   bank_card: { label: "Bank card", glyph: "▰" },
   savings: { label: "Savings account", glyph: "◎" },
   person: { label: "Person wallet", glyph: "☺" },
   other: { label: "Other", glyph: "◇" },
};

const NAV_ITEMS: Array<{ id: View; label: string; icon: IconType }> = [
   { id: "overview", label: "Overview", icon: PiHouseLineLight },
   { id: "accounts", label: "Accounts", icon: PiWalletLight },
   { id: "transactions", label: "Transactions", icon: PiArrowsLeftRightLight },
   { id: "debts", label: "Debts", icon: PiCoinsLight },
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

function nativeMoney(amount: number, currency: FinanceCurrency) {
   const formatted = new Intl.NumberFormat("en-US", {
      maximumFractionDigits: currency === "USD" ? 2 : 0,
   }).format(amount);
   return currency === "USD" ? `$${formatted}` : `${formatted} UZS`;
}

function initials(email: string | null) {
   return (email?.split("@")[0]?.slice(0, 2) || "ME").toUpperCase();
}

export default function PrivateFinanceApp() {
   const [access, setAccess] = useState<AccessState>("loading");
   const [payload, setPayload] = useState<FinancePayload | null>(null);
   const [view, setView] = useState<View>("overview");
   const [modal, setModal] = useState<Modal>(null);
   const [categoryParent, setCategoryParent] = useState<Category | null>(null);
   const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
   const [debtDirection, setDebtDirection] = useState<FinanceDebtDirection>("receivable");
   const [debtToPay, setDebtToPay] = useState<Debt | null>(null);
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
      const available = (payload?.accounts || []).reduce((sum, account) => {
         if (account.accountType !== "cash" && account.accountType !== "bank_card") {
            return sum;
         }
         const balanceInUzs =
            account.balance * (account.currency === "USD" ? rate : 1);
         return sum + balanceInUzs;
      }, 0);
      return { ...result, available };
   }, [payload?.accounts, payload?.transactions, rate, toUzs]);

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
                  <button className={styles.transferButton} onClick={() => setModal("transfer")}><PiArrowsLeftRightLight /> Transfer</button>
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
                  accounts={payload.accounts}
                  transactions={payload.transactions}
                  categories={payload.categories}
                  budgets={payload.budgets}
                  displayMoney={displayMoney}
                  toUzs={toUzs}
                  planToUzs={planToUzs}
                  onAdd={() => setModal("transaction")}
                  onTransfer={() => setModal("transfer")}
                  onViewAccounts={() => setView("accounts")}
                  onViewAll={() => setView("transactions")}
               />
            )}
            {view === "accounts" && (
               <Accounts
                  accounts={payload.accounts}
                  transfers={payload.transfers}
                  rate={rate}
                  onAdd={() => setModal("account")}
                  onTransfer={() => setModal("transfer")}
                  onToggle={async (account) => {
                     try {
                        await request("PATCH", { action: "account", ...account, active: !account.active });
                        await loadData();
                     } catch (error) { setMessage(error instanceof Error ? error.message : "Update failed."); }
                  }}
                  onDeleteTransfer={async (id) => {
                     if (!window.confirm("Delete this transfer?")) return;
                     try { await request("DELETE", { action: "transfer", id }); await loadData(); }
                     catch (error) { setMessage(error instanceof Error ? error.message : "Delete failed."); }
                  }}
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
            {view === "debts" && (
               <Debts
                  debts={payload.debts}
                  payments={payload.debtPayments}
                  onCreate={(direction) => {
                     setDebtDirection(direction);
                     setModal("debt");
                  }}
                  onPay={(debt) => {
                     setDebtToPay(debt);
                     setModal("debt-payment");
                  }}
                  onViewHistory={() => setModal("debt-history")}
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
                  onAdd={() => {
                     setCategoryParent(null);
                     setCategoryToEdit(null);
                     setModal("category");
                  }}
                  onAddSubcategory={(parent) => {
                     setCategoryParent(parent);
                     setCategoryToEdit(null);
                     setModal("category");
                  }}
                  onEdit={(category) => {
                     setCategoryParent(
                        category.parentCategoryId
                           ? payload.categories.find((item) => item.id === category.parentCategoryId) || null
                           : null,
                     );
                     setCategoryToEdit(category);
                     setModal("category");
                  }}
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
               accounts={payload.accounts}
               categories={payload.categories}
               rate={rate}
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "transfer" && (
            <TransferModal
               accounts={payload.accounts}
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "account" && (
            <AccountModal
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "category" && (
            <CategoryModal
               parentCategory={categoryParent}
               categoryToEdit={categoryToEdit}
               request={request}
               close={() => {
                  setModal(null);
                  setCategoryParent(null);
                  setCategoryToEdit(null);
               }}
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
         {modal === "debt" && (
            <DebtModal
               direction={debtDirection}
               accounts={payload.accounts}
               request={request}
               close={() => setModal(null)}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "debt-payment" && debtToPay && (
            <DebtPaymentModal
               debt={debtToPay}
               accounts={payload.accounts}
               request={request}
               close={() => {
                  setModal(null);
                  setDebtToPay(null);
               }}
               refresh={loadData}
               showMessage={setMessage}
            />
         )}
         {modal === "debt-history" && (
            <DebtHistoryModal
               debts={payload.debts}
               payments={payload.debtPayments}
               close={() => setModal(null)}
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

function AccountStrip({
   accounts,
   onTransfer,
   onViewAll,
}: {
   accounts: Account[];
   onTransfer: () => void;
   onViewAll: () => void;
}) {
   const active = accounts.filter((account) => account.active);
   if (!active.length) return null;

   return (
      <section className={styles.accountStrip}>
         <div className={styles.accountStripHeading}>
            <span>Accounts</span>
            <div>
               {active.length > 1 && <button className={styles.textButton} onClick={onTransfer}><PiArrowsLeftRightLight /> Transfer</button>}
               <button className={styles.textButton} onClick={onViewAll}>Manage</button>
            </div>
         </div>
         <div className={styles.accountStripCards}>
            {active.slice(0, 4).map((account) => (
               <button key={account.id} className={styles.miniAccount} onClick={onViewAll}>
                  <i style={{ background: account.color }}>{ACCOUNT_META[account.accountType].glyph}</i>
                  <span><small>{account.name}</small><b>{nativeMoney(account.balance, account.currency)}</b></span>
               </button>
            ))}
         </div>
      </section>
   );
}

function Accounts({
   accounts,
   transfers,
   rate,
   onAdd,
   onTransfer,
   onToggle,
   onDeleteTransfer,
}: {
   accounts: Account[];
   transfers: Transfer[];
   rate: number;
   onAdd: () => void;
   onTransfer: () => void;
   onToggle: (account: Account) => void;
   onDeleteTransfer: (id: string) => void;
}) {
   const activeAccounts = accounts.filter((account) => account.active);
   const totalUzs = activeAccounts.reduce(
      (sum, account) => sum + account.balance * (account.currency === "USD" ? rate : 1),
      0,
   );

   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Your money locations" title="Accounts & wallets" description="See where your money lives, including cash, cards, savings, and family wallets." action={onAdd} actionLabel="New account" />
         <div className={styles.accountsToolbar}>
            <div><small>Total across active accounts</small><strong>{nativeMoney(totalUzs, "UZS")}</strong></div>
            <button className={styles.primaryButton} onClick={onTransfer} disabled={activeAccounts.length < 2}><PiArrowsLeftRightLight /> Move money</button>
         </div>

         {accounts.length ? (
            <section className={styles.accountsGrid}>
               {accounts.map((account) => (
                  <article className={`${styles.accountCard} ${!account.active ? styles.inactive : ""}`} key={account.id}>
                     <div className={styles.accountCardTop}>
                        <span style={{ background: account.color }}>{ACCOUNT_META[account.accountType].glyph}</span>
                        <button className={styles.iconButton} onClick={() => onToggle(account)} title={account.active ? "Archive account" : "Restore account"}><PiArchiveLight /></button>
                     </div>
                     <small>{ACCOUNT_META[account.accountType].label} · {account.currency}</small>
                     <h2>{account.name}</h2>
                     <strong>{nativeMoney(account.balance, account.currency)}</strong>
                     <p>Opening balance: {nativeMoney(account.openingBalance, account.currency)}</p>
                  </article>
               ))}
            </section>
         ) : (
            <section className={styles.panel}><EmptyState icon={PiWalletLight} title="Add where your money lives" text="Start with cash, a bank card, or a wallet for your wife." action={onAdd} actionLabel="Create first account" /></section>
         )}

         <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Money movement</p><h2>Transfers this month</h2></div></div>
            {transfers.length ? (
               <div className={styles.transactionList}>
                  {transfers.map((transfer) => (
                     <div className={styles.transferRow} key={transfer.id}>
                        <span className={styles.transferGlyph}><PiArrowsLeftRightLight /></span>
                        <div className={styles.transactionName}><b>{transfer.fromAccountName} → {transfer.toAccountName}</b><small>{transfer.note || "Transfer"} · {shortDate(transfer.transferDate)}</small></div>
                        <div className={styles.transactionAmount}><b>{nativeMoney(transfer.fromAmount, transfer.fromCurrency)}</b>{transfer.fromCurrency !== transfer.toCurrency && <small>Received {nativeMoney(transfer.toAmount, transfer.toCurrency)}</small>}</div>
                        <button className={styles.iconButton} onClick={() => onDeleteTransfer(transfer.id)} title="Delete transfer"><PiTrashLight /></button>
                     </div>
                  ))}
               </div>
            ) : <EmptyState icon={PiArrowsLeftRightLight} title="No transfers this month" text="Moving money between accounts will appear here." action={activeAccounts.length < 2 ? onAdd : onTransfer} actionLabel={activeAccounts.length < 2 ? "Add another account" : "Make a transfer"} />}
         </section>
      </div>
   );
}

function Debts({
   debts,
   payments,
   onCreate,
   onPay,
   onViewHistory,
}: {
   debts: Debt[];
   payments: DebtPayment[];
   onCreate: (direction: FinanceDebtDirection) => void;
   onPay: (debt: Debt) => void;
   onViewHistory: () => void;
}) {
   const receivables = debts.filter(
      (debt) => debt.direction === "receivable" && debt.remainingAmount > 0.005,
   );
   const payables = debts.filter(
      (debt) => debt.direction === "payable" && debt.remainingAmount > 0.005,
   );
   const totalByCurrency = (items: Debt[]) =>
      (["UZS", "USD"] as const)
         .map((currency) => ({
            currency,
            total: items
               .filter((debt) => debt.currency === currency)
               .reduce((sum, debt) => sum + debt.remainingAmount, 0),
         }))
         .filter((item) => item.total > 0)
         .map((item) => nativeMoney(item.total, item.currency))
         .join(" · ") || "0 UZS";

   const debtList = (items: Debt[], direction: FinanceDebtDirection) => (
      items.length ? (
         <div className={styles.debtList}>
            {items.map((debt) => {
               const debtPayments = payments.filter((payment) => payment.debtId === debt.id);
               const settled = debt.remainingAmount <= 0.005;
               return (
                  <article className={styles.debtCard} key={debt.id}>
                     <div className={styles.debtCardTop}>
                        <div><small>{settled ? "Settled" : direction === "receivable" ? "Owes you" : "You owe"}</small><h3>{debt.personName}</h3></div>
                        <strong>{nativeMoney(debt.remainingAmount, debt.currency)}</strong>
                     </div>
                     <p>{nativeMoney(debt.principalAmount, debt.currency)} {direction === "receivable" ? "lent from" : "borrowed into"} {debt.accountName} · {shortDate(debt.issuedOn)}</p>
                     {debt.dueOn && <p className={styles.debtDue}>Due {shortDate(debt.dueOn)}</p>}
                     {debt.note && <p className={styles.debtNote}>{debt.note}</p>}
                     {debtPayments.length > 0 && <small className={styles.debtPaymentHint}>{debtPayments.length} payment{debtPayments.length === 1 ? "" : "s"} recorded</small>}
                     {!settled && <button className={styles.secondaryButton} onClick={() => onPay(debt)}>{direction === "receivable" ? "Receive repayment" : "Repay debt"}</button>}
                  </article>
               );
            })}
         </div>
      ) : (
         <p className={styles.categoryEmpty}>No {direction === "receivable" ? "money owed to you" : "debts you owe"} yet.</p>
      )
   );

   return (
      <div className={styles.content}>
         <PageHeading eyebrow="Debt ledger" title="Debts" description="Debt movements change account balances but never count as income or expenses." action={() => onCreate("receivable")} actionLabel="Lend money" />
         <div className={styles.debtActions}>
            <button className={styles.secondaryButton} onClick={() => onCreate("payable")}>Borrow money</button>
         </div>
         <section className={styles.debtSummaryGrid}>
            <article className={styles.debtSummary}><small>Owed to you</small><strong>{totalByCurrency(receivables)}</strong><p>Money you have lent out</p></article>
            <article className={styles.debtSummary}><small>You owe</small><strong>{totalByCurrency(payables)}</strong><p>Money you borrowed</p></article>
         </section>
         <div className={styles.debtColumns}>
            <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Receivables</p><h2>People who owe you</h2></div></div>{debtList(receivables, "receivable")}</section>
            <section className={styles.panel}><div className={styles.panelHeader}><div><p className={styles.eyebrow}>Payables</p><h2>Debts you owe</h2></div></div>{debtList(payables, "payable")}</section>
         </div>
         <div className={styles.debtHistoryAction}><button className={styles.textButton} onClick={onViewHistory}><PiArchiveLight /> Debt history</button></div>
      </div>
   );
}

function Overview({
   totals,
   accounts,
   transactions,
   categories,
   budgets,
   displayMoney,
   toUzs,
   planToUzs,
   onAdd,
   onTransfer,
   onViewAccounts,
   onViewAll,
}: {
   totals: { expense: number; income: number; savings: number; available: number };
   accounts: Account[];
   transactions: FinanceTransaction[];
   categories: Category[];
   budgets: Budget[];
   displayMoney: (amount: number, compact?: boolean) => string;
   toUzs: (transaction: FinanceTransaction) => number;
   planToUzs: (budget: Budget) => number;
   onAdd: () => void;
   onTransfer: () => void;
   onViewAccounts: () => void;
   onViewAll: () => void;
}) {
   const expenseByCategory = categories
      .filter(
         (category) =>
            category.entryType === "expense" && category.parentCategoryId === null,
      )
      .map((category) => ({
         ...category,
         total: transactions
            .filter(
               (transaction) =>
                  transaction.categoryId === category.id ||
                  transaction.parentCategoryId === category.id,
            )
            .reduce((sum, transaction) => sum + toUzs(transaction), 0),
      }))
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total);
   const biggestExpense = Math.max(...expenseByCategory.map((item) => item.total), 1);
   const incomeByCategory = categories
      .filter(
         (category) =>
            category.entryType === "income" && category.parentCategoryId === null,
      )
      .map((category) => ({
         ...category,
         total: transactions
            .filter(
               (transaction) =>
                  transaction.categoryId === category.id ||
                  transaction.parentCategoryId === category.id,
            )
            .reduce((sum, transaction) => sum + toUzs(transaction), 0),
      }))
      .filter((category) => category.total > 0)
      .sort((a, b) => b.total - a.total);
   const biggestIncome = Math.max(...incomeByCategory.map((item) => item.total), 1);
   const planned = budgets
      .filter((budget) => categories.find((category) => category.id === budget.categoryId)?.entryType === "expense")
      .reduce((sum, budget) => sum + planToUzs(budget), 0);

      return (
      <div className={styles.content}>
         <AccountStrip accounts={accounts} onTransfer={onTransfer} onViewAll={onViewAccounts} />
         <section className={styles.summaryGrid}>
            <SummaryCard label="Available" value={displayMoney(totals.available)} note="Cash and bank card balances" icon={PiWalletLight} tone="ink" />
            <SummaryCard label="Income" value={displayMoney(totals.income)} note="Received this month" icon={PiTrendUpLight} tone="green" />
            <SummaryCard label="Expenses" value={displayMoney(totals.expense)} note={planned ? `${Math.round((totals.expense / planned) * 100)}% of planned limits` : "No spending limits yet"} icon={PiTrendDownLight} tone="red" />
            <SummaryCard label="Saved" value={displayMoney(totals.savings)} note={totals.income ? `${Math.round((totals.savings / totals.income) * 100)}% of income` : "Start with your first deposit"} icon={PiPiggyBankLight} tone="blue" />
         </section>

         <section className={styles.dashboardGrid}>
            <div className={styles.breakdownColumn}>
               <article className={styles.panel}>
                  <div className={styles.panelHeader}>
                     <div><p className={styles.eyebrow}>Spending</p><h2>Where your money went</h2></div>
                     <span className={styles.panelTotal}>{displayMoney(totals.expense)}</span>
                  </div>
                  {expenseByCategory.length ? (
                     <div className={styles.breakdownList}>
                        {expenseByCategory.slice(0, 6).map((category) => (
                           <div key={category.id} className={styles.breakdownRow}>
                              <span className={styles.categoryGlyph} style={{ background: `${category.color}1A`, color: category.color }}><CategoryIcon icon={category.icon} /></span>
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
                     <div><p className={styles.eyebrow}>Income</p><h2>Where your money came from</h2></div>
                     <span className={styles.panelTotal}>{displayMoney(totals.income)}</span>
                  </div>
                  {incomeByCategory.length ? (
                     <div className={styles.breakdownList}>
                        {incomeByCategory.slice(0, 6).map((category) => (
                           <div key={category.id} className={styles.breakdownRow}>
                              <span className={styles.categoryGlyph} style={{ background: `${category.color}1A`, color: category.color }}><CategoryIcon icon={category.icon} /></span>
                              <div className={styles.breakdownBody}>
                                 <div><b>{category.name}</b><span>{displayMoney(category.total)}</span></div>
                                 <div className={styles.progressTrack}><span style={{ width: `${(category.total / biggestIncome) * 100}%`, background: category.color }} /></div>
                              </div>
                           </div>
                        ))}
                     </div>
                  ) : <EmptyState icon={PiTrendUpLight} title="No income yet" text="Income sources will appear here." action={onAdd} actionLabel="Add income" />}
               </article>
            </div>

            <article className={styles.panel}>
               <div className={styles.panelHeader}>
                  <div><p className={styles.eyebrow}>Activity</p><h2>Recent transactions</h2></div>
                  <button className={styles.textButton} onClick={onViewAll}>View all</button>
               </div>
               {transactions.length ? <TransactionList transactions={transactions.slice(0, 6)} displayMoney={displayMoney} toUzs={toUzs} /> : <EmptyState icon={PiArrowsLeftRightLight} title="Your ledger is empty" text="Add income or an expense to begin." action={onAdd} actionLabel="Add transaction" />}
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
                  <span className={styles.categoryGlyph} style={{ background: `${transaction.categoryColor}1A`, color: transaction.categoryColor }}><CategoryIcon icon={transaction.categoryIcon} /></span>
                  <div className={styles.transactionName}><b>{transaction.parentCategoryName ? `${transaction.parentCategoryName} · ${transaction.categoryName}` : transaction.categoryName}</b><small>{transaction.accountName} · {transaction.note || meta.shortLabel} · {shortDate(transaction.entryDate)}</small></div>
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
         .filter(
            (transaction) =>
               transaction.categoryId === budget.categoryId ||
               transaction.parentCategoryId === budget.categoryId,
         )
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
                           <span className={styles.categoryGlyph} style={{ background: `${category?.color || "#657568"}1A`, color: category?.color || "#657568" }}><CategoryIcon icon={category?.icon || "circle"} /></span>
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
   onAddSubcategory,
   onEdit,
   onToggle,
}: {
   categories: Category[];
   onAdd: () => void;
   onAddSubcategory: (parent: Category) => void;
   onEdit: (category: Category) => void;
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
               const parents = items.filter((category) => category.parentCategoryId === null);
               return (
                  <section className={styles.categoryGroup} key={type}>
                     <div className={styles.categoryGroupTitle}><span><Icon /></span><div><h2>{meta.label}</h2><small>{parents.length} categories · {items.length - parents.length} subcategories</small></div></div>
                     <div className={styles.categoryCards}>
                        {parents.map((category) => {
                           const children = items.filter((item) => item.parentCategoryId === category.id);
                           return (
                              <div className={styles.categoryTree} key={category.id}>
                                 <div className={`${styles.categoryCard} ${!category.active ? styles.inactive : ""}`}>
                                    <span className={styles.categoryGlyph} style={{ background: `${category.color}1A`, color: category.color }}><CategoryIcon icon={category.icon} /></span>
                                    <b>{category.name}</b>
                                    <button className={styles.addSubcategoryButton} onClick={() => onAddSubcategory(category)} disabled={!category.active} title={category.active ? "Add subcategory" : "Restore this category first"}><PiPlusLight /></button>
                                    <button className={styles.iconButton} onClick={() => onEdit(category)} title="Edit category"><PiPencilSimpleLight /></button>
                                    <button className={styles.iconButton} onClick={() => onToggle(category)} title={category.active ? "Archive category" : "Restore category"}><PiArchiveLight /></button>
                                 </div>
                                 {children.map((child) => (
                                    <div className={`${styles.childCategoryCard} ${!child.active ? styles.inactive : ""}`} key={child.id}>
                                       <span className={styles.childLine} />
                                       <span className={styles.categoryGlyph} style={{ background: `${child.color}1A`, color: child.color }}><CategoryIcon icon={child.icon} /></span>
                                       <b>{child.name}</b>
                                       <button className={styles.iconButton} onClick={() => onEdit(child)} title="Edit subcategory"><PiPencilSimpleLight /></button>
                                       <button className={styles.iconButton} onClick={() => onToggle(child)} title={child.active ? "Archive subcategory" : "Restore subcategory"}><PiArchiveLight /></button>
                                    </div>
                                 ))}
                              </div>
                           );
                        })}
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

function TransactionModal({ accounts, categories, rate, request, close, refresh, showMessage }: {
   accounts: Account[];
   categories: Category[];
   rate: number;
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const [type, setType] = useState<FinanceEntryType>("expense");
   const accountOptions = accounts.filter((account) => account.active);
   const [accountId, setAccountId] = useState(accountOptions[0]?.id || "");
   const [parentCategoryId, setParentCategoryId] = useState("");
   const [subcategoryId, setSubcategoryId] = useState("");
   const [amount, setAmount] = useState("");
   const [date, setDate] = useState(getLocalDateString);
   const [note, setNote] = useState("");
   const [saving, setSaving] = useState(false);
   const parentOptions = categories.filter(
      (category) =>
         category.entryType === type &&
         category.active &&
         category.parentCategoryId === null,
   );
   const subcategoryOptions = categories.filter(
      (category) =>
         category.entryType === type &&
         category.active &&
         category.parentCategoryId === parentCategoryId,
   );
   const selectedAccount = accountOptions.find((account) => account.id === accountId);
   const categoryId = subcategoryId || parentCategoryId;

   useEffect(() => {
      if (!parentOptions.some((category) => category.id === parentCategoryId)) {
         setParentCategoryId(parentOptions[0]?.id || "");
      }
   }, [parentCategoryId, parentOptions]);

   useEffect(() => {
      if (!subcategoryOptions.some((category) => category.id === subcategoryId)) {
         setSubcategoryId("");
      }
   }, [subcategoryId, subcategoryOptions]);

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", { action: "transaction", accountId, categoryId, amount, entryDate: date, note, exchangeRateToUzs: rate });
         close();
         await refresh();
      } catch (error) { showMessage(error instanceof Error ? error.message : "Could not save transaction."); }
      finally { setSaving(false); }
   };

   return (
      <ModalShell title="Add transaction" description="Record a movement in a few seconds." close={close}>
         <form onSubmit={submit} className={styles.form}>
            <TypePicker value={type} onChange={setType} />
            <label><span>Account</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Choose an account</option>{accountOptions.map((account) => <option value={account.id} key={account.id}>{account.name} · {account.currency} · {nativeMoney(account.balance, account.currency)}</option>)}</select></label>
            {!accountOptions.length && <button type="button" className={styles.inlineNotice} disabled>Create an account before adding transactions</button>}
            <label><span>Category</span><select value={parentCategoryId} onChange={(event) => setParentCategoryId(event.target.value)} required><option value="">Choose a category</option>{parentOptions.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
            {!parentOptions.length && <button type="button" className={styles.inlineNotice} disabled>Add a {TYPE_META[type].shortLabel.toLowerCase()} category first</button>}
            {subcategoryOptions.length > 0 && <label><span>Subcategory <em>optional</em></span><select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)}><option value="">No subcategory</option>{subcategoryOptions.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>}
            <div className={styles.amountField}><label><span>Amount</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required /></label><div className={styles.amountCurrency}>{selectedAccount?.currency || "—"}</div></div>
            {selectedAccount?.currency === "USD" && <p className={styles.rateHint}>Saved using 1 USD = {new Intl.NumberFormat("en-US").format(rate)} UZS</p>}
            <div className={styles.formGrid}><label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label><span>Note <em>optional</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="A short reminder" /></label></div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || !accountId || !categoryId}>{saving ? "Saving…" : "Save transaction"}</button></div>
         </form>
      </ModalShell>
   );
}

function AccountModal({ request, close, refresh, showMessage }: {
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const [name, setName] = useState("");
   const [accountType, setAccountType] = useState<FinanceAccountType>("cash");
   const [currency, setCurrency] = useState<FinanceCurrency>("UZS");
   const [openingBalance, setOpeningBalance] = useState("0");
   const [color, setColor] = useState(COLORS[4]);
   const [saving, setSaving] = useState(false);

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", { action: "account", name, accountType, currency, openingBalance, color });
         close();
         await refresh();
      } catch (error) {
         showMessage(error instanceof Error ? error.message : "Could not create account.");
      } finally {
         setSaving(false);
      }
   };

   return (
      <ModalShell title="New account" description="Add a place or person that can hold money." close={close}>
         <form onSubmit={submit} className={styles.form}>
            <label><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={accountType === "person" ? "e.g. Wife's wallet" : "e.g. Cash or Visa card"} autoFocus required /></label>
            <label><span>Account type</span><select value={accountType} onChange={(event) => setAccountType(event.target.value as FinanceAccountType)}>{(Object.entries(ACCOUNT_META) as Array<[FinanceAccountType, { label: string; glyph: string }]>).map(([type, meta]) => <option value={type} key={type}>{meta.label}</option>)}</select></label>
            {accountType === "person" && <p className={styles.planExplanation}>Use this for money held and spent by your wife or another family member.</p>}
            <fieldset><legend>Currency</legend><div className={styles.typePicker}>{(["UZS", "USD"] as const).map((item) => <button type="button" key={item} className={currency === item ? styles.typeActive : ""} onClick={() => setCurrency(item)}>{item}</button>)}</div></fieldset>
            <label><span>Current opening balance</span><input type="number" step="0.01" inputMode="decimal" value={openingBalance} onChange={(event) => setOpeningBalance(event.target.value)} required /></label>
            <fieldset><legend>Color</legend><div className={styles.colorChoices}>{COLORS.map((item) => <button type="button" key={item} className={color === item ? styles.choiceActive : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Choose ${item}`} />)}</div></fieldset>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving}>{saving ? "Creating…" : "Create account"}</button></div>
         </form>
      </ModalShell>
   );
}

function TransferModal({ accounts, request, close, refresh, showMessage }: {
   accounts: Account[];
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const options = accounts.filter((account) => account.active);
   const [fromAccountId, setFromAccountId] = useState(options[0]?.id || "");
   const [toAccountId, setToAccountId] = useState(options[1]?.id || "");
   const [fromAmount, setFromAmount] = useState("");
   const [toAmount, setToAmount] = useState("");
   const [date, setDate] = useState(getLocalDateString);
   const [note, setNote] = useState("");
   const [saving, setSaving] = useState(false);
   const fromAccount = options.find((account) => account.id === fromAccountId);
   const toAccount = options.find((account) => account.id === toAccountId);
   const isCrossCurrency =
      Boolean(fromAccount && toAccount) && fromAccount?.currency !== toAccount?.currency;

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", {
            action: "transfer",
            fromAccountId,
            toAccountId,
            fromAmount,
            toAmount: isCrossCurrency ? toAmount : fromAmount,
            transferDate: date,
            note,
         });
         close();
         await refresh();
      } catch (error) {
         showMessage(error instanceof Error ? error.message : "Could not save transfer.");
      } finally {
         setSaving(false);
      }
   };

   return (
      <ModalShell title="Move money" description="Transfers change account balances, not your income or expenses." close={close}>
         <form onSubmit={submit} className={styles.form}>
            {options.length < 2 && <div className={styles.inlineNotice}>Create at least two active accounts before making a transfer.</div>}
            <div className={styles.transferAccounts}>
               <label><span>From</span><select value={fromAccountId} onChange={(event) => setFromAccountId(event.target.value)} required><option value="">Choose account</option>{options.map((account) => <option value={account.id} key={account.id} disabled={account.id === toAccountId}>{account.name} · {account.currency} · {nativeMoney(account.balance, account.currency)}</option>)}</select></label>
               <span><PiArrowsLeftRightLight /></span>
               <label><span>To</span><select value={toAccountId} onChange={(event) => setToAccountId(event.target.value)} required><option value="">Choose account</option>{options.map((account) => <option value={account.id} key={account.id} disabled={account.id === fromAccountId}>{account.name} · {account.currency}</option>)}</select></label>
            </div>
            <div className={styles.formGrid}>
               <div className={styles.amountField}><label><span>Amount sent</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={fromAmount} onChange={(event) => setFromAmount(event.target.value)} placeholder="0" required /></label><div className={styles.amountCurrency}>{fromAccount?.currency || "—"}</div></div>
               {isCrossCurrency && <div className={styles.amountField}><label><span>Amount received</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={toAmount} onChange={(event) => setToAmount(event.target.value)} placeholder="0" required /></label><div className={styles.amountCurrency}>{toAccount?.currency}</div></div>}
            </div>
            {isCrossCurrency && Number(fromAmount) > 0 && Number(toAmount) > 0 && <p className={styles.rateHint}>Transfer rate: 1 {fromAccount?.currency} = {(Number(toAmount) / Number(fromAmount)).toLocaleString("en-US", { maximumFractionDigits: 4 })} {toAccount?.currency}</p>}
            <div className={styles.formGrid}><label><span>Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><label><span>Note <em>optional</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="e.g. Weekly household money" /></label></div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || options.length < 2 || !fromAccountId || !toAccountId}>{saving ? "Moving…" : "Complete transfer"}</button></div>
         </form>
      </ModalShell>
   );
}

function CategoryModal({ parentCategory, categoryToEdit, request, close, refresh, showMessage }: {
   parentCategory: Category | null;
   categoryToEdit: Category | null;
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const isEditing = Boolean(categoryToEdit);
   const [type, setType] = useState<FinanceEntryType>(categoryToEdit?.entryType || parentCategory?.entryType || "expense");
   const [name, setName] = useState(categoryToEdit?.name || "");
   const [color, setColor] = useState(categoryToEdit?.color || COLORS[0]);
   const [icon, setIcon] = useState(categoryToEdit?.icon || "circle");
   const [saving, setSaving] = useState(false);
   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request(
            isEditing ? "PATCH" : "POST",
            isEditing
               ? { action: "category", id: categoryToEdit?.id, name, color, icon, active: categoryToEdit?.active }
               : { action: "category", parentCategoryId: parentCategory?.id || null, entryType: type, name, color, icon },
         );
         close();
         await refresh();
      }
      catch (error) { showMessage(error instanceof Error ? error.message : isEditing ? "Could not update category." : "Could not create category."); }
      finally { setSaving(false); }
   };
   return (
      <ModalShell title={isEditing ? parentCategory ? "Edit subcategory" : "Edit category" : parentCategory ? "New subcategory" : "New category"} description={parentCategory ? isEditing ? "Update how this subcategory is shown under " + parentCategory.name + "." : "This will roll up into " + parentCategory.name + "." : isEditing ? "Update this label without changing its transaction history." : "Create a label that feels natural to you."} close={close}>
         <form onSubmit={submit} className={styles.form}>
            {parentCategory ? (
               <div className={styles.parentCategoryPreview}><span className={styles.categoryGlyph} style={{ background: parentCategory.color + "1A", color: parentCategory.color }}><CategoryIcon icon={parentCategory.icon} /></span><div><small>Parent category</small><b>{parentCategory.name}</b></div></div>
            ) : !isEditing && <TypePicker value={type} onChange={setType} />}
            <label><span>{parentCategory ? "Subcategory name" : "Name"}</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder={parentCategory ? (type === "expense" ? "e.g. Burgers" : "e.g. Material Design salary") : type === "expense" ? "e.g. Food" : type === "income" ? "e.g. Salary" : "e.g. Emergency fund"} autoFocus required /></label>
            <fieldset><legend>Icon</legend><div className={styles.iconChoices}>{Object.entries(CATEGORY_ICONS).map(([key, Icon]) => <button type="button" key={key} className={icon === key ? styles.choiceActive : ""} onClick={() => setIcon(key)} title={key}><Icon aria-hidden="true" /></button>)}</div></fieldset>
            <fieldset><legend>Color</legend><div className={styles.colorChoices}>{COLORS.map((item) => <button type="button" key={item} className={color === item ? styles.choiceActive : ""} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Choose ${item}`} />)}</div></fieldset>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving}>{saving ? isEditing ? "Saving…" : "Creating…" : isEditing ? "Save changes" : "Create category"}</button></div>
         </form>
      </ModalShell>
   );
}

function DebtModal({ direction, accounts, request, close, refresh, showMessage }: {
   direction: FinanceDebtDirection;
   accounts: Account[];
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const options = accounts.filter((account) => account.active);
   const [personName, setPersonName] = useState("");
   const [accountId, setAccountId] = useState(options[0]?.id || "");
   const [amount, setAmount] = useState("");
   const [issuedOn, setIssuedOn] = useState(getLocalDateString);
   const [dueOn, setDueOn] = useState("");
   const [note, setNote] = useState("");
   const [saving, setSaving] = useState(false);
   const account = options.find((item) => item.id === accountId);
   const isReceivable = direction === "receivable";

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", { action: "debt", direction, personName, accountId, amount, issuedOn, dueOn, note });
         close();
         await refresh();
      } catch (error) { showMessage(error instanceof Error ? error.message : "Could not record debt."); }
      finally { setSaving(false); }
   };

   return (
      <ModalShell title={isReceivable ? "Lend money" : "Borrow money"} description={isReceivable ? "Record money someone owes you. It will not count as an expense." : "Record money you owe someone. It will not count as income."} close={close}>
         <form onSubmit={submit} className={styles.form}>
            <label><span>Person</span><input value={personName} onChange={(event) => setPersonName(event.target.value)} maxLength={80} placeholder="e.g. Aziz" autoFocus required /></label>
            <label><span>{isReceivable ? "Money comes from" : "Money goes into"}</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Choose an account</option>{options.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currency}</option>)}</select></label>
            <div className={styles.formGrid}><div className={styles.amountField}><label><span>Amount</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required /></label><div className={styles.amountCurrency}>{account?.currency || "—"}</div></div><label><span>Date</span><input type="date" value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} required /></label></div>
            <div className={styles.formGrid}><label><span>Due date <em>optional</em></span><input type="date" min={issuedOn} value={dueOn} onChange={(event) => setDueOn(event.target.value)} /></label><label><span>Note <em>optional</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="A short reminder" /></label></div>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || !accountId}>{saving ? "Saving…" : isReceivable ? "Record loan" : "Record borrowing"}</button></div>
         </form>
      </ModalShell>
   );
}

function DebtPaymentModal({ debt, accounts, request, close, refresh, showMessage }: {
   debt: Debt;
   accounts: Account[];
   request: (method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<unknown>;
   close: () => void;
   refresh: () => Promise<void>;
   showMessage: (message: string) => void;
}) {
   const options = accounts.filter((account) => account.active && account.currency === debt.currency);
   const [accountId, setAccountId] = useState(options[0]?.id || "");
   const [amount, setAmount] = useState("");
   const [paymentDate, setPaymentDate] = useState(getLocalDateString);
   const [note, setNote] = useState("");
   const [saving, setSaving] = useState(false);
   const isReceivable = debt.direction === "receivable";

   const submit = async (event: React.FormEvent) => {
      event.preventDefault();
      try {
         setSaving(true);
         await request("POST", { action: "debt-payment", debtId: debt.id, accountId, amount, paymentDate, note });
         close();
         await refresh();
      } catch (error) { showMessage(error instanceof Error ? error.message : "Could not record payment."); }
      finally { setSaving(false); }
   };

   return (
      <ModalShell title={isReceivable ? "Receive repayment" : "Repay debt"} description={isReceivable ? `${debt.personName} currently owes ${nativeMoney(debt.remainingAmount, debt.currency)}.` : `You currently owe ${debt.personName} ${nativeMoney(debt.remainingAmount, debt.currency)}.`} close={close}>
         <form onSubmit={submit} className={styles.form}>
            <div className={styles.parentCategoryPreview}><span className={styles.categoryGlyph}><PiCoinsLight /></span><div><small>{isReceivable ? "Returning to" : "Paid from"}</small><b>{debt.personName} · {nativeMoney(debt.remainingAmount, debt.currency)} remaining</b></div></div>
            <label><span>{isReceivable ? "Deposit into" : "Pay from"}</span><select value={accountId} onChange={(event) => setAccountId(event.target.value)} required><option value="">Choose a {debt.currency} account</option>{options.map((account) => <option key={account.id} value={account.id}>{account.name} · {nativeMoney(account.balance, account.currency)}</option>)}</select></label>
            <div className={styles.formGrid}><div className={styles.amountField}><label><span>Amount</span><input type="number" min="0.01" max={debt.remainingAmount} step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" required /></label><div className={styles.amountCurrency}>{debt.currency}</div></div><label><span>Date</span><input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required /></label></div>
            <label><span>Note <em>optional</em></span><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={240} placeholder="A short reminder" /></label>
            <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={close}>Cancel</button><button className={styles.primaryButton} disabled={saving || !accountId}>{saving ? "Saving…" : "Record payment"}</button></div>
         </form>
      </ModalShell>
   );
}

function DebtHistoryModal({ debts, payments, close }: {
   debts: Debt[];
   payments: DebtPayment[];
   close: () => void;
}) {
   const settledDebts = debts.filter((debt) => debt.remainingAmount <= 0.005);

   return (
      <ModalShell title="Debt history" description="Settled loans and borrowings stay here for your records." close={close}>
         {settledDebts.length ? (
            <div className={styles.debtHistoryList}>
               {settledDebts.map((debt) => {
                  const debtPayments = payments.filter((payment) => payment.debtId === debt.id);
                  return (
                     <article className={styles.debtHistoryCard} key={debt.id}>
                        <div><small>{debt.direction === "receivable" ? "Lent money" : "Borrowed money"} · settled</small><h3>{debt.personName}</h3></div>
                        <p>{nativeMoney(debt.principalAmount, debt.currency)} · {shortDate(debt.issuedOn)} · {debt.accountName}</p>
                        {debtPayments.map((payment) => <p className={styles.debtHistoryPayment} key={payment.id}>{debt.direction === "receivable" ? "Received" : "Repaid"} {nativeMoney(payment.amount, debt.currency)} into {payment.accountName} · {shortDate(payment.paymentDate)}{payment.note ? ` · ${payment.note}` : ""}</p>)}
                     </article>
                  );
               })}
            </div>
         ) : (
            <EmptyState icon={PiArchiveLight} title="No settled debts yet" text="Fully repaid debts will be kept here." action={close} actionLabel="Close" />
         )}
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
   const options = categories.filter(
      (category) =>
         category.active &&
         category.entryType !== "income" &&
         category.parentCategoryId === null,
   );
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
