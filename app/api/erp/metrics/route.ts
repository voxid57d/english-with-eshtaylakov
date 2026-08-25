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

type CashierDebtorEntryType = "daily" | "morning" | "evening";

type CashierDebtorMetricRow = {
   id: string;
   cashier_user_id: string;
   branch_id: string;
   metric_date: string;
   entry_type: CashierDebtorEntryType;
   current_debtors: number;
   frozen_debtors: number;
   archive_debtors: number;
   finished_debtors: number;
   active_students: number;
   archive_students: number;
   finished_students: number;
   total_debtors: number;
   total_students: number;
   debtor_percentage: number;
   note: string | null;
   created_by: string | null;
   created_at: string;
   updated_at: string;
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

function toCashierDebtorMetric(row: CashierDebtorMetricRow) {
   return {
      id: row.id,
      cashierUserId: row.cashier_user_id,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? "Branch",
      metricDate: row.metric_date,
      entryType: row.entry_type,
      currentDebtors: Number(row.current_debtors || 0),
      frozenDebtors: Number(row.frozen_debtors || 0),
      archiveDebtors: Number(row.archive_debtors || 0),
      finishedDebtors: Number(row.finished_debtors || 0),
      activeStudents: Number(row.active_students || 0),
      archiveStudents: Number(row.archive_students || 0),
      finishedStudents: Number(row.finished_students || 0),
      totalDebtors: Number(row.total_debtors || 0),
      totalStudents: Number(row.total_students || 0),
      debtorPercentage: Number(row.debtor_percentage || 0),
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function parseCashierDebtorEntryType(value: unknown): CashierDebtorEntryType {
   if (value === "daily" || value === "morning" || value === "evening") {
      return value;
   }

   throw new Error("Valid debtor metric type is required.");
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
      const { staff } = await requireErpPermission(req, "metrics", "view");

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

      let debtorQuery = supabaseAdmin
         .from("cashier_debtor_metrics")
         .select(
            "id, cashier_user_id, branch_id, metric_date, entry_type, current_debtors, frozen_debtors, archive_debtors, finished_debtors, active_students, archive_students, finished_students, total_debtors, total_students, debtor_percentage, note, created_by, created_at, updated_at, branches(id, name)",
         )
         .gte("metric_date", periodStart)
         .lte("metric_date", periodEnd)
         .order("metric_date", { ascending: false })
         .order("entry_type", { ascending: true });

      if (staff.role === "cashier") {
         debtorQuery = debtorQuery.eq("cashier_user_id", staff.userId);
      }

      if (branchId !== "all") {
         debtorQuery = debtorQuery.eq("branch_id", branchId);
      }

      const [metricResult, branchResult, debtorResult] = await Promise.all([
         metricsQuery,
         supabaseAdmin
            .from("branches")
            .select("id, name, address, phone, active, created_at, updated_at")
            .eq("active", true)
            .order("name", { ascending: true }),
         debtorQuery,
      ]);

      if (metricResult.error || branchResult.error || debtorResult.error) {
         throw new Error("Failed to load metrics. Apply supabase/erp_core_schema.sql first.");
      }

      const metricRows = (metricResult.data || []) as unknown as DailyMetricRow[];
      const debtorRows = (debtorResult.data || []) as unknown as CashierDebtorMetricRow[];

      return NextResponse.json({
         staff: {
            role: staff.role,
            roleLabel: staff.roleLabel,
            primaryBranchId: staff.primaryBranchId,
         },
         period: { periodStart, periodEnd },
         metrics: metricRows.map(toMetric),
         cashierDebtorMetrics: debtorRows.map(toCashierDebtorMetric),
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
      const { user, staff } = await requireErpPermission(req, "metrics", "manage");
      const body = await req.json();

      if (body?.action === "cashierDebtorMetric") {
         const entryType = parseCashierDebtorEntryType(body?.entryType);
         const metricDate = cleanString(body?.metricDate);
         const branchId = cleanString(body?.branchId) || staff.primaryBranchId;

         if (staff.role !== "cashier" && staff.role !== "branch_manager" && staff.role !== "sales_manager") {
            throw new Error("Forbidden.");
         }

         if (!branchId) throw new Error("Choose a branch.");
         if (!isDateString(metricDate)) throw new Error("Valid metric date is required.");

         const cashierUserId =
            staff.role === "cashier" ? staff.userId : cleanString(body?.cashierUserId);

         if (!cashierUserId) throw new Error("Choose a cashier.");

         const currentDebtors = parseNonNegativeInteger(
            body?.currentDebtors,
            "Current debtors",
         );
         const frozenDebtors = parseNonNegativeInteger(
            body?.frozenDebtors,
            "Frozen debtors",
         );
         const archiveDebtors = parseNonNegativeInteger(
            body?.archiveDebtors,
            "Archive debtors",
         );
         const finishedDebtors = parseNonNegativeInteger(
            body?.finishedDebtors,
            "Finished debtors",
         );
         const activeStudents = parseNonNegativeInteger(
            body?.activeStudents,
            "Active students",
         );
         const archiveStudents = parseNonNegativeInteger(
            body?.archiveStudents,
            "Archive students",
         );
         const finishedStudents = parseNonNegativeInteger(
            body?.finishedStudents,
            "Finished students",
         );
         const totalDebtors =
            currentDebtors + frozenDebtors + archiveDebtors + finishedDebtors;
         const totalStudents = activeStudents + archiveStudents + finishedStudents;
         const debtorPercentage =
            totalStudents > 0 ? Number(((totalDebtors / totalStudents) * 100).toFixed(2)) : 0;

         if (totalStudents === 0) {
            throw new Error("Total students must be greater than zero.");
         }

         const { data, error } = await supabaseAdmin
            .from("cashier_debtor_metrics")
            .upsert(
               {
                  cashier_user_id: cashierUserId,
                  branch_id: branchId,
                  metric_date: metricDate,
                  entry_type: entryType,
                  current_debtors: currentDebtors,
                  frozen_debtors: frozenDebtors,
                  archive_debtors: archiveDebtors,
                  finished_debtors: finishedDebtors,
                  active_students: activeStudents,
                  archive_students: archiveStudents,
                  finished_students: finishedStudents,
                  total_debtors: totalDebtors,
                  total_students: totalStudents,
                  debtor_percentage: debtorPercentage,
                  note: nullableString(body?.note),
                  created_by: user.id,
               },
               { onConflict: "cashier_user_id,branch_id,metric_date,entry_type" },
            )
            .select(
               "id, cashier_user_id, branch_id, metric_date, entry_type, current_debtors, frozen_debtors, archive_debtors, finished_debtors, active_students, archive_students, finished_students, total_debtors, total_students, debtor_percentage, note, created_by, created_at, updated_at, branches(id, name)",
            )
            .single();

         if (error || !data) {
            throw new Error("Failed to save debtor metric.");
         }

         return NextResponse.json({
            cashierDebtorMetric: toCashierDebtorMetric(
               data as unknown as CashierDebtorMetricRow,
            ),
         });
      }

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

export async function DELETE(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "metrics", "manage");
      const body = await req.json();

      if (body?.action !== "cashierDebtorMetric") {
         throw new Error("Valid delete action is required.");
      }

      const id = cleanString(body?.id);
      if (!id) throw new Error("Metric id is required.");

      let query = supabaseAdmin.from("cashier_debtor_metrics").delete().eq("id", id);

      if (staff.role === "cashier") {
         query = query.eq("cashier_user_id", staff.userId);
      } else if (staff.role !== "branch_manager" && staff.role !== "sales_manager") {
         throw new Error("Forbidden.");
      }

      const { error } = await query;

      if (error) {
         throw new Error("Failed to delete debtor metric.");
      }

      return NextResponse.json({ ok: true });
   } catch (error) {
      return jsonError(error, "Failed to delete debtor metric.");
   }
}
