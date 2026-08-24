import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   getMonthBounds,
   isDateString,
   isErpStaffRole,
   nullableString,
   type Branch,
   type ErpStaffRole,
   type KpiDefinition,
   type KpiProgressEntry,
   type KpiTarget,
   type StaffProfile,
} from "@/lib/erp";
import { requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type KpiTargetRow = KpiTarget & {
   kpi_definitions?: Pick<KpiDefinition, "id" | "name" | "unit" | "role"> | null;
   staff_profiles?: Pick<StaffProfile, "user_id" | "full_name" | "role"> | null;
   branches?: Pick<Branch, "id" | "name"> | null;
};

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function toDefinition(row: KpiDefinition) {
   return {
      id: row.id,
      name: row.name,
      description: row.description,
      role: row.role,
      roleLabel: ERP_ROLE_LABELS[row.role],
      unit: row.unit,
      active: row.active,
   };
}

function getStatus(percentage: number) {
   if (percentage >= 100) return "achieved";
   if (percentage >= 70) return "on_track";
   return "behind";
}

function toTarget(row: KpiTargetRow, progressEntries: KpiProgressEntry[]) {
   const progressValue = progressEntries.reduce(
      (sum, entry) => sum + Number(entry.value || 0),
      0,
   );
   const targetValue = Number(row.target_value || 0);
   const percentage =
      targetValue <= 0 ? 0 : Math.min(999, Math.round((progressValue / targetValue) * 100));

   return {
      id: row.id,
      definitionId: row.kpi_definition_id,
      definitionName: row.kpi_definitions?.name ?? "KPI",
      unit: row.kpi_definitions?.unit ?? "count",
      role: row.kpi_definitions?.role ?? null,
      roleLabel: row.kpi_definitions?.role
         ? ERP_ROLE_LABELS[row.kpi_definitions.role]
         : null,
      staffUserId: row.staff_user_id,
      staffName: row.staff_profiles?.full_name ?? null,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? null,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      targetValue,
      progressValue,
      percentage,
      status: getStatus(percentage),
   };
}

function parseNumber(value: unknown, label: string) {
   const numberValue = Number(value);
   if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new Error(`${label} must be a positive number.`);
   }
   return numberValue;
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "kpi", "view");

      const url = new URL(req.url);
      const fallbackPeriod = getMonthBounds();
      const periodStart = url.searchParams.get("periodStart") || fallbackPeriod.periodStart;
      const periodEnd = url.searchParams.get("periodEnd") || fallbackPeriod.periodEnd;

      if (!isDateString(periodStart) || !isDateString(periodEnd)) {
         throw new Error("Valid KPI period dates are required.");
      }

      const [definitionResult, targetResult, staffResult, branchResult] =
         await Promise.all([
            supabaseAdmin
               .from("kpi_definitions")
               .select("id, name, description, role, unit, active, created_at, updated_at")
               .order("active", { ascending: false })
               .order("role", { ascending: true })
               .order("name", { ascending: true }),
            supabaseAdmin
               .from("kpi_targets")
               .select(
                  "id, kpi_definition_id, staff_user_id, branch_id, period_start, period_end, target_value, created_by, created_at, updated_at, kpi_definitions(id, name, unit, role), staff_profiles(user_id, full_name, role), branches(id, name)",
               )
               .lte("period_start", periodEnd)
               .gte("period_end", periodStart)
               .order("period_start", { ascending: false }),
            supabaseAdmin
               .from("staff_profiles")
               .select("user_id, full_name, role, primary_branch_id, telegram_username, phone, notes, active, created_at, updated_at")
               .eq("active", true)
               .order("full_name", { ascending: true }),
            supabaseAdmin
               .from("branches")
               .select("id, name, address, phone, active, created_at, updated_at")
               .eq("active", true)
               .order("name", { ascending: true }),
         ]);

      if (
         definitionResult.error ||
         targetResult.error ||
         staffResult.error ||
         branchResult.error
      ) {
         throw new Error("Failed to load KPI data. Apply supabase/erp_core_schema.sql first.");
      }

      const targets = (targetResult.data || []) as unknown as KpiTargetRow[];
      const targetIds = targets.map((target) => target.id);
      let progressEntries: KpiProgressEntry[] = [];

      if (targetIds.length > 0) {
         const { data, error } = await supabaseAdmin
            .from("kpi_progress_entries")
            .select("id, kpi_target_id, entry_date, value, note, created_by, created_at")
            .in("kpi_target_id", targetIds)
            .gte("entry_date", periodStart)
            .lte("entry_date", periodEnd)
            .order("entry_date", { ascending: false });

         if (error) {
            throw new Error("Failed to load KPI progress.");
         }

         progressEntries = (data || []) as KpiProgressEntry[];
      }

      const progressByTarget = new Map<string, KpiProgressEntry[]>();
      for (const entry of progressEntries) {
         const current = progressByTarget.get(entry.kpi_target_id) || [];
         current.push(entry);
         progressByTarget.set(entry.kpi_target_id, current);
      }

      return NextResponse.json({
         period: { periodStart, periodEnd },
         definitions: ((definitionResult.data || []) as KpiDefinition[]).map(toDefinition),
         targets: targets.map((target) =>
            toTarget(target, progressByTarget.get(target.id) || []),
         ),
         progressEntries: progressEntries.map((entry) => ({
            id: entry.id,
            targetId: entry.kpi_target_id,
            entryDate: entry.entry_date,
            value: Number(entry.value || 0),
            note: entry.note,
         })),
         staff: ((staffResult.data || []) as StaffProfile[]).map((member) => ({
            userId: member.user_id,
            fullName: member.full_name,
            role: member.role,
            roleLabel: ERP_ROLE_LABELS[member.role],
         })),
         branches: ((branchResult.data || []) as Branch[]).map((branch) => ({
            id: branch.id,
            name: branch.name,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load KPI data.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "kpi", "manage");
      const body = await req.json();
      const action = cleanString(body?.action);

      if (action === "definition") {
         const name = cleanString(body?.name);
         const role = cleanString(body?.role);

         if (!name) {
            throw new Error("KPI name is required.");
         }

         if (!isErpStaffRole(role)) {
            throw new Error("Choose a valid KPI role.");
         }

         const { data, error } = await supabaseAdmin
            .from("kpi_definitions")
            .insert({
               name,
               description: nullableString(body?.description),
               role,
               unit: cleanString(body?.unit) || "count",
               active: body?.active !== false,
            })
            .select("id, name, description, role, unit, active, created_at, updated_at")
            .single();

         if (error || !data) {
            throw new Error("Failed to create KPI definition.");
         }

         return NextResponse.json({ definition: toDefinition(data as KpiDefinition) });
      }

      if (action === "target") {
         const definitionId = cleanString(body?.definitionId);
         const ownerType = cleanString(body?.ownerType);
         const staffUserId = ownerType === "staff" ? nullableString(body?.staffUserId) : null;
         const branchId = ownerType === "branch" ? nullableString(body?.branchId) : null;
         const periodStart = cleanString(body?.periodStart);
         const periodEnd = cleanString(body?.periodEnd);

         if (!definitionId) throw new Error("Choose a KPI definition.");
         if (!staffUserId && !branchId) throw new Error("Choose a staff member or branch.");
         if (!isDateString(periodStart) || !isDateString(periodEnd)) {
            throw new Error("Valid target period dates are required.");
         }

         const { data, error } = await supabaseAdmin
            .from("kpi_targets")
            .insert({
               kpi_definition_id: definitionId,
               staff_user_id: staffUserId,
               branch_id: branchId,
               period_start: periodStart,
               period_end: periodEnd,
               target_value: parseNumber(body?.targetValue, "Target value"),
               created_by: user.id,
            })
            .select("id")
            .single();

         if (error || !data) {
            throw new Error("Failed to create KPI target.");
         }

         return NextResponse.json({ target: data });
      }

      if (action === "progress") {
         const targetId = cleanString(body?.targetId);
         const entryDate = cleanString(body?.entryDate);

         if (!targetId) throw new Error("Choose a KPI target.");
         if (!isDateString(entryDate)) throw new Error("Valid progress date is required.");

         const { data, error } = await supabaseAdmin
            .from("kpi_progress_entries")
            .insert({
               kpi_target_id: targetId,
               entry_date: entryDate,
               value: parseNumber(body?.value, "Progress value"),
               note: nullableString(body?.note),
               created_by: user.id,
            })
            .select("id")
            .single();

         if (error || !data) {
            throw new Error("Failed to add KPI progress.");
         }

         return NextResponse.json({ progressEntry: data });
      }

      throw new Error("Choose a valid KPI action.");
   } catch (error) {
      return jsonError(error, "Failed to save KPI data.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "kpi", "manage");
      const body = await req.json();
      const action = cleanString(body?.action);

      if (action !== "definition") {
         throw new Error("Only KPI definitions can be updated here.");
      }

      const id = cleanString(body?.id);
      const name = cleanString(body?.name);
      const role = cleanString(body?.role);

      if (!id) throw new Error("KPI definition ID is required.");
      if (!name) throw new Error("KPI name is required.");
      if (!isErpStaffRole(role)) throw new Error("Choose a valid KPI role.");

      const { data, error } = await supabaseAdmin
         .from("kpi_definitions")
         .update({
            name,
            description: nullableString(body?.description),
            role: role as ErpStaffRole,
            unit: cleanString(body?.unit) || "count",
            active: body?.active !== false,
         })
         .eq("id", id)
         .select("id, name, description, role, unit, active, created_at, updated_at")
         .single();

      if (error || !data) {
         throw new Error("Failed to update KPI definition.");
      }

      return NextResponse.json({ definition: toDefinition(data as KpiDefinition) });
   } catch (error) {
      return jsonError(error, "Failed to update KPI data.");
   }
}
