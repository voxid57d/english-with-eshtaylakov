import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   ERP_ROLE_LABELS,
   ERP_SHIFT_WORKER_ROLES,
   nullableString,
   type Branch,
   type StaffProfile,
   type StaffWorkingHour,
} from "@/lib/erp";
import { canErp, requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type WorkingHourRow = StaffWorkingHour & {
   staff_profiles?: Pick<StaffProfile, "user_id" | "full_name" | "role" | "active"> | null;
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

function parseWeekday(value: unknown) {
   const weekday = Number(value);

   if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
      throw new Error("Choose a weekday.");
   }

   return weekday;
}

function parseWeekdays(value: unknown) {
   const weekdayValues = Array.isArray(value) ? value : [value];
   const weekdays = [...new Set(weekdayValues.map(parseWeekday))].sort(
      (left, right) => left - right,
   );

   if (weekdays.length === 0) {
      throw new Error("Choose at least one weekday.");
   }

   return weekdays;
}

function toWorkingHour(row: WorkingHourRow) {
   return {
      id: row.id,
      staffUserId: row.staff_user_id,
      staffName: row.staff_profiles?.full_name ?? "Staff member",
      staffRole: row.staff_profiles?.role ?? null,
      staffActive: row.staff_profiles?.active ?? false,
      staffRoleLabel: row.staff_profiles?.role
         ? ERP_ROLE_LABELS[row.staff_profiles.role]
         : null,
      branchId: row.branch_id,
      branchName: row.branches?.name ?? null,
      weekday: row.weekday,
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
      breakMinutes: Number(row.break_minutes || 0),
      active: row.active,
      note: row.note,
   };
}

function validateWorkingHourBody(body: Record<string, unknown>) {
   const id = cleanString(body?.id);
   const staffUserId = cleanString(body?.staffUserId);
   const branchId = cleanString(body?.branchId);
   const weekdays = parseWeekdays(body?.weekdays ?? body?.weekday);
   const startsAt = cleanString(body?.startsAt);
   const endsAt = cleanString(body?.endsAt);
   const breakMinutes = toNonNegativeInteger(body?.breakMinutes ?? 0, "Break minutes");

   if (!staffUserId) throw new Error("Choose a staff member.");
   if (!isTimeString(startsAt)) throw new Error("Valid start time is required.");
   if (!isTimeString(endsAt)) throw new Error("Valid end time is required.");
   if (endsAt <= startsAt) throw new Error("End time must be later than start time.");

   return {
      id,
      staffUserId,
      branchId: branchId || null,
      weekdays,
      startsAt,
      endsAt,
      breakMinutes,
      active: body?.active !== false,
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
      throw new Error("Branch managers do not use working hours.");
   }
}

async function loadRows(staffUserId?: string) {
   let query = supabaseAdmin
      .from("staff_working_hours")
      .select(
         "id, staff_user_id, branch_id, weekday, starts_at, ends_at, break_minutes, active, note, created_by, created_at, updated_at, staff_profiles(user_id, full_name, role, active), branches(id, name)",
      )
      .order("weekday", { ascending: true });

   if (staffUserId) {
      query = query.eq("staff_user_id", staffUserId);
   }

   const { data, error } = await query;

   if (error) {
      throw new Error("Failed to load working hours. Apply supabase/erp_core_schema.sql first.");
   }

   return ((data || []) as unknown as WorkingHourRow[])
      .map(toWorkingHour)
      .filter(
         (row) =>
            !!row.staffRole &&
            row.staffActive === true &&
            (ERP_SHIFT_WORKER_ROLES as readonly string[]).includes(row.staffRole),
      );
}

export async function GET(req: Request) {
   try {
      const { staff } = await requireErpPermission(req, "shifts", "view");
      const canManage = await canErp(staff.role, "shifts", "manage");
      return NextResponse.json({
         workingHours: await loadRows(canManage ? undefined : staff.userId),
      });
   } catch (error) {
      return jsonError(error, "Failed to load working hours.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();
      const schedule = validateWorkingHourBody(body);
      await assertShiftWorker(schedule.staffUserId);

      const rows = schedule.weekdays.map((weekday) => ({
         staff_user_id: schedule.staffUserId,
         branch_id: schedule.branchId,
         weekday,
         starts_at: schedule.startsAt,
         ends_at: schedule.endsAt,
         break_minutes: schedule.breakMinutes,
         active: schedule.active,
         note: schedule.note,
         created_by: user.id,
      }));

      const { data, error } = await supabaseAdmin
         .from("staff_working_hours")
         .upsert(
            rows,
            { onConflict: "staff_user_id,weekday" },
         )
         .select(
            "id, staff_user_id, branch_id, weekday, starts_at, ends_at, break_minutes, active, note, created_by, created_at, updated_at, staff_profiles(user_id, full_name, role, active), branches(id, name)",
         );

      if (error || !data) {
         throw new Error("Failed to save working hours.");
      }

      return NextResponse.json({
         workingHoursSaved: ((data || []) as unknown as WorkingHourRow[]).map(toWorkingHour),
         workingHours: await loadRows(),
      });
   } catch (error) {
      return jsonError(error, "Failed to save working hours.");
   }
}

export async function PATCH(req: Request) {
   try {
      await requireErpPermission(req, "shifts", "manage");
      const body = await req.json();
      const schedule = validateWorkingHourBody(body);
      await assertShiftWorker(schedule.staffUserId);

      if (!schedule.id) {
         throw new Error("Working hours ID is required.");
      }

      if (schedule.weekdays.length !== 1) {
         throw new Error("Choose one weekday when editing working hours.");
      }

      const { data, error } = await supabaseAdmin
         .from("staff_working_hours")
         .update({
            staff_user_id: schedule.staffUserId,
            branch_id: schedule.branchId,
            weekday: schedule.weekdays[0],
            starts_at: schedule.startsAt,
            ends_at: schedule.endsAt,
            break_minutes: schedule.breakMinutes,
            active: schedule.active,
            note: schedule.note,
         })
         .eq("id", schedule.id)
         .select(
            "id, staff_user_id, branch_id, weekday, starts_at, ends_at, break_minutes, active, note, created_by, created_at, updated_at, staff_profiles(user_id, full_name, role, active), branches(id, name)",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to update working hours.");
      }

      return NextResponse.json({
         workingHour: toWorkingHour(data as unknown as WorkingHourRow),
         workingHours: await loadRows(),
      });
   } catch (error) {
      return jsonError(error, "Failed to update working hours.");
   }
}
