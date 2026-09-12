import { requireAuthenticatedUser } from "@/lib/serverAuth";

export const FINANCE_ENTRY_TYPES = ["expense", "income", "savings"] as const;
export const FINANCE_CURRENCIES = ["UZS", "USD"] as const;

export type FinanceEntryType = (typeof FINANCE_ENTRY_TYPES)[number];
export type FinanceCurrency = (typeof FINANCE_CURRENCIES)[number];

export function isFinanceEntryType(value: unknown): value is FinanceEntryType {
   return FINANCE_ENTRY_TYPES.includes(value as FinanceEntryType);
}

export function isFinanceCurrency(value: unknown): value is FinanceCurrency {
   return FINANCE_CURRENCIES.includes(value as FinanceCurrency);
}

export function cleanFinanceText(value: unknown, maxLength = 240) {
   return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function requirePositiveAmount(value: unknown, label = "Amount") {
   const amount = Number(value);
   if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`${label} must be greater than zero.`);
   }
   return Number(amount.toFixed(2));
}

export function isIsoDate(value: unknown): value is string {
   if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return false;
   }
   const date = new Date(`${value}T00:00:00Z`);
   return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function isMonthStart(value: unknown): value is string {
   return isIsoDate(value) && value.endsWith("-01");
}

export async function requirePrivateFinanceUser(req: Request) {
   const user = await requireAuthenticatedUser(req);
   const allowedUserId = process.env.PRIVATE_FINANCE_USER_ID?.trim();

   if (!allowedUserId) {
      const error = new Error("Private finance access is not configured.");
      Object.assign(error, { status: 503 });
      throw error;
   }

   if (user.id !== allowedUserId) {
      const error = new Error("You do not have access to this private space.");
      Object.assign(error, { status: 403 });
      throw error;
   }

   return user;
}

export function privateFinanceError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const explicitStatus =
      typeof error === "object" && error !== null && "status" in error
         ? Number((error as { status?: unknown }).status)
         : 0;

   if (explicitStatus >= 400 && explicitStatus <= 599) {
      return { message, status: explicitStatus };
   }
   if (message === "Missing bearer token." || message === "Unauthorized.") {
      return { message: "Please sign in to continue.", status: 401 };
   }
   if (
      message.includes("required") ||
      message.includes("must") ||
      message.startsWith("Choose") ||
      message.startsWith("Valid")
   ) {
      return { message, status: 400 };
   }
   return { message: message || fallback, status: 500 };
}
