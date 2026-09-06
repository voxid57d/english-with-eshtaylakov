import {
   ERP_ROLE_LABELS,
   type Shift,
   type StaffProfile,
   type Branch,
   type ErpStaffRole,
   type ErpRoleCompensationSetting,
   type ErpPenaltyRule,
} from "@/lib/erp";
import { calculateShiftPay } from "@/lib/shiftCalculations";

export type ShiftRow = Shift & {
   staff_profiles?: Pick<StaffProfile, "user_id" | "full_name" | "role" | "salary_tier" | "active"> | null;
   branches?: Pick<Branch, "id" | "name"> | null;
};

export function scheduledWorkMinutes(shift: Pick<ShiftRow, "starts_at" | "ends_at" | "break_minutes">) {
   const [startHours, startMinutes] = shift.starts_at.slice(0, 5).split(":").map(Number);
   const [endHours, endMinutes] = shift.ends_at.slice(0, 5).split(":").map(Number);
   return Math.max(
      0,
      endHours * 60 + endMinutes - (startHours * 60 + startMinutes) - Number(shift.break_minutes || 0),
   );
}

function lateDeductionMinutes(lateMinutes: number) {
   return Math.floor(lateMinutes / 60) * 60;
}

export function penaltyCount(shift: Pick<ShiftRow, "uniform_ok" | "late_counts_penalty" | "work_quality" | "absence_reason">) {
   if (shift.absence_reason) {
      return shift.absence_reason === "no_reason" ? 1 : 0;
   }

   return [
      shift.uniform_ok !== true,
      shift.late_counts_penalty === true,
      shift.work_quality === "bad",
   ].filter(Boolean).length;
}

function getPenaltyAmount(totalPenaltyNumber: number, penaltyRules: ErpPenaltyRule[]) {
   const rule = penaltyRules.find((entry) => entry.penalty_number === totalPenaltyNumber);
   return Number(rule?.active ? rule.amount : 0);
}

export function finalWorkMinutes(shift: ShiftRow) {
   if (!shift.attendance_assessed || shift.absence_reason) return 0;
   return Math.max(
      0,
      scheduledWorkMinutes(shift) - lateDeductionMinutes(Number(shift.late_minutes || 0)),
   );
}

function compensationKey(role: ErpStaffRole | null, salaryTier: string | null) {
   return `${role || "none"}:${salaryTier || "default"}`;
}

export function summarizeMonthly(
   monthShifts: ShiftRow[],
   compensationSettings: ErpRoleCompensationSetting[],
   penaltyRules: ErpPenaltyRule[],
) {
   const compensationByRoleTier = new Map(
      compensationSettings.map((setting) => [
         compensationKey(setting.role, setting.salary_tier),
         setting,
      ]),
   );
   const summaries = new Map<string, {
      staffUserId: string;
      staffName: string;
      staffRoleLabel: string | null;
      salaryTier: string;
      workedMinutes: number;
      penalties: number;
      penaltyAmount: number;
      grossSalary: number;
      salary: number;
      goodQuality: number;
      normalQuality: number;
      badQuality: number;
   }>();

   const dailyMinutes = new Map<string, number>();
   const orderedShifts = [...monthShifts].sort((left, right) =>
      left.shift_date.localeCompare(right.shift_date) ||
      left.starts_at.localeCompare(right.starts_at) || left.id.localeCompare(right.id),
   );
   for (const shift of orderedShifts) {
      if (!shift.attendance_assessed) continue;
      const staffUserId = shift.staff_user_id || `snapshot:${shift.staff_name_snapshot || shift.id}`;
      const role = shift.staff_profiles?.role ?? shift.staff_role_snapshot;
      const salaryTier = shift.staff_profiles?.salary_tier ?? shift.salary_tier_snapshot ?? "default";
      const current = summaries.get(staffUserId) || {
         staffUserId,
         staffName: shift.staff_profiles?.full_name ?? shift.staff_name_snapshot ?? "Staff member",
         staffRoleLabel: role ? ERP_ROLE_LABELS[role] : null,
         salaryTier,
         workedMinutes: 0,
         penalties: 0,
         penaltyAmount: 0,
         grossSalary: 0,
         salary: 0,
         goodQuality: 0,
         normalQuality: 0,
         badQuality: 0,
      };
      const shiftPenalties = penaltyCount(shift);
      const workMinutes = finalWorkMinutes(shift);
      const compensation = role
         ? compensationByRoleTier.get(compensationKey(role, salaryTier))
         : null;
      const hourlyRate = Number(shift.hourly_rate_override ?? shift.hourly_rate_snapshot ?? compensation?.hourly_rate ?? 0);
      const dailyKey = `${staffUserId}:${shift.shift_date}`;
      const previousDailyMinutes = dailyMinutes.get(dailyKey) || 0;
      const shiftPay = calculateShiftPay(workMinutes, previousDailyMinutes, {
         hourlyRate,
         extraHoursEnabled: shift.extra_hours_enabled_override ?? compensation?.extra_hours_enabled ?? false,
         extraHourlyRate: Number(shift.extra_hourly_rate_override ?? compensation?.extra_hourly_rate ?? 0),
         extraHoursThreshold: Number(compensation?.extra_hours_threshold ?? 8),
      });
      dailyMinutes.set(dailyKey, previousDailyMinutes + workMinutes);

      current.workedMinutes += workMinutes;
      if (!shift.absence_reason && shift.work_quality === "good") current.goodQuality += 1;
      if (!shift.absence_reason && shift.work_quality === "normal") current.normalQuality += 1;
      if (!shift.absence_reason && shift.work_quality === "bad") current.badQuality += 1;
      for (let index = 1; index <= shiftPenalties; index += 1) {
         current.penalties += 1;
         current.penaltyAmount += getPenaltyAmount(current.penalties, penaltyRules);
      }
      current.grossSalary += shiftPay;
      current.salary = Math.max(0, current.grossSalary - current.penaltyAmount);
      summaries.set(staffUserId, current);
   }

   return Array.from(summaries.values()).map((summary) => ({
      ...summary,
      workedHours: Math.round((summary.workedMinutes / 60) * 100) / 100,
      grossSalary: Math.round(summary.grossSalary),
      salary: Math.round(summary.salary),
      penaltyAmount: Math.round(summary.penaltyAmount),
   }));
}
