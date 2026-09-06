import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   isErpStaffRole,
   nullableString,
   type AuthUserOption,
   type Branch,
   type StaffProfile,
} from "@/lib/erp";
import { canErp, requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type StaffProfileWithBranch = StaffProfile & {
   branches?: Pick<Branch, "id" | "name"> | null;
};

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function toStaff(row: StaffProfileWithBranch) {
   return {
      userId: row.user_id,
      authUserId: row.auth_user_id,
      fullName: row.full_name,
      role: row.role,
      roleLabel: ERP_ROLE_LABELS[row.role],
      salaryTier: row.salary_tier,
      primaryBranchId: row.primary_branch_id,
      branchName: row.branches?.name ?? null,
      telegramUsername: row.telegram_username,
      phone: row.phone,
      notes: row.notes,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function getAuthDisplayName(user: {
   email?: string;
   user_metadata?: Record<string, unknown>;
}) {
   const metadata = user.user_metadata || {};
   const name =
      cleanString(metadata.full_name) ||
      cleanString(metadata.name) ||
      cleanString(metadata.username);

   return name || user.email || "Auth user";
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "staff", "view");
      const canManage = await canErp(staff.role, "staff", "manage");

      const [staffResult, branchResult, authResult] = await Promise.all([
         supabaseAdmin
            .from("staff_profiles")
            .select(
               "user_id, auth_user_id, full_name, role, salary_tier, primary_branch_id, telegram_username, phone, notes, active, created_at, updated_at, branches:primary_branch_id(id, name)",
            )
            .order("active", { ascending: false })
            .order("full_name", { ascending: true }),
         supabaseAdmin
            .from("branches")
            .select("id, name, address, phone, active, created_at, updated_at")
            .eq("active", true)
            .order("name", { ascending: true }),
         canManage
            ? supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
            : Promise.resolve({ data: { users: [] }, error: null }),
      ]);

      if (staffResult.error || branchResult.error) {
         throw new Error("Failed to load staff. Apply supabase/erp_core_schema.sql first.");
      }

      if (authResult.error) {
         throw new Error("Failed to load auth users.");
      }

      const authUsers: AuthUserOption[] = (authResult.data.users || []).map((user) => ({
         id: user.id,
         email: user.email ?? null,
         displayName: getAuthDisplayName({
            email: user.email,
            user_metadata: user.user_metadata,
         }),
         createdAt: user.created_at ?? null,
      }));

      return NextResponse.json({
         staff: ((staffResult.data || []) as unknown as StaffProfileWithBranch[]).map(toStaff),
         branches: ((branchResult.data || []) as Branch[]).map((branch) => ({
            id: branch.id,
            name: branch.name,
         })),
         authUsers,
         canManage,
      });
   } catch (error) {
      return jsonError(error, "Failed to load staff.");
   }
}

export async function POST(req: Request) {
   try {
      await requireErpPermission(req, "staff", "manage");

      const body = await req.json();
      const staffId = cleanString(body?.userId);
      const authUserId = nullableString(body?.authUserId);
      const fullName = cleanString(body?.fullName);
      const role = cleanString(body?.role);
      const salaryTier = cleanString(body?.salaryTier) || "default";
      const primaryBranchId = nullableString(body?.primaryBranchId);

      if (!fullName) {
         throw new Error("Full name is required.");
      }

      if (!isErpStaffRole(role)) {
         throw new Error("Choose a valid staff role.");
      }

      const { data, error } = await supabaseAdmin
         .from("staff_profiles")
         .upsert(
            {
               ...(staffId ? { user_id: staffId } : {}),
               auth_user_id: authUserId,
               full_name: fullName,
               role,
               salary_tier: role === "salesman" ? salaryTier : "default",
               primary_branch_id: primaryBranchId,
               telegram_username: nullableString(body?.telegramUsername),
               phone: nullableString(body?.phone),
               notes: nullableString(body?.notes),
               active: body?.active !== false,
            },
            { onConflict: "user_id" },
         )
         .select(
            "user_id, auth_user_id, full_name, role, salary_tier, primary_branch_id, telegram_username, phone, notes, active, created_at, updated_at, branches:primary_branch_id(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to save staff profile. Apply supabase/erp_core_schema.sql first.");
      }

      if (primaryBranchId) {
         const savedStaffId = data.user_id;
         await supabaseAdmin
            .from("staff_branch_assignments")
            .upsert(
               { staff_user_id: savedStaffId, branch_id: primaryBranchId },
               { onConflict: "staff_user_id,branch_id" },
            );
      }

      return NextResponse.json({
         staffMember: toStaff(data as unknown as StaffProfileWithBranch),
      });
   } catch (error) {
      return jsonError(error, "Failed to save staff profile.");
   }
}

export async function PATCH(req: Request) {
   return POST(req);
}
