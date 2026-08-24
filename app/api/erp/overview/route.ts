import { NextResponse } from "next/server";
import {
   erpJsonError,
   getMonthBounds,
   getWeekBounds,
   type DailyMetric,
   type KpiProgressEntry,
   type KpiTarget,
   type Shift,
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

   const progressByTarget = new Map<string, number>();
   for (const entry of progressEntries) {
      progressByTarget.set(
         entry.kpi_target_id,
         (progressByTarget.get(entry.kpi_target_id) || 0) + Number(entry.value || 0),
      );
   }

   const totalPercentage = targets.reduce((sum, target) => {
      const targetValue = Number(target.target_value || 0);
      if (targetValue <= 0) return sum;
      const progressValue = progressByTarget.get(target.id) || 0;
      return sum + Math.min(999, Math.round((progressValue / targetValue) * 100));
   }, 0);

   return Math.round(totalPercentage / targets.length);
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "overview", "view");

      const { periodStart, periodEnd } = getMonthBounds();
      const { weekStart, weekEnd } = getWeekBounds();

      const [
         branchCountResult,
         staffCountResult,
         taskCountResult,
         shiftResult,
         metricResult,
         kpiTargetResult,
      ] = await Promise.all([
         supabaseAdmin
            .from("branches")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
         supabaseAdmin
            .from("staff_profiles")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
         supabaseAdmin
            .from("task_templates")
            .select("*", { count: "exact", head: true })
            .eq("active", true),
         supabaseAdmin
            .from("shifts")
            .select("id, staff_user_id, branch_id, shift_date, starts_at, ends_at, status, approved_by, note, created_at, updated_at")
            .gte("shift_date", weekStart)
            .lte("shift_date", weekEnd),
         supabaseAdmin
            .from("daily_metrics")
            .select(
               "id, branch_id, metric_date, leads_count, trial_lessons_count, conversions_count, active_students_count, revenue_amount, debt_amount, refunds_amount, attendance_count, note, created_by, created_at, updated_at",
            )
            .gte("metric_date", periodStart)
            .lte("metric_date", periodEnd),
         supabaseAdmin
            .from("kpi_targets")
            .select(
               "id, kpi_definition_id, staff_user_id, branch_id, period_start, period_end, target_value, created_by, created_at, updated_at",
            )
            .lte("period_start", periodEnd)
            .gte("period_end", periodStart),
      ]);

      if (
         branchCountResult.error ||
         staffCountResult.error ||
         shiftResult.error ||
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
            shiftIssues: shifts.filter((shift) =>
               ["late", "absent"].includes(shift.status),
            ).length,
            leadsCount: metricSummary.leadsCount,
            trialLessonsCount: metricSummary.trialLessonsCount,
            conversionsCount: metricSummary.conversionsCount,
            conversionRate,
            revenueAmount: metricSummary.revenueAmount,
            debtAmount: metricSummary.debtAmount,
            attendanceCount: metricSummary.attendanceCount,
         },
      });
   } catch (error) {
      return jsonError(error, "Failed to load Amir Temur overview.");
   }
}
