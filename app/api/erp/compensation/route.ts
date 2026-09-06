import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   ERP_SHIFT_WORKER_ROLES,
   isErpStaffRole,
   type ErpPenaltyRule,
   type ErpRoleCompensationSetting,
} from "@/lib/erp";
import { requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function toNumber(value: unknown, fieldName: string) {
   const numberValue = Number(value);

   if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new Error(`${fieldName} must be zero or higher.`);
   }

   return numberValue;
}

function cleanSalaryTier(value: unknown) {
   const tier = cleanString(value);
   return tier || "default";
}

function defaultRows() {
   return [
      ...["tier_1", "tier_2", "tier_3", "tier_4"].map((salaryTier) => ({
         role: "salesman" as const,
         salaryTier,
         roleLabel: `${ERP_ROLE_LABELS.salesman} ${salaryTier.replace("_", " ")}`,
         hourlyRate: 0,
         extraHoursEnabled: true,
         extraHourlyRate: 0,
         extraHoursThreshold: 8,
      })),
      ...ERP_SHIFT_WORKER_ROLES.filter((role) => role !== "salesman").map((role) => ({
      role,
      salaryTier: "default",
      roleLabel: ERP_ROLE_LABELS[role],
      hourlyRate: 0,
      extraHoursEnabled: true,
      extraHourlyRate: 0,
      extraHoursThreshold: 8,
      })),
   ];
}

function toRows(settings: ErpRoleCompensationSetting[]) {
   const byRoleTier = new Map(
      settings.map((setting) => [`${setting.role}:${setting.salary_tier}`, setting]),
   );

   return defaultRows().map((row) => {
      const setting = byRoleTier.get(`${row.role}:${row.salaryTier}`);

      return {
         role: row.role,
         salaryTier: row.salaryTier,
         roleLabel: row.roleLabel,
         hourlyRate: Number(setting?.hourly_rate ?? 0),
         extraHoursEnabled: Boolean(setting?.extra_hours_enabled ?? row.extraHoursEnabled),
         extraHourlyRate: Number(setting?.extra_hourly_rate ?? 0),
         extraHoursThreshold: Number(setting?.extra_hours_threshold ?? 8),
      };
   });
}

async function loadRows() {
   const { data, error } = await supabaseAdmin
      .from("erp_role_compensation_settings")
      .select("role, salary_tier, hourly_rate, extra_hours_enabled, extra_hourly_rate, extra_hours_threshold, updated_at")
      .order("role", { ascending: true });

   if (error) {
      throw new Error("Failed to load role hourly rates. Apply supabase/erp_core_schema.sql first.");
   }

   return toRows((data || []) as ErpRoleCompensationSetting[]);
}

async function loadPenaltyRules() {
   const { data, error } = await supabaseAdmin
      .from("erp_penalty_rules")
      .select("penalty_number, label, amount, active, updated_at")
      .order("penalty_number", { ascending: true });

   if (error) {
      throw new Error("Failed to load penalty rules. Apply supabase/erp_core_schema.sql first.");
   }

   return (data || []) as ErpPenaltyRule[];
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "settings", "view");
      const [rows, penaltyRules] = await Promise.all([loadRows(), loadPenaltyRules()]);
      return NextResponse.json({ rows, penaltyRules });
   } catch (error) {
      return jsonError(error, "Failed to load role hourly rates.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");
      const body = await req.json();

      if (body?.action === "penaltyRule") {
         const penaltyNumber = Number(body?.penaltyNumber);
         const label = cleanString(body?.label);
         const amount = toNumber(body?.amount, "Penalty amount");

         if (!Number.isInteger(penaltyNumber) || penaltyNumber < 1) {
            throw new Error("Choose a valid penalty number.");
         }

         if (!label) {
            throw new Error("Penalty label is required.");
         }

         const { error } = await supabaseAdmin
            .from("erp_penalty_rules")
            .upsert(
               {
                  penalty_number: penaltyNumber,
                  label,
                  amount,
                  active: body?.active !== false,
               },
               { onConflict: "penalty_number" },
            );

         if (error) {
            throw new Error("Failed to update penalty rule.");
         }

         return NextResponse.json({
            rows: await loadRows(),
            penaltyRules: await loadPenaltyRules(),
         });
      }

      const role = body?.role;
      const salaryTier = cleanSalaryTier(body?.salaryTier);

      if (!isErpStaffRole(role)) {
         throw new Error("Choose a valid staff role.");
      }

      if (!(ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(role)) {
         throw new Error("This role does not use shift hourly rates.");
      }

      const hourlyRate = toNumber(body?.hourlyRate, "Hourly rate");
      const extraHourlyRate = toNumber(body?.extraHourlyRate, "Extra hourly rate");
      const extraHoursThreshold = toNumber(
         body?.extraHoursThreshold,
         "Extra hours threshold",
      );
      const extraHoursEnabled = Boolean(body?.extraHoursEnabled);

      const { error } = await supabaseAdmin
         .from("erp_role_compensation_settings")
         .upsert(
            {
               role,
               salary_tier: role === "salesman" ? salaryTier : "default",
               hourly_rate: hourlyRate,
               extra_hours_enabled: extraHoursEnabled,
               extra_hourly_rate: extraHourlyRate,
               extra_hours_threshold: extraHoursThreshold,
            },
            { onConflict: "role,salary_tier" },
         );

      if (error) {
         throw new Error("Failed to update role hourly rate.");
      }

      return NextResponse.json({ rows: await loadRows(), penaltyRules: await loadPenaltyRules() });
   } catch (error) {
      return jsonError(error, "Failed to update role hourly rate.");
   }
}

export async function POST(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");

      const rows = defaultRows().map((row) => ({
         role: row.role,
         salary_tier: row.salaryTier,
         hourly_rate: row.hourlyRate,
         extra_hours_enabled: row.extraHoursEnabled,
         extra_hourly_rate: row.extraHourlyRate,
         extra_hours_threshold: row.extraHoursThreshold,
      }));

      const { error } = await supabaseAdmin
         .from("erp_role_compensation_settings")
         .upsert(rows, { onConflict: "role,salary_tier" });

      if (error) {
         throw new Error("Failed to reset role hourly rates.");
      }

      return NextResponse.json({ rows: await loadRows(), penaltyRules: await loadPenaltyRules() });
   } catch (error) {
      return jsonError(error, "Failed to reset role hourly rates.");
   }
}
