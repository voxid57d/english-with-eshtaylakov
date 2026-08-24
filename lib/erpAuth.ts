import type { User } from "@supabase/supabase-js";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import {
   ERP_MODULES,
   ERP_ROLE_LABELS,
   type ErpAction,
   type ErpModule,
   type ErpRolePermission,
   type ErpStaffRole,
} from "@/lib/erp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type ErpStaffContext = {
   userId: string;
   fullName: string;
   role: ErpStaffRole;
   roleLabel: string;
   primaryBranchId: string | null;
   branchName: string | null;
   active: boolean;
};

export type ErpPermissions = Record<ErpModule, ErpAction[]>;

const FALLBACK_PERMISSIONS: Record<ErpStaffRole, ErpPermissions> = {
   admin: {
      overview: ["view"],
      branches: ["view", "manage"],
      staff: ["view", "manage"],
      tasks: ["view", "manage"],
      kpi: ["view", "manage"],
      shifts: ["view", "manage"],
      metrics: ["view", "manage"],
      settings: ["view", "manage"],
   },
   branch_manager: {
      overview: ["view"],
      branches: ["view", "manage"],
      staff: ["view", "manage"],
      tasks: ["view", "manage"],
      kpi: ["view", "manage"],
      shifts: ["view", "manage"],
      metrics: ["view", "manage"],
      settings: ["view", "manage"],
   },
   sales_manager: {
      overview: ["view"],
      branches: ["view"],
      staff: [],
      tasks: ["view", "manage"],
      kpi: ["view", "manage"],
      shifts: ["view", "manage"],
      metrics: ["view", "manage"],
      settings: [],
   },
   salesman: {
      overview: ["view"],
      branches: [],
      staff: [],
      tasks: ["view"],
      kpi: ["view"],
      shifts: ["view"],
      metrics: [],
      settings: [],
   },
   assistant: {
      overview: ["view"],
      branches: ["view"],
      staff: [],
      tasks: ["view"],
      kpi: ["view"],
      shifts: ["view"],
      metrics: ["view", "manage"],
      settings: [],
   },
   cashier: {
      overview: ["view"],
      branches: ["view"],
      staff: [],
      tasks: ["view"],
      kpi: ["view"],
      shifts: ["view"],
      metrics: ["view", "manage"],
      settings: [],
   },
};

function getAdminUserIds() {
   return new Set(
      (process.env.ADMIN_USER_IDS || "")
         .split(",")
         .map((value) => value.trim())
         .filter(Boolean),
   );
}

function getAdminEmails() {
   return new Set(
      (process.env.ADMIN_EMAILS || "")
         .split(",")
         .map((value) => value.trim().toLowerCase())
         .filter(Boolean),
   );
}

function getDisplayName(user: User) {
   const metadataName =
      typeof user.user_metadata?.full_name === "string"
         ? user.user_metadata.full_name
         : typeof user.user_metadata?.name === "string"
           ? user.user_metadata.name
           : typeof user.user_metadata?.username === "string"
             ? user.user_metadata.username
             : "";

   return metadataName.trim() || user.email || "New staff member";
}

function isConfiguredAdmin(user: User) {
   const adminUserIds = getAdminUserIds();
   const adminEmails = getAdminEmails();
   const email = user.email?.trim().toLowerCase() || "";

   return adminUserIds.has(user.id) || (email ? adminEmails.has(email) : false);
}

function toStaffContext(row: {
   user_id: string;
   full_name: string;
   role: ErpStaffRole;
   primary_branch_id: string | null;
   active: boolean;
   branches?: { name?: string | null } | null;
}): ErpStaffContext {
   return {
      userId: row.user_id,
      fullName: row.full_name,
      role: row.role,
      roleLabel: ERP_ROLE_LABELS[row.role],
      primaryBranchId: row.primary_branch_id,
      branchName: row.branches?.name ?? null,
      active: row.active,
   };
}

function emptyPermissions(): ErpPermissions {
   return ERP_MODULES.reduce((permissions, erpModule) => {
      permissions[erpModule] = [];
      return permissions;
   }, {} as ErpPermissions);
}

function permissionsFromRows(rows: ErpRolePermission[]) {
   const permissionsByRole = {} as Record<ErpStaffRole, ErpPermissions>;

   for (const role of Object.keys(FALLBACK_PERMISSIONS) as ErpStaffRole[]) {
      permissionsByRole[role] = emptyPermissions();
   }

   for (const row of rows) {
      const actions: ErpAction[] = [];
      if (row.can_view) actions.push("view");
      if (row.can_manage) actions.push("manage");
      permissionsByRole[row.role][row.module] = actions;
   }

   return permissionsByRole;
}

export function getFallbackErpPermissions(role: ErpStaffRole) {
   return FALLBACK_PERMISSIONS[role];
}

export async function getAllErpPermissions() {
   const { data, error } = await supabaseAdmin
      .from("erp_role_permissions")
      .select("role, module, can_view, can_manage, updated_at");

   if (error) {
      return FALLBACK_PERMISSIONS;
   }

   return permissionsFromRows((data || []) as ErpRolePermission[]);
}

export async function getErpPermissions(role: ErpStaffRole) {
   const permissions = await getAllErpPermissions();
   return permissions[role] || FALLBACK_PERMISSIONS[role];
}

export async function canErp(role: ErpStaffRole, module: ErpModule, action: ErpAction) {
   const permissions = await getErpPermissions(role);
   return permissions[module].includes(action);
}

export async function requireErpStaff(req: Request) {
   const user = await requireAuthenticatedUser(req);
   const configuredAdmin = isConfiguredAdmin(user);

   const { data: existing, error: existingError } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
      .eq("user_id", user.id)
      .maybeSingle();

   if (existingError) {
      throw new Error("Failed to load Amir Temur staff profile. Apply supabase/erp_core_schema.sql first.");
   }

   if (existing) {
      if (existing.active !== true) {
         throw new Error("Amir Temur access is disabled for this account.");
      }

      if (configuredAdmin && existing.role !== "branch_manager") {
         const { data, error } = await supabaseAdmin
            .from("staff_profiles")
            .update({ role: "branch_manager" })
            .eq("user_id", user.id)
            .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
            .single();

         if (error || !data) {
            throw new Error("Failed to update Amir Temur staff profile.");
         }

         return { user, staff: toStaffContext(data as unknown as Parameters<typeof toStaffContext>[0]) };
      }

      return {
         user,
         staff: toStaffContext(existing as unknown as Parameters<typeof toStaffContext>[0]),
      };
   }

   if (!configuredAdmin) {
      throw new Error("Amir Temur staff access is not enabled for this account.");
   }

   const { data, error } = await supabaseAdmin
      .from("staff_profiles")
      .insert({
         user_id: user.id,
         full_name: getDisplayName(user),
         role: "branch_manager",
         primary_branch_id: null,
      })
      .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
      .single();

   if (error || !data) {
      throw new Error("Failed to create Amir Temur staff profile.");
   }

   return { user, staff: toStaffContext(data as unknown as Parameters<typeof toStaffContext>[0]) };
}

export async function requireErpPermission(
   req: Request,
   module: ErpModule,
   action: ErpAction,
) {
   const context = await requireErpStaff(req);

   if (!(await canErp(context.staff.role, module, action))) {
      throw new Error("Forbidden.");
   }

   return context;
}
