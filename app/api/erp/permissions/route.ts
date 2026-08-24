import { NextResponse } from "next/server";
import {
   erpJsonError,
   ERP_ACTIONS,
   ERP_MODULES,
   ERP_STAFF_ROLES,
   isErpModule,
   isErpStaffRole,
   type ErpAction,
   type ErpRolePermission,
   type ErpStaffRole,
} from "@/lib/erp";
import {
   getAllErpPermissions,
   getFallbackErpPermissions,
   requireErpPermission,
   type ErpPermissions,
} from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function toRows(permissionsByRole: Record<ErpStaffRole, ErpPermissions>) {
   return ERP_STAFF_ROLES.flatMap((role) =>
      ERP_MODULES.map((module) => {
         const actions = permissionsByRole[role]?.[module] || [];

         return {
            role,
            module,
            canView: actions.includes("view"),
            canManage: actions.includes("manage"),
         };
      }),
   );
}

function normalizeActions(value: unknown): ErpAction[] {
   if (!Array.isArray(value)) return [];

   const actions = value.filter((entry): entry is ErpAction =>
      (ERP_ACTIONS as readonly string[]).includes(String(entry)),
   );

   if (actions.includes("manage") && !actions.includes("view")) {
      actions.push("view");
   }

   return Array.from(new Set(actions));
}

export async function GET(req: Request) {
   try {
      await requireErpPermission(req, "settings", "view");
      const permissionsByRole = await getAllErpPermissions();

      return NextResponse.json({
         roles: ERP_STAFF_ROLES,
         modules: ERP_MODULES,
         rows: toRows(permissionsByRole),
      });
   } catch (error) {
      return jsonError(error, "Failed to load Amir Temur permissions.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");

      const body = await req.json();
      const role = body?.role;
      const erpModule = body?.module;
      const actions = normalizeActions(body?.actions);

      if (!isErpStaffRole(role)) {
         throw new Error("Choose a valid staff role.");
      }

      if (!isErpModule(erpModule)) {
         throw new Error("Choose a valid Amir Temur module.");
      }

      if (role === "admin" && erpModule === "settings" && !actions.includes("manage")) {
         throw new Error("Admin must keep manage access to Settings.");
      }

      const { error } = await supabaseAdmin
         .from("erp_role_permissions")
         .upsert(
            {
               role,
               module: erpModule,
               can_view: actions.includes("view"),
               can_manage: actions.includes("manage"),
            },
            { onConflict: "role,module" },
         );

      if (error) {
         throw new Error("Failed to update Amir Temur permissions. Apply supabase/erp_core_schema.sql first.");
      }

      const permissionsByRole = await getAllErpPermissions();
      return NextResponse.json({ rows: toRows(permissionsByRole) });
   } catch (error) {
      return jsonError(error, "Failed to update Amir Temur permissions.");
   }
}

export async function POST(req: Request) {
   try {
      await requireErpPermission(req, "settings", "manage");

      const rows = ERP_STAFF_ROLES.flatMap((role) => {
         const permissions = getFallbackErpPermissions(role);

         return ERP_MODULES.map((module) => ({
            role,
            module,
            can_view: permissions[module].includes("view"),
            can_manage: permissions[module].includes("manage"),
         }));
      });

      const { data, error } = await supabaseAdmin
         .from("erp_role_permissions")
         .upsert(rows, { onConflict: "role,module" })
         .select("role, module, can_view, can_manage, updated_at");

      if (error) {
         throw new Error("Failed to reset Amir Temur permissions.");
      }

      const permissionsByRole = {} as Record<ErpStaffRole, ErpPermissions>;
      for (const role of ERP_STAFF_ROLES) {
         permissionsByRole[role] = getFallbackErpPermissions(role);
      }

      return NextResponse.json({
         rows: toRows(permissionsByRole),
         savedRows: (data || []) as ErpRolePermission[],
      });
   } catch (error) {
      return jsonError(error, "Failed to reset Amir Temur permissions.");
   }
}
