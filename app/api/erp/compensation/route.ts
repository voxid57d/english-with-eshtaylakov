import { NextResponse } from "next/server";
import {
   erpJsonError,
   ERP_ROLE_LABELS,
   ERP_SHIFT_WORKER_ROLES,
   isErpStaffRole,
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

function defaultRows() {
   return ERP_SHIFT_WORKER_ROLES.map((role) => ({
      role,
      roleLabel: ERP_ROLE_LABELS[role],
      hourlyRate: 0,
      extraHoursEnabled: false,
      extraHourlyRate: 0,
      extraHoursThreshold: 8,
   }));
}

function toRows(settings: ErpRoleCompensationSetting[]) {
   const byRole = new Map(settings.map((setting) => [setting.role, setting]));

   return ERP_SHIFT_WORKER_ROLES.map((role) => {
      const setting = byRole.get(role);

      return {
         role,
         roleLabel: ERP_ROLE_LABELS[role],
         hourlyRate: Number(setting?.hourly_rate ?? 0),
         extraHoursEnabled: Boolean(setting?.extra_hours_enabled ?? false),
         extraHourlyRate: Number(setting?.extra_hourly_rate ?? 0),
         extraHoursThreshold: Number(setting?.extra_hours_threshold ?? 8),
      };
   });
}

async function loadRows() {
   const { data, error } = await supabaseAdmin
      .from("erp_role_compensation_settings")
      .select("role, hourly_rate, extra_hours_enabled, extra_hourly_rate, extra_hours_threshold, updated_at")
      .order("role", { ascending: true });

   if (error) {
      throw new Error("Failed to load role hourly rates. Apply supabase/erp_core_schema.sql first.");
   }

   return toRows((data || []) as ErpRoleCompensationSetting[]);
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "settings", "view");
      return NextResponse.json({ rows: await loadRows() });
   } catch (error) {
      return jsonError(error, "Failed to load role hourly rates.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");
      const body = await req.json();
      const role = body?.role;

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
               hourly_rate: hourlyRate,
               extra_hours_enabled: extraHoursEnabled,
               extra_hourly_rate: extraHourlyRate,
               extra_hours_threshold: extraHoursThreshold,
            },
            { onConflict: "role" },
         );

      if (error) {
         throw new Error("Failed to update role hourly rate.");
      }

      return NextResponse.json({ rows: await loadRows() });
   } catch (error) {
      return jsonError(error, "Failed to update role hourly rate.");
   }
}

export async function POST(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");

      const rows = defaultRows().map((row) => ({
         role: row.role,
         hourly_rate: row.hourlyRate,
         extra_hours_enabled: row.extraHoursEnabled,
         extra_hourly_rate: row.extraHourlyRate,
         extra_hours_threshold: row.extraHoursThreshold,
      }));

      const { error } = await supabaseAdmin
         .from("erp_role_compensation_settings")
         .upsert(rows, { onConflict: "role" });

      if (error) {
         throw new Error("Failed to reset role hourly rates.");
      }

      return NextResponse.json({ rows: await loadRows() });
   } catch (error) {
      return jsonError(error, "Failed to reset role hourly rates.");
   }
}
