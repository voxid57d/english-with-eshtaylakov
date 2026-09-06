import { getLocalDateString } from "@/lib/localDate";

export const ERP_STAFF_ROLES = [
   "admin",
   "branch_manager",
   "sales_manager",
   "salesman",
   "assistant",
   "cashier",
] as const;

export type ErpStaffRole = (typeof ERP_STAFF_ROLES)[number];

export const ERP_SHIFT_WORKER_ROLES = [
   "salesman",
   "assistant",
   "cashier",
] as const satisfies readonly ErpStaffRole[];

export const ERP_SHIFT_STATUSES = [
   "scheduled",
   "absent",
] as const;

export type ErpShiftStatus = (typeof ERP_SHIFT_STATUSES)[number];

export const ERP_WORK_QUALITY_VALUES = ["good", "normal", "bad"] as const;

export type ErpWorkQuality = (typeof ERP_WORK_QUALITY_VALUES)[number];

export const ERP_ABSENCE_REASONS = ["no_reason", "sick_leave", "asked"] as const;

export type ErpAbsenceReason = (typeof ERP_ABSENCE_REASONS)[number];

export const ERP_SALESMAN_TIERS = ["tier_1", "tier_2", "tier_3", "tier_4"] as const;

export type ErpSalesmanTier = (typeof ERP_SALESMAN_TIERS)[number];

export const ERP_MODULES = [
   "overview",
   "branches",
   "staff",
   "tasks",
   "kpi",
   "shifts",
   "teachers",
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
   auth_user_id: string | null;
   full_name: string;
   role: ErpStaffRole;
   salary_tier: string;
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
   staff_user_id: string | null;
   staff_name_snapshot: string | null;
   staff_role_snapshot: ErpStaffRole | null;
   salary_tier_snapshot: string | null;
   branch_id: string;
   shift_date: string;
   starts_at: string;
   ends_at: string;
   break_minutes: number;
   status: ErpShiftStatus;
   approved_by: string | null;
   attendance_assessed: boolean;
   hourly_rate_override: number | null;
   extra_hourly_rate_override: number | null;
   extra_hours_enabled_override: boolean | null;
   uniform_ok: boolean;
   late_minutes: number;
   late_counts_penalty: boolean;
   work_quality: ErpWorkQuality;
   absence_reason: ErpAbsenceReason | null;
   actual_work_minutes: number | null;
   penalty_amount_snapshot: number;
   hourly_rate_snapshot: number | null;
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

export type ErpRoleCompensationSetting = {
   role: ErpStaffRole;
   salary_tier: string;
   hourly_rate: number;
   extra_hours_enabled: boolean;
   extra_hourly_rate: number;
   extra_hours_threshold: number;
   updated_at: string;
};

export type ErpPenaltyRule = {
   penalty_number: number;
   label: string;
   amount: number;
   active: boolean;
   updated_at: string;
};

export type StaffWorkingHour = {
   id: string;
   staff_user_id: string;
   branch_id: string | null;
   weekday: number;
   starts_at: string;
   ends_at: string;
   break_minutes: number;
   active: boolean;
   note: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
};

export type TeacherProfile = {
   id: string;
   full_name: string;
   phone: string | null;
   birthday: string | null;
   ielts_score: number | null;
   celta_certified: boolean;
   started_working_on: string | null;
   stage: string | null;
   lms_teacher_url: string | null;
   active: boolean;
   created_at: string;
   updated_at: string;
};

export type TeacherGroupLevel = {
   id: string;
   name: string;
   active: boolean;
   created_at: string;
   updated_at: string;
};

export type TeacherLessonGroup = {
   id: string;
   teacher_id: string;
   level_id: string;
   lms_group_name: string | null;
   lms_group_id: string | null;
   starts_on: string | null;
   ends_on: string | null;
   starts_at: string;
   ends_at: string;
   weekdays: number[];
   active_students_count: number;
   active: boolean;
   is_intake: boolean;
   archived_on: string | null;
   created_at: string;
   updated_at: string;
};

export type TeacherLessonCover = {
   id: string;
   lesson_group_id: string;
   cover_date: string;
   covering_teacher_id: string | null;
   covering_teacher_name: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
};

export type TeacherLessonHoliday = {
   id: string;
   holiday_date: string;
   note: string | null;
   created_by: string | null;
   created_at: string;
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
   absent: "Absent",
};

export const ERP_WEEKDAYS = [
   { value: 1, label: "Monday" },
   { value: 2, label: "Tuesday" },
   { value: 3, label: "Wednesday" },
   { value: 4, label: "Thursday" },
   { value: 5, label: "Friday" },
   { value: 6, label: "Saturday" },
   { value: 7, label: "Sunday" },
] as const;

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

export function getMonthBounds(anchor: Date | string = getLocalDateString()) {
   const dateValue = typeof anchor === "string" ? anchor : getLocalDateString(anchor);
   const date = new Date(`${dateValue}T00:00:00.000Z`);
   const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
   const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

   return {
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
   };
}

export function getWeekBounds(anchor: Date | string = getLocalDateString()) {
   const dateValue = typeof anchor === "string" ? anchor : getLocalDateString(anchor);
   const date = new Date(`${dateValue}T00:00:00.000Z`);
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
