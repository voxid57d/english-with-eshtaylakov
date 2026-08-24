import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   getMonthBounds,
   isDateString,
   nullableString,
   type Branch,
   type DailyMetric,
} from "@/lib/erp";
import { requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DailyMetricRow = DailyMetric & {
   branches?: Pick<Branch, "id" | "name"> | null;
};

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function parseNonNegativeNumber(value: unknown, label: string) {
   const numberValue = value === "" || value === null || value === undefined ? 0 : Number(value);
   if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new Error(`${label} must be zero or more.`);
   }
   return numberValue;
}

function parseNonNegativeInteger(value: unknown, label: string) {
   const numberValue = parseNonNegativeNumber(value, label);
   if (!Number.isInteger(numberValue)) {
      throw new Error(`${label} must be a whole number.`);
   }
   return numberValue;
}

function toMetric(row: DailyMetricRow) {
   return {
      id: row.id,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? "Branch",
      metricDate: row.metric_date,
      leadsCount: Number(row.leads_count || 0),
      trialLessonsCount: Number(row.trial_lessons_count || 0),
      conversionsCount: Number(row.conversions_count || 0),
      activeStudentsCount: Number(row.active_students_count || 0),
      revenueAmount: Number(row.revenue_amount || 0),
      debtAmount: Number(row.debt_amount || 0),
      refundsAmount: Number(row.refunds_amount || 0),
      attendanceCount: Number(row.attendance_count || 0),
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function summarizeMetrics(metrics: DailyMetricRow[]) {
   return metrics.reduce(
      (summary, metric) => ({
         leadsCount: summary.leadsCount + Number(metric.leads_count || 0),
         trialLessonsCount:
            summary.trialLessonsCount + Number(metric.trial_lessons_count || 0),
         conversionsCount:
            summary.conversionsCount + Number(metric.conversions_count || 0),
         activeStudentsCount: Math.max(
            summary.activeStudentsCount,
            Number(metric.active_students_count || 0),
         ),
         revenueAmount: summary.revenueAmount + Number(metric.revenue_amount || 0),
         debtAmount: summary.debtAmount + Number(metric.debt_amount || 0),
         refundsAmount: summary.refundsAmount + Number(metric.refunds_amount || 0),
         attendanceCount: summary.attendanceCount + Number(metric.attendance_count || 0),
      }),
      {
         leadsCount: 0,
         trialLessonsCount: 0,
         conversionsCount: 0,
         activeStudentsCount: 0,
         revenueAmount: 0,
         debtAmount: 0,
         refundsAmount: 0,
         attendanceCount: 0,
      },
   );
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "metrics", "view");

      const url = new URL(req.url);
      const fallbackMonth = getMonthBounds();
      const periodStart = url.searchParams.get("periodStart") || fallbackMonth.periodStart;
      const periodEnd = url.searchParams.get("periodEnd") || fallbackMonth.periodEnd;
      const branchId = url.searchParams.get("branchId") || "all";

      if (!isDateString(periodStart) || !isDateString(periodEnd)) {
         throw new Error("Valid metric period dates are required.");
      }

      let metricsQuery = supabaseAdmin
         .from("daily_metrics")
         .select(
            "id, branch_id, metric_date, leads_count, trial_lessons_count, conversions_count, active_students_count, revenue_amount, debt_amount, refunds_amount, attendance_count, note, created_by, created_at, updated_at, branches(id, name)",
         )
         .gte("metric_date", periodStart)
         .lte("metric_date", periodEnd)
         .order("metric_date", { ascending: false });

      if (branchId !== "all") {
         metricsQuery = metricsQuery.eq("branch_id", branchId);
      }

      const [metricResult, branchResult] = await Promise.all([
         metricsQuery,
         supabaseAdmin
            .from("branches")
            .select("id, name, address, phone, active, created_at, updated_at")
            .eq("active", true)
            .order("name", { ascending: true }),
      ]);

      if (metricResult.error || branchResult.error) {
         throw new Error("Failed to load metrics. Apply supabase/erp_core_schema.sql first.");
      }

      const metricRows = (metricResult.data || []) as unknown as DailyMetricRow[];

      return NextResponse.json({
         period: { periodStart, periodEnd },
         metrics: metricRows.map(toMetric),
         summary: summarizeMetrics(metricRows),
         branches: ((branchResult.data || []) as Branch[]).map((branch) => ({
            id: branch.id,
            name: branch.name,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load metrics.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "metrics", "manage");
      const body = await req.json();
      const branchId = cleanString(body?.branchId);
      const metricDate = cleanString(body?.metricDate);

      if (!branchId) throw new Error("Choose a branch.");
      if (!isDateString(metricDate)) throw new Error("Valid metric date is required.");

      const payload = {
         branch_id: branchId,
         metric_date: metricDate,
         leads_count: parseNonNegativeInteger(body?.leadsCount, "Leads"),
         trial_lessons_count: parseNonNegativeInteger(
            body?.trialLessonsCount,
            "Trial lessons",
         ),
         conversions_count: parseNonNegativeInteger(body?.conversionsCount, "Conversions"),
         active_students_count: parseNonNegativeInteger(
            body?.activeStudentsCount,
            "Active students",
         ),
         revenue_amount: parseNonNegativeNumber(body?.revenueAmount, "Revenue"),
         debt_amount: parseNonNegativeNumber(body?.debtAmount, "Debt"),
         refunds_amount: parseNonNegativeNumber(body?.refundsAmount, "Refunds"),
         attendance_count: parseNonNegativeInteger(body?.attendanceCount, "Attendance"),
         note: nullableString(body?.note),
         created_by: user.id,
      };

      const { data, error } = await supabaseAdmin
         .from("daily_metrics")
         .upsert(payload, { onConflict: "branch_id,metric_date" })
         .select(
            "id, branch_id, metric_date, leads_count, trial_lessons_count, conversions_count, active_students_count, revenue_amount, debt_amount, refunds_amount, attendance_count, note, created_by, created_at, updated_at, branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to save metric entry.");
      }

      return NextResponse.json({ metric: toMetric(data as unknown as DailyMetricRow) });
   } catch (error) {
      return jsonError(error, "Failed to save metrics.");
   }
}

export async function PATCH(req: Request) {
   return POST(req);
}
