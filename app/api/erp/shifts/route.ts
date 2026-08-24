import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   ERP_SHIFT_STATUS_LABELS,
   ERP_SHIFT_WORKER_ROLES,
   getWeekBounds,
   isDateString,
   isErpShiftStatus,
   nullableString,
   type Branch,
   type Shift,
   type StaffProfile,
} from "@/lib/erp";
import { canErp, requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ShiftRow = Shift & {
   staff_profiles?: Pick<StaffProfile, "user_id" | "full_name" | "role"> | null;
   branches?: Pick<Branch, "id" | "name"> | null;
};

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function isTimeString(value: string) {
   return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toNonNegativeInteger(value: unknown, fieldName: string) {
   const numberValue = Number(value);

   if (!Number.isInteger(numberValue) || numberValue < 0) {
      throw new Error(`${fieldName} must be zero or higher.`);
   }

   return numberValue;
}

function toShift(row: ShiftRow) {
   return {
      id: row.id,
      staffUserId: row.staff_user_id,
      staffName: row.staff_profiles?.full_name ?? "Staff member",
      staffRole: row.staff_profiles?.role ?? null,
      staffRoleLabel: row.staff_profiles?.role
         ? ERP_ROLE_LABELS[row.staff_profiles.role]
         : null,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? "Branch",
      shiftDate: row.shift_date,
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
      breakMinutes: Number(row.break_minutes || 0),
      status: row.status,
      statusLabel: ERP_SHIFT_STATUS_LABELS[row.status],
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function validateShiftBody(body: Record<string, unknown>) {
   const staffUserId = cleanString(body?.staffUserId);
   const branchId = cleanString(body?.branchId);
   const shiftDate = cleanString(body?.shiftDate);
   const startsAt = cleanString(body?.startsAt);
   const endsAt = cleanString(body?.endsAt);
   const status = cleanString(body?.status) || "scheduled";
   const breakMinutes = toNonNegativeInteger(body?.breakMinutes ?? 0, "Break minutes");

   if (!staffUserId) throw new Error("Choose a staff member.");
   if (!branchId) throw new Error("Choose a branch.");
   if (!isDateString(shiftDate)) throw new Error("Valid shift date is required.");
   if (!isTimeString(startsAt)) throw new Error("Valid start time is required.");
   if (!isTimeString(endsAt)) throw new Error("Valid end time is required.");
   if (!isErpShiftStatus(status)) throw new Error("Choose a valid shift status.");
   if (endsAt <= startsAt) throw new Error("End time must be later than start time.");

   return {
      staffUserId,
      branchId,
      shiftDate,
      startsAt,
      endsAt,
      breakMinutes,
      status,
      note: nullableString(body?.note),
   };
}

async function assertShiftWorker(staffUserId: string) {
   const { data, error } = await supabaseAdmin
      .from("staff_profiles")
      .select("role")
      .eq("user_id", staffUserId)
      .single();

   if (error || !data) {
      throw new Error("Choose a valid staff member.");
   }

   if (!(ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(data.role)) {
      throw new Error("Branch managers do not use shifts.");
   }
}

export async function GET(req: Request) {
   try {
      const { staff: currentStaff } = await requireErpPermission(req, "shifts", "view");
      const canManage = await canErp(currentStaff.role, "shifts", "manage");

      const url = new URL(req.url);
      const fallbackWeek = getWeekBounds();
      const weekStart = url.searchParams.get("weekStart") || fallbackWeek.weekStart;
      const weekEnd = url.searchParams.get("weekEnd") || fallbackWeek.weekEnd;
      const branchId = url.searchParams.get("branchId") || "all";

      if (!isDateString(weekStart) || !isDateString(weekEnd)) {
         throw new Error("Valid week dates are required.");
      }

      let shiftQuery = supabaseAdmin
         .from("shifts")
         .select(
            "id, staff_user_id, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, note, created_at, updated_at, staff_profiles(user_id, full_name, role), branches(id, name)",
         )
         .gte("shift_date", weekStart)
         .lte("shift_date", weekEnd)
         .order("shift_date", { ascending: true })
         .order("starts_at", { ascending: true });

      if (branchId !== "all") {
         shiftQuery = shiftQuery.eq("branch_id", branchId);
      }

      if (!canManage) {
         shiftQuery = shiftQuery.eq("staff_user_id", currentStaff.userId);
      }

      let staffQuery = supabaseAdmin
         .from("staff_profiles")
         .select("user_id, full_name, role, primary_branch_id, telegram_username, phone, notes, active, created_at, updated_at")
         .eq("active", true)
         .order("full_name", { ascending: true });

      if (!canManage) {
         staffQuery = staffQuery.eq("user_id", currentStaff.userId);
      } else {
         staffQuery = staffQuery.in("role", [...ERP_SHIFT_WORKER_ROLES]);
      }

      const [shiftResult, staffResult, branchResult] = await Promise.all([
         shiftQuery,
         staffQuery,
         supabaseAdmin
            .from("branches")
            .select("id, name, address, phone, active, created_at, updated_at")
            .eq("active", true)
            .order("name", { ascending: true }),
      ]);

      if (shiftResult.error || staffResult.error || branchResult.error) {
         throw new Error("Failed to load shifts. Apply supabase/erp_core_schema.sql first.");
      }

      return NextResponse.json({
         week: { weekStart, weekEnd },
         canManage,
         shifts: ((shiftResult.data || []) as unknown as ShiftRow[])
            .map(toShift)
            .filter(
               (shift) =>
                  !!shift.staffRole &&
                  (ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(shift.staffRole),
            ),
         staff: ((staffResult.data || []) as StaffProfile[]).map((member) => ({
            userId: member.user_id,
            fullName: member.full_name,
            role: member.role,
            roleLabel: ERP_ROLE_LABELS[member.role],
            primaryBranchId: member.primary_branch_id,
         })),
         branches: ((branchResult.data || []) as Branch[]).map((branch) => ({
            id: branch.id,
            name: branch.name,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load shifts.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();
      const shift = validateShiftBody(body);
      await assertShiftWorker(shift.staffUserId);

      const { data, error } = await supabaseAdmin
         .from("shifts")
         .insert({
            staff_user_id: shift.staffUserId,
            branch_id: shift.branchId,
            shift_date: shift.shiftDate,
            starts_at: shift.startsAt,
            ends_at: shift.endsAt,
            break_minutes: shift.breakMinutes,
            status: shift.status,
            approved_by: user.id,
            note: shift.note,
         })
         .select(
            "id, staff_user_id, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, note, created_at, updated_at, staff_profiles(user_id, full_name, role), branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to create shift.");
      }

      return NextResponse.json({ shift: toShift(data as unknown as ShiftRow) });
   } catch (error) {
      return jsonError(error, "Failed to create shift.");
   }
}

export async function PATCH(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();
      const id = cleanString(body?.id);

      if (!id) throw new Error("Shift ID is required.");

      const shift = validateShiftBody(body);
      await assertShiftWorker(shift.staffUserId);

      const { data, error } = await supabaseAdmin
         .from("shifts")
         .update({
            staff_user_id: shift.staffUserId,
            branch_id: shift.branchId,
            shift_date: shift.shiftDate,
            starts_at: shift.startsAt,
            ends_at: shift.endsAt,
            break_minutes: shift.breakMinutes,
            status: shift.status,
            approved_by: user.id,
            note: shift.note,
         })
         .eq("id", id)
         .select(
            "id, staff_user_id, branch_id, shift_date, starts_at, ends_at, break_minutes, status, approved_by, hourly_rate_override, extra_hourly_rate_override, extra_hours_enabled_override, note, created_at, updated_at, staff_profiles(user_id, full_name, role), branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to update shift.");
      }

      return NextResponse.json({ shift: toShift(data as unknown as ShiftRow) });
   } catch (error) {
      return jsonError(error, "Failed to update shift.");
   }
}
