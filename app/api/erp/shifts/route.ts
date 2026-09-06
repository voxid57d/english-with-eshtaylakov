import { NextResponse } from "next/server";
import { scheduledWorkMinutes, penaltyCount, finalWorkMinutes, summarizeMonthly, type ShiftRow } from "@/lib/shiftPayroll";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   ERP_ABSENCE_REASONS,
   ERP_SHIFT_STATUS_LABELS,
   ERP_SHIFT_WORKER_ROLES,
   ERP_WORK_QUALITY_VALUES,
   getWeekBounds,
   isDateString,
   isErpShiftStatus,
   nullableString,
   type ErpAbsenceReason,
   type ErpPenaltyRule,
   type ErpRoleCompensationSetting,
   type Branch,
   type ErpStaffRole,
   type ErpWorkQuality,
   type StaffProfile,
} from "@/lib/erp";
import { canErp, requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type AssessmentPayload = {
   id: string;
   staffUserId: string;
   branchId: string;
   shiftDate: string;
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   status: string;
   isAssessed: boolean;
   uniformOk: boolean;
   lateMinutes: number;
   lateCountsPenalty: boolean;
   workQuality: ErpWorkQuality;
   absenceReason: ErpAbsenceReason | null;
   actualWorkMinutes: number | null;
   note: string | null;
};

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function isTimeString(value: string) {
   return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toNonNegativeInteger(value: unknown, fieldName: string) {
   const numberValue = Number(value);

   if (!Number.isInteger(numberValue) || numberValue < 0) {
      throw new Error(`${fieldName} must be zero or higher.`);
   }

   return numberValue;
}

function parseWorkQuality(value: unknown): ErpWorkQuality {
   const quality = cleanString(value) || "normal";
   if (!(ERP_WORK_QUALITY_VALUES as readonly string[]).includes(quality)) {
      throw new Error("Choose a valid work quality.");
   }
   return quality as ErpWorkQuality;
}

function parseAbsenceReason(value: unknown): ErpAbsenceReason | null {
   const reason = nullableString(value);
   if (!reason) return null;
   if (!(ERP_ABSENCE_REASONS as readonly string[]).includes(reason)) {
      throw new Error("Choose a valid absence reason.");
   }
   return reason as ErpAbsenceReason;
}

function isMonthString(value: string) {
   return /^\d{4}-\d{2}$/.test(value);
}

function getMonthBounds(monthValue: string) {
   const monthStart = `${monthValue}-01`;
   const monthEndDate = new Date(`${monthStart}T00:00:00.000Z`);
   monthEndDate.setUTCMonth(monthEndDate.getUTCMonth() + 1);
   monthEndDate.setUTCDate(0);

   return {
      monthStart,
      monthEnd: monthEndDate.toISOString().slice(0, 10),
   };
}

function toShift(row: ShiftRow) {
   const status = row.absence_reason ? "absent" : "scheduled";

   return {
      id: row.id,
      staffUserId: row.staff_user_id ?? "",
      staffName: row.staff_profiles?.full_name ?? row.staff_name_snapshot ?? "Staff member",
      staffRole: row.staff_profiles?.role ?? row.staff_role_snapshot ?? null,
      staffRoleLabel: row.staff_profiles?.role || row.staff_role_snapshot
         ? ERP_ROLE_LABELS[(row.staff_profiles?.role ?? row.staff_role_snapshot) as ErpStaffRole]
         : null,
      salaryTier: row.staff_profiles?.salary_tier ?? row.salary_tier_snapshot ?? "default",
      staffActive: row.staff_profiles?.active ?? false,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? "Branch",
      shiftDate: row.shift_date,
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
      breakMinutes: Number(row.break_minutes || 0),
      status,
      statusLabel: ERP_SHIFT_STATUS_LABELS[status],
      isAssessed: row.attendance_assessed,
      uniformOk: row.uniform_ok,
      lateMinutes: Number(row.late_minutes || 0),
      lateCountsPenalty: row.late_counts_penalty,
      workQuality: row.work_quality,
      absenceReason: row.absence_reason,
      actualWorkMinutes: row.actual_work_minutes,
      scheduledWorkMinutes: scheduledWorkMinutes(row),
      finalWorkMinutes: finalWorkMinutes(row),
      penaltyCount: row.attendance_assessed ? penaltyCount(row) : 0,
      penaltyAmount: Number(row.penalty_amount_snapshot || 0),
      hourlyRate: row.hourly_rate_snapshot,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function validateShiftBody(body: Record<string, unknown>) {
   const staffUserId = cleanString(body?.staffUserId);
   const branchId = cleanString(body?.branchId);
   const shiftDate = cleanString(body?.shiftDate);
   const startsAt = cleanString(body?.startsAt);
   const endsAt = cleanString(body?.endsAt);
   const status = cleanString(body?.status) || "scheduled";
   const breakMinutes = toNonNegativeInteger(body?.breakMinutes ?? 0, "Break minutes");

   if (!staffUserId) throw new Error("Choose a staff member.");
   if (!branchId) throw new Error("Choose a branch.");
   if (!isDateString(shiftDate)) throw new Error("Valid shift date is required.");
   if (!isTimeString(startsAt)) throw new Error("Valid start time is required.");
   if (!isTimeString(endsAt)) throw new Error("Valid end time is required.");
   if (!isErpShiftStatus(status)) throw new Error("Choose a valid shift status.");
   if (endsAt <= startsAt) throw new Error("End time must be later than start time.");

   if (typeof body?.isAssessed !== "boolean") {
      throw new Error("Reload this page before saving attendance.");
   }
   const isAssessed = body.isAssessed;
   const absenceReason = isAssessed ? parseAbsenceReason(body?.absenceReason) : null;
   const hasAttendanceDetails = isAssessed && !absenceReason;

   return {
      staffUserId,
      branchId,
      shiftDate,
      startsAt,
      endsAt,
      breakMinutes,
      status: absenceReason ? "absent" : "scheduled",
      isAssessed,
      uniformOk: hasAttendanceDetails ? body?.uniformOk !== false : true,
      lateMinutes: hasAttendanceDetails ? toNonNegativeInteger(body?.lateMinutes ?? 0, "Late minutes") : 0,
      lateCountsPenalty: hasAttendanceDetails && body?.lateCountsPenalty === true,
      workQuality: hasAttendanceDetails ? parseWorkQuality(body?.workQuality) : "normal",
      absenceReason,
      actualWorkMinutes: null,
      note: nullableString(body?.note),
   };
}

async function assertShiftWorker(staffUserId: string) {
   const { data, error } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, role, salary_tier, active")
      .eq("user_id", staffUserId)
      .single();

   if (error || !data) {
      throw new Error("Choose a valid staff member.");
   }

   if (!(ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(data.role) || data.active !== true) {
      throw new Error("Branch managers do not use shifts.");
   }

   return data as Pick<StaffProfile, "user_id" | "full_name" | "role" | "salary_tier" | "active">;
}

async function getCompensationForStaff(role: ErpStaffRole, salaryTier: string) {
   const { data } = await supabaseAdmin
      .from("erp_role_compensation_settings")
      .select("role, salary_tier, hourly_rate, extra_hours_enabled, extra_hourly_rate, extra_hours_threshold, updated_at")
      .eq("role", role)
      .eq("salary_tier", role === "salesman" ? salaryTier : "default")
      .maybeSingle();

   return data as ErpRoleCompensationSetting | null;
}

async function saveAssessmentRow(row: AssessmentPayload, approvedBy: string) {
   const shift = validateShiftBody(row as unknown as Record<string, unknown>);
   const staff = await assertShiftWorker(shift.staffUserId);
   const compensation = await getCompensationForStaff(staff.role, staff.salary_tier);
   const payload = {
      staff_user_id: shift.staffUserId,
      staff_name_snapshot: staff.full_name,
      staff_role_snapshot: staff.role,
      salary_tier_snapshot: staff.salary_tier,
      branch_id: shift.branchId,
      shift_date: shift.shiftDate,
      starts_at: shift.startsAt,
      ends_at: shift.endsAt,
      break_minutes: shift.breakMinutes,
      status: shift.absenceReason ? "absent" : "scheduled",
      approved_by: shift.isAssessed ? approvedBy : null,
      attendance_assessed: shift.isAssessed,
      uniform_ok: shift.uniformOk,
      late_minutes: shift.lateMinutes,
      late_counts_penalty: shift.lateCountsPenalty,
      work_quality: shift.workQuality,
      absence_reason: shift.absenceReason,
      actual_work_minutes: null,
      hourly_rate_snapshot: compensation?.hourly_rate ?? null,
      note: shift.note,
   };

   if (row.id && !row.id.startsWith("template:")) {
      const { data, error } = await supabaseAdmin
         .from("shifts")
         .update(payload)
         .eq("id", row.id)
         .select("id")
         .single();

      if (error || !data) throw new Error("Failed to save daily shift.");
      return data;
   }

   const { data: existing, error: existingError } = await supabaseAdmin
      .from("shifts")
      .select("id")
      .eq("staff_user_id", shift.staffUserId)
      .eq("shift_date", shift.shiftDate)
      .eq("starts_at", shift.startsAt)
      .eq("ends_at", shift.endsAt)
      .limit(1)
      .maybeSingle();

   if (existingError) throw new Error("Failed to load daily shift.");

   const query = existing
      ? supabaseAdmin.from("shifts").update(payload).eq("id", existing.id)
      : supabaseAdmin.from("shifts").insert(payload);
   const { data, error } = await query.select("id").single();

   if (error || !data) throw new Error("Failed to save daily shift.");
   return data;
}

export async function GET(req: Request) {
   try {
      const { staff: currentStaff } = await requireErpPermission(req, "shifts", "view");
      const canManage = await canErp(currentStaff.role, "shifts", "manage");

      const url = new URL(req.url);
      const fallbackWeek = getWeekBounds();
      const weekStart = url.searchParams.get("weekStart") || fallbackWeek.weekStart;
      const weekEnd = url.searchParams.get("weekEnd") || fallbackWeek.weekEnd;
      const payrollMonth = url.searchParams.get("payrollMonth") || weekStart.slice(0, 7);
      const branchId = url.searchParams.get("branchId") || "all";

      if (!isDateString(weekStart) || !isDateString(weekEnd)) {
         throw new Error("Valid week dates are required.");
      }

      if (!isMonthString(payrollMonth)) {
         throw new Error("Valid payroll month is required.");
      }

      const { monthStart, monthEnd } = getMonthBounds(payrollMonth);

      let shiftQuery = supabaseAdmin
         .from("shifts")
         .select(
            "id, staff_user_id, staff_name_snapshot, staff_role_snapshot, salary_tier_snapshot, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, attendance_assessed, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, uniform_ok, late_minutes, late_counts_penalty, work_quality, absence_reason, actual_work_minutes, penalty_amount_snapshot, hourly_rate_snapshot, note, created_at, updated_at, staff_profiles(user_id, full_name, role, salary_tier, active), branches(id, name)",
         )
         .gte("shift_date", weekStart)
         .lte("shift_date", weekEnd)
         .order("shift_date", { ascending: true })
         .order("starts_at", { ascending: true });

      if (branchId !== "all") {
         shiftQuery = shiftQuery.eq("branch_id", branchId);
      }

      if (!canManage) {
         shiftQuery = shiftQuery.eq("staff_user_id", currentStaff.userId);
      }

      let staffQuery = supabaseAdmin
         .from("staff_profiles")
         .select("user_id, full_name, role, salary_tier, primary_branch_id, telegram_username, phone, notes, active, created_at, updated_at")
         .eq("active", true)
         .order("full_name", { ascending: true });

      if (!canManage) {
         staffQuery = staffQuery.eq("user_id", currentStaff.userId);
      } else {
         staffQuery = staffQuery.in("role", [...ERP_SHIFT_WORKER_ROLES]);
      }

      let monthShiftQuery = supabaseAdmin
         .from("shifts")
         .select(
            "id, staff_user_id, staff_name_snapshot, staff_role_snapshot, salary_tier_snapshot, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, attendance_assessed, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, uniform_ok, late_minutes, late_counts_penalty, work_quality, absence_reason, actual_work_minutes, penalty_amount_snapshot, hourly_rate_snapshot, note, created_at, updated_at, staff_profiles(user_id, full_name, role, salary_tier, active), branches(id, name)",
         )
         .gte("shift_date", monthStart)
         .lte("shift_date", monthEnd);

      if (branchId !== "all") {
         monthShiftQuery = monthShiftQuery.eq("branch_id", branchId);
      }

      if (!canManage) {
         monthShiftQuery = monthShiftQuery.eq("staff_user_id", currentStaff.userId);
      }

      const [shiftResult, staffResult, branchResult, monthShiftResult, compensationResult, penaltyRuleResult] = await Promise.all([
         shiftQuery,
         staffQuery,
         supabaseAdmin
            .from("branches")
            .select("id, name, address, phone, active, created_at, updated_at")
            .eq("active", true)
            .order("name", { ascending: true }),
         monthShiftQuery,
         supabaseAdmin
            .from("erp_role_compensation_settings")
            .select("role, salary_tier, hourly_rate, extra_hours_enabled, extra_hourly_rate, extra_hours_threshold, updated_at"),
         supabaseAdmin
            .from("erp_penalty_rules")
            .select("penalty_number, label, amount, active, updated_at")
            .order("penalty_number", { ascending: true }),
      ]);

      if (
         shiftResult.error ||
         staffResult.error ||
         branchResult.error ||
         monthShiftResult.error ||
         compensationResult.error ||
         penaltyRuleResult.error
      ) {
         throw new Error("Failed to load shifts. Apply supabase/erp_core_schema.sql first.");
      }

      return NextResponse.json({
         week: { weekStart, weekEnd },
         month: { monthStart, monthEnd, payrollMonth },
         canManage,
         shifts: ((shiftResult.data || []) as unknown as ShiftRow[])
            .map(toShift)
            .filter(
               (shift) =>
                  shift.staffActive &&
                  !!shift.staffRole &&
                  (ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(shift.staffRole),
            ),
         monthlySummaries: summarizeMonthly(
            (monthShiftResult.data || []) as unknown as ShiftRow[],
            (compensationResult.data || []) as ErpRoleCompensationSetting[],
            (penaltyRuleResult.data || []) as ErpPenaltyRule[],
         ),
         penaltyRules: (penaltyRuleResult.data || []) as ErpPenaltyRule[],
         staff: ((staffResult.data || []) as StaffProfile[]).map((member) => ({
            userId: member.user_id,
            fullName: member.full_name,
            role: member.role,
            roleLabel: ERP_ROLE_LABELS[member.role],
            salaryTier: member.salary_tier,
            primaryBranchId: member.primary_branch_id,
         })),
         branches: ((branchResult.data || []) as Branch[]).map((branch) => ({
            id: branch.id,
            name: branch.name,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load shifts.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();
      const shift = validateShiftBody(body);
      const staff = await assertShiftWorker(shift.staffUserId);
      const compensation = await getCompensationForStaff(staff.role, staff.salary_tier);

      const { data, error } = await supabaseAdmin
         .from("shifts")
         .insert({
            staff_user_id: shift.staffUserId,
            staff_name_snapshot: staff.full_name,
            staff_role_snapshot: staff.role,
            salary_tier_snapshot: staff.salary_tier,
            branch_id: shift.branchId,
            shift_date: shift.shiftDate,
            starts_at: shift.startsAt,
            ends_at: shift.endsAt,
            break_minutes: shift.breakMinutes,
            status: shift.absenceReason ? "absent" : "scheduled",
            approved_by: shift.isAssessed ? user.id : null,
            attendance_assessed: shift.isAssessed,
            uniform_ok: shift.uniformOk,
            late_minutes: shift.lateMinutes,
            late_counts_penalty: shift.lateCountsPenalty,
            work_quality: shift.workQuality,
            absence_reason: shift.absenceReason,
            actual_work_minutes: null,
            hourly_rate_snapshot: compensation?.hourly_rate ?? null,
            note: shift.note,
         })
         .select(
            "id, staff_user_id, staff_name_snapshot, staff_role_snapshot, salary_tier_snapshot, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, attendance_assessed, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, uniform_ok, late_minutes, late_counts_penalty, work_quality, absence_reason, actual_work_minutes, penalty_amount_snapshot, hourly_rate_snapshot, note, created_at, updated_at, staff_profiles(user_id, full_name, role, salary_tier, active), branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to create shift.");
      }

      return NextResponse.json({ shift: toShift(data as unknown as ShiftRow) });
   } catch (error) {
      return jsonError(error, "Failed to create shift.");
   }
}

export async function PATCH(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();

      if (body?.action === "bulkAssessments") {
         const assessments = Array.isArray(body?.shifts) ? body.shifts : [];
         if (assessments.length === 0) throw new Error("No shifts to save.");

         await Promise.all(
            assessments.map((row: unknown) =>
               saveAssessmentRow(row as AssessmentPayload, user.id),
            ),
         );

         return NextResponse.json({ ok: true });
      }

      const id = cleanString(body?.id);

      if (!id) throw new Error("Shift ID is required.");

      const shift = validateShiftBody(body);
      const staff = await assertShiftWorker(shift.staffUserId);
      const compensation = await getCompensationForStaff(staff.role, staff.salary_tier);

      const { data, error } = await supabaseAdmin
         .from("shifts")
         .update({
            staff_user_id: shift.staffUserId,
            staff_name_snapshot: staff.full_name,
            staff_role_snapshot: staff.role,
            salary_tier_snapshot: staff.salary_tier,
            branch_id: shift.branchId,
            shift_date: shift.shiftDate,
            starts_at: shift.startsAt,
            ends_at: shift.endsAt,
            break_minutes: shift.breakMinutes,
            status: shift.absenceReason ? "absent" : "scheduled",
            approved_by: shift.isAssessed ? user.id : null,
            attendance_assessed: shift.isAssessed,
            uniform_ok: shift.uniformOk,
            late_minutes: shift.lateMinutes,
            late_counts_penalty: shift.lateCountsPenalty,
            work_quality: shift.workQuality,
            absence_reason: shift.absenceReason,
            actual_work_minutes: null,
            hourly_rate_snapshot: compensation?.hourly_rate ?? null,
            note: shift.note,
         })
         .eq("id", id)
         .select(
            "id, staff_user_id, staff_name_snapshot, staff_role_snapshot, salary_tier_snapshot, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, attendance_assessed, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, uniform_ok, late_minutes, late_counts_penalty, work_quality, absence_reason, actual_work_minutes, penalty_amount_snapshot, hourly_rate_snapshot, note, created_at, updated_at, staff_profiles(user_id, full_name, role, salary_tier, active), branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to update shift.");
      }

      return NextResponse.json({ shift: toShift(data as unknown as ShiftRow) });
   } catch (error) {
      return jsonError(error, "Failed to update shift.");
   }
}
