export const ERP_STAFF_ROLES = [
   "admin",
   "branch_manager",
   "sales_manager",
   "salesman",
   "assistant",
   "cashier",
] as const;

export type ErpStaffRole = (typeof ERP_STAFF_ROLES)[number];

export const ERP_SHIFT_STATUSES = [
   "scheduled",
   "completed",
   "late",
   "absent",
   "day_off",
   "sick_leave",
   "approved_leave",
] as const;

export type ErpShiftStatus = (typeof ERP_SHIFT_STATUSES)[number];

export const ERP_MODULES = [
   "overview",
   "branches",
   "staff",
   "tasks",
   "kpi",
   "shifts",
   "metrics",
   "settings",
] as const;

export type ErpModule = (typeof ERP_MODULES)[number];

export const ERP_ACTIONS = ["view", "manage"] as const;

export type ErpAction = (typeof ERP_ACTIONS)[number];

export type Branch = {
   id: string;
   name: string;
   address: string | null;
   phone: string | null;
   active: boolean;
   created_at: string;
   updated_at: string;
};

export type StaffProfile = {
   user_id: string;
   full_name: string;
   role: ErpStaffRole;
   primary_branch_id: string | null;
   telegram_username: string | null;
   phone: string | null;
   notes: string | null;
   active: boolean;
   created_at: string;
   updated_at: string;
   branch?: Pick<Branch, "id" | "name"> | null;
};

export type AuthUserOption = {
   id: string;
   email: string | null;
   displayName: string;
   createdAt: string | null;
};

export type KpiDefinition = {
   id: string;
   name: string;
   description: string | null;
   role: ErpStaffRole;
   unit: string;
   active: boolean;
   created_at: string;
   updated_at: string;
};

export type KpiTarget = {
   id: string;
   kpi_definition_id: string;
   staff_user_id: string | null;
   branch_id: string | null;
   period_start: string;
   period_end: string;
   target_value: number;
   created_by: string | null;
   created_at: string;
   updated_at: string;
};

export type KpiProgressEntry = {
   id: string;
   kpi_target_id: string;
   entry_date: string;
   value: number;
   note: string | null;
   created_by: string | null;
   created_at: string;
};

export type Shift = {
   id: string;
   staff_user_id: string;
   branch_id: string;
   shift_date: string;
   starts_at: string;
   ends_at: string;
   status: ErpShiftStatus;
   approved_by: string | null;
   note: string | null;
   created_at: string;
   updated_at: string;
};

export type DailyMetric = {
   id: string;
   branch_id: string;
   metric_date: string;
   leads_count: number;
   trial_lessons_count: number;
   conversions_count: number;
   active_students_count: number;
   revenue_amount: number;
   debt_amount: number;
   refunds_amount: number;
   attendance_count: number;
   note: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
};

export type ErpRolePermission = {
   role: ErpStaffRole;
   module: ErpModule;
   can_view: boolean;
   can_manage: boolean;
   updated_at: string;
};

export const ERP_ROLE_LABELS: Record<ErpStaffRole, string> = {
   admin: "Admin",
   branch_manager: "Branch Manager",
   sales_manager: "Sales Manager",
   salesman: "Salesman",
   assistant: "Assistant",
   cashier: "Cashier",
};

export const ERP_SHIFT_STATUS_LABELS: Record<ErpShiftStatus, string> = {
   scheduled: "Scheduled",
   completed: "Completed",
   late: "Late",
   absent: "Absent",
   day_off: "Day off",
   sick_leave: "Sick leave",
   approved_leave: "Approved leave",
};

export function isErpStaffRole(value: unknown): value is ErpStaffRole {
   return (
      typeof value === "string" &&
      (ERP_STAFF_ROLES as readonly string[]).includes(value)
   );
}

export function isErpShiftStatus(value: unknown): value is ErpShiftStatus {
   return (
      typeof value === "string" &&
      (ERP_SHIFT_STATUSES as readonly string[]).includes(value)
   );
}

export function isErpModule(value: unknown): value is ErpModule {
   return (
      typeof value === "string" &&
      (ERP_MODULES as readonly string[]).includes(value)
   );
}

export function isErpAction(value: unknown): value is ErpAction {
   return (
      typeof value === "string" &&
      (ERP_ACTIONS as readonly string[]).includes(value)
   );
}

export function cleanString(value: unknown) {
   return typeof value === "string" ? value.trim() : "";
}

export function nullableString(value: unknown) {
   const cleaned = cleanString(value);
   return cleaned ? cleaned : null;
}

export function isDateString(value: string) {
   return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function getMonthBounds(anchor = new Date()) {
   const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
   const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));

   return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
   };
}

export function getWeekBounds(anchor = new Date()) {
   const date = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()),
   );
   const day = date.getUTCDay();
   const mondayOffset = day === 0 ? -6 : 1 - day;
   const start = new Date(date);
   start.setUTCDate(date.getUTCDate() + mondayOffset);
   const end = new Date(start);
   end.setUTCDate(start.getUTCDate() + 6);

   return {
      weekStart: start.toISOString().slice(0, 10),
      weekEnd: end.toISOString().slice(0, 10),
   };
}

export function erpJsonError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const status =
      message === "Missing bearer token." || message === "Unauthorized."
         ? 401
         : message === "Forbidden."
           ? 403
           : 400;

   return { message: message || fallback, status };
}
