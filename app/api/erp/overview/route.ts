import { NextResponse } from "next/server";
import {
   erpJsonError,
   ERP_SHIFT_WORKER_ROLES,
   getMonthBounds,
   getWeekBounds,
   type DailyMetric,
   type ErpRoleCompensationSetting,
   type KpiProgressEntry,
   type KpiTarget,
   type Shift,
   type StaffProfile,
} from "@/lib/erp";
import { requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function summarizeMetrics(metrics: DailyMetric[]) {
   return metrics.reduce(
      (summary, metric) => ({
         leadsCount: summary.leadsCount + Number(metric.leads_count || 0),
         trialLessonsCount:
            summary.trialLessonsCount + Number(metric.trial_lessons_count || 0),
         conversionsCount:
            summary.conversionsCount + Number(metric.conversions_count || 0),
         revenueAmount: summary.revenueAmount + Number(metric.revenue_amount || 0),
         debtAmount: summary.debtAmount + Number(metric.debt_amount || 0),
         attendanceCount: summary.attendanceCount + Number(metric.attendance_count || 0),
      }),
      {
         leadsCount: 0,
         trialLessonsCount: 0,
         conversionsCount: 0,
         revenueAmount: 0,
         debtAmount: 0,
         attendanceCount: 0,
      },
   );
}

function getKpiAverage(targets: KpiTarget[], progressEntries: KpiProgressEntry[]) {
   if (targets.length === 0) return 0;

   const progressByTarget = new Map<string, KpiProgressEntry>();
   for (const entry of progressEntries) {
      const current = progressByTarget.get(entry.kpi_target_id);
      if (
         !current ||
         entry.entry_date > current.entry_date ||
         (entry.entry_date === current.entry_date && entry.created_at > current.created_at)
      ) {
         progressByTarget.set(entry.kpi_target_id, entry);
      }
   }

   const totalPercentage = targets.reduce((sum, target) => {
      const targetValue = Number(target.target_value || 0);
      if (targetValue <= 0) return sum;
      const progressValue = Number(progressByTarget.get(target.id)?.value || 0);
      return sum + Math.min(999, Math.round((progressValue / targetValue) * 100));
   }, 0);

   return Math.round(totalPercentage / targets.length);
}

type PayrollShiftRow = Shift & {
   staff_profiles?: Pick<StaffProfile, "role"> | null;
};

function timeToMinutes(value: string) {
   const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
   return hours * 60 + minutes;
}

function getShiftHours(shift: Pick<Shift, "starts_at" | "ends_at" | "break_minutes">) {
   const start = timeToMinutes(shift.starts_at);
   const end = timeToMinutes(shift.ends_at);
   const minutes = Math.max(0, end - start - Number(shift.break_minutes || 0));

   return minutes / 60;
}

function summarizePayroll(
   shifts: PayrollShiftRow[],
   compensationSettings: ErpRoleCompensationSetting[],
) {
   const settingsByRole = new Map(
      compensationSettings.map((setting) => [setting.role, setting]),
   );

   return shifts
      .filter((shift) => !shift.absence_reason)
      .filter(
         (shift) =>
            !!shift.staff_profiles?.role &&
            (ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(
               shift.staff_profiles.role,
            ),
      )
      .reduce(
         (summary, shift) => {
            const role = shift.staff_profiles?.role;
            const setting = role ? settingsByRole.get(role) : null;
            const hours = getShiftHours(shift);
            const hourlyRate = Number(
               shift.hourly_rate_override ?? setting?.hourly_rate ?? 0,
            );
            const extraHoursEnabled = Boolean(
               shift.extra_hours_enabled_override ?? setting?.extra_hours_enabled ?? false,
            );
            const extraHourlyRate = Number(
               shift.extra_hourly_rate_override ??
                  setting?.extra_hourly_rate ??
                  hourlyRate,
            );
            const threshold = Number(setting?.extra_hours_threshold ?? 8);
            const extraHours = extraHoursEnabled ? Math.max(0, hours - threshold) : 0;
            const regularHours = hours - extraHours;
            const payout = regularHours * hourlyRate + extraHours * extraHourlyRate;

            return {
               workedHoursMonth: summary.workedHoursMonth + hours,
               payrollAmount: summary.payrollAmount + payout,
            };
         },
         { workedHoursMonth: 0, payrollAmount: 0 },
      );
}

export async function GET(req: Request) {
   try {
      const { staff: currentStaff } = await requireErpPermission(req, "overview", "view");

      const { periodStart, periodEnd } = getMonthBounds();
      const { weekStart, weekEnd } = getWeekBounds();

      const [
         branchCountResult,
         staffCountResult,
         taskCountResult,
         shiftResult,
         monthShiftResult,
         compensationResult,
         metricResult,
         kpiTargetResult,
      ] = await Promise.all([
         supabaseAdmin
            .from("branches")
            .select("*", { count: "exact", head: true })
            .eq("id", currentStaff.primaryBranchId || "00000000-0000-0000-0000-000000000000")
            .eq("active", true),
         supabaseAdmin
            .from("staff_profiles")
            .select("*", { count: "exact", head: true })
            .eq("user_id", currentStaff.userId)
            .eq("active", true),
         supabaseAdmin
            .from("task_templates")
            .select("*", { count: "exact", head: true })
            .eq("assigned_to", currentStaff.userId)
            .eq("active", true),
         supabaseAdmin
            .from("shifts")
            .select("id, staff_user_id, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, absence_reason, note, created_at, updated_at")
            .eq("staff_user_id", currentStaff.userId)
            .gte("shift_date", weekStart)
            .lte("shift_date", weekEnd),
         supabaseAdmin
            .from("shifts")
            .select(
               "id, staff_user_id, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, absence_reason, note, created_at, updated_at, staff_profiles(role)",
            )
            .eq("staff_user_id", currentStaff.userId)
            .gte("shift_date", periodStart)
            .lte("shift_date", periodEnd),
         supabaseAdmin
            .from("erp_role_compensation_settings")
            .select("role, hourly_rate, extra_hours_enabled, extra_hourly_rate, extra_hours_threshold, updated_at"),
         supabaseAdmin
            .from("daily_metrics")
            .select(
               "id, branch_id, metric_date, leads_count, trial_lessons_count, conversions_count, active_students_count, revenue_amount, debt_amount, refunds_amount, attendance_count, note, created_by, created_at, updated_at",
            )
            .eq("created_by", currentStaff.userId)
            .gte("metric_date", periodStart)
            .lte("metric_date", periodEnd),
         supabaseAdmin
            .from("kpi_targets")
            .select(
               "id, kpi_definition_id, staff_user_id, branch_id, period_start, period_end, target_value, created_by, created_at, updated_at",
            )
            .eq("staff_user_id", currentStaff.userId)
            .lte("period_start", periodEnd)
            .gte("period_end", periodStart),
      ]);

      if (
         branchCountResult.error ||
         staffCountResult.error ||
         shiftResult.error ||
         monthShiftResult.error ||
         compensationResult.error ||
         metricResult.error ||
         kpiTargetResult.error
      ) {
         throw new Error("Failed to load Amir Temur overview. Apply supabase/erp_core_schema.sql first.");
      }

      const kpiTargets = (kpiTargetResult.data || []) as KpiTarget[];
      const kpiTargetIds = kpiTargets.map((target) => target.id);
      let kpiProgressEntries: KpiProgressEntry[] = [];

      if (kpiTargetIds.length > 0) {
         const { data, error } = await supabaseAdmin
            .from("kpi_progress_entries")
            .select("id, kpi_target_id, entry_date, value, note, created_by, created_at")
            .in("kpi_target_id", kpiTargetIds)
            .gte("entry_date", periodStart)
            .lte("entry_date", periodEnd);

         if (error) {
            throw new Error("Failed to load KPI overview progress.");
         }

         kpiProgressEntries = (data || []) as KpiProgressEntry[];
      }

      const shifts = (shiftResult.data || []) as Shift[];
      const payrollSummary = summarizePayroll(
         (monthShiftResult.data || []) as unknown as PayrollShiftRow[],
         (compensationResult.data || []) as ErpRoleCompensationSetting[],
      );
      const metrics = (metricResult.data || []) as DailyMetric[];
      const metricSummary = summarizeMetrics(metrics);
      const conversionRate =
         metricSummary.trialLessonsCount === 0
            ? 0
            : Math.round((metricSummary.conversionsCount / metricSummary.trialLessonsCount) * 100);

      return NextResponse.json({
         periods: {
            month: { periodStart, periodEnd },
            week: { weekStart, weekEnd },
         },
         summary: {
            activeBranches: branchCountResult.count || 0,
            activeStaff: staffCountResult.count || 0,
            activeTasks: taskCountResult.error ? 0 : taskCountResult.count || 0,
            kpiAverage: getKpiAverage(kpiTargets, kpiProgressEntries),
            kpiTargets: kpiTargets.length,
            weeklyShifts: shifts.length,
            shiftIssues: shifts.filter((shift) => shift.absence_reason).length,
            leadsCount: metricSummary.leadsCount,
            trialLessonsCount: metricSummary.trialLessonsCount,
            conversionsCount: metricSummary.conversionsCount,
            conversionRate,
            revenueAmount: metricSummary.revenueAmount,
            debtAmount: metricSummary.debtAmount,
            attendanceCount: metricSummary.attendanceCount,
            workedHoursMonth: Math.round(payrollSummary.workedHoursMonth * 100) / 100,
            payrollAmount: Math.round(payrollSummary.payrollAmount),
         },
      });
   } catch (error) {
      return jsonError(error, "Failed to load Amir Temur overview.");
   }
}
