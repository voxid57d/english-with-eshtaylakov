import { NextResponse } from "next/server";
import {
   cleanString,
   erpJsonError,
   isDateString,
   nullableString,
   type TeacherGroupLevel,
   type TeacherLessonCover,
   type TeacherLessonGroup,
   type TeacherLessonHoliday,
   type TeacherProfile,
} from "@/lib/erp";
import { canErp, requireErpPermission } from "@/lib/erpAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TeacherRow = TeacherProfile;

type LevelRow = TeacherGroupLevel;

type GroupRow = TeacherLessonGroup & {
   teacher_profiles?: Pick<TeacherProfile, "id" | "full_name"> | null;
   teacher_group_levels?: Pick<TeacherGroupLevel, "id" | "name"> | null;
};

type CoverRow = TeacherLessonCover & {
   teacher_lesson_groups?: GroupRow | null;
};

type HolidayRow = TeacherLessonHoliday;

function jsonError(error: unknown, fallback: string) {
   const { message, status } = erpJsonError(error, fallback);
   return NextResponse.json({ error: message }, { status });
}

function assertDbResult(result: { error: unknown }, message: string) {
   if (result.error) {
      throw new Error(message);
   }
}

function isTimeString(value: string) {
   return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toNumberOrNull(value: unknown, fieldName: string) {
   if (value === null || value === undefined || value === "") return null;

   const numberValue = Number(value);
   if (!Number.isFinite(numberValue)) {
      throw new Error(`${fieldName} must be a number.`);
   }

   return numberValue;
}

function toNonNegativeInteger(value: unknown, fieldName: string) {
   const numberValue = Number(value);

   if (!Number.isInteger(numberValue) || numberValue < 0) {
      throw new Error(`${fieldName} must be zero or higher.`);
   }

   return numberValue;
}

function validateOptionalDate(value: unknown, fieldName: string) {
   const dateValue = cleanString(value);
   if (!dateValue) return null;
   if (!isDateString(dateValue)) throw new Error(`${fieldName} must be a valid date.`);
   return dateValue;
}

function normalizeWeekdays(value: unknown) {
   if (!Array.isArray(value)) throw new Error("Choose lesson weekdays.");

   const weekdays = Array.from(
      new Set(value.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry))),
   ).sort((left, right) => left - right);

   if (weekdays.length === 0 || weekdays.some((weekday) => weekday < 1 || weekday > 7)) {
      throw new Error("Choose valid lesson weekdays.");
   }

   return weekdays;
}

function toTeacher(row: TeacherRow) {
   return {
      id: row.id,
      fullName: row.full_name,
      phone: row.phone,
      birthday: row.birthday,
      ieltsScore: row.ielts_score === null ? null : Number(row.ielts_score),
      celtaCertified: row.celta_certified,
      startedWorkingOn: row.started_working_on,
      stage: row.stage,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function toLevel(row: LevelRow) {
   return {
      id: row.id,
      name: row.name,
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function toGroup(row: GroupRow) {
   return {
      id: row.id,
      teacherId: row.teacher_id,
      teacherName: row.teacher_profiles?.full_name ?? "Teacher",
      levelId: row.level_id,
      levelName: row.teacher_group_levels?.name ?? "Group",
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      startsAt: row.starts_at.slice(0, 5),
      endsAt: row.ends_at.slice(0, 5),
      weekdays: row.weekdays,
      activeStudentsCount: Number(row.active_students_count || 0),
      active: row.active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function toCover(row: CoverRow) {
   return {
      id: row.id,
      lessonGroupId: row.lesson_group_id,
      teacherId: row.teacher_lesson_groups?.teacher_id ?? null,
      coverDate: row.cover_date,
      coveringTeacherId: row.covering_teacher_id,
      coveringTeacherName: row.covering_teacher_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function toHoliday(row: HolidayRow) {
   return {
      id: row.id,
      holidayDate: row.holiday_date,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
   };
}

function getMonthBoundsFromParam(month: string | null) {
   const anchor = month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
   const [year, monthIndex] = anchor.split("-").map(Number);
   const start = new Date(Date.UTC(year, monthIndex - 1, 1));
   const end = new Date(Date.UTC(year, monthIndex, 0));

   return {
      month: anchor,
      monthStart: start.toISOString().slice(0, 10),
      monthEnd: end.toISOString().slice(0, 10),
   };
}

async function loadPayload(req: Request) {
   const { staff } = await requireErpPermission(req, "teachers", "view");
   const canManage = await canErp(staff.role, "teachers", "manage");
   const url = new URL(req.url);
   const { month, monthStart, monthEnd } = getMonthBoundsFromParam(url.searchParams.get("month"));
   const weekStartParam = url.searchParams.get("weekStart");
   const weekEndParam = url.searchParams.get("weekEnd");
   const holidayStart = weekStartParam && isDateString(weekStartParam) && weekStartParam < monthStart
      ? weekStartParam
      : monthStart;
   const holidayEnd = weekEndParam && isDateString(weekEndParam) && weekEndParam > monthEnd
      ? weekEndParam
      : monthEnd;
   const coverStart = holidayStart;
   const coverEnd = holidayEnd;

   const [teacherResult, levelResult, groupResult, coverResult, holidayResult] = await Promise.all([
      supabaseAdmin
         .from("teacher_profiles")
         .select("id, full_name, phone, birthday, ielts_score, celta_certified, started_working_on, stage, active, created_at, updated_at")
         .order("active", { ascending: false })
         .order("full_name", { ascending: true }),
      supabaseAdmin
         .from("teacher_group_levels")
         .select("id, name, active, created_at, updated_at")
         .order("active", { ascending: false })
         .order("name", { ascending: true }),
      supabaseAdmin
         .from("teacher_lesson_groups")
         .select("id, teacher_id, level_id, starts_on, ends_on, starts_at, ends_at, weekdays, active_students_count, active, created_at, updated_at, teacher_profiles(id, full_name), teacher_group_levels(id, name)")
         .order("active", { ascending: false })
         .order("starts_at", { ascending: true }),
      supabaseAdmin
         .from("teacher_lesson_covers")
         .select("id, lesson_group_id, cover_date, covering_teacher_id, covering_teacher_name, created_by, created_at, updated_at, teacher_lesson_groups(id, teacher_id, level_id, starts_on, ends_on, starts_at, ends_at, weekdays, active_students_count, active)")
         .gte("cover_date", coverStart)
         .lte("cover_date", coverEnd)
         .order("cover_date", { ascending: true }),
      supabaseAdmin
         .from("teacher_lesson_holidays")
         .select("id, holiday_date, note, created_by, created_at, updated_at")
         .gte("holiday_date", holidayStart)
         .lte("holiday_date", holidayEnd)
         .order("holiday_date", { ascending: true }),
   ]);

   if (teacherResult.error || levelResult.error || groupResult.error || coverResult.error || holidayResult.error) {
      throw new Error("Failed to load teachers. Apply supabase/erp_core_schema.sql first.");
   }

   return {
      canManage,
      month,
      monthStart,
      monthEnd,
      teachers: ((teacherResult.data || []) as TeacherRow[]).map(toTeacher),
      levels: ((levelResult.data || []) as LevelRow[]).map(toLevel),
      groups: ((groupResult.data || []) as unknown as GroupRow[]).map(toGroup),
      covers: ((coverResult.data || []) as unknown as CoverRow[]).map(toCover),
      holidays: ((holidayResult.data || []) as HolidayRow[]).map(toHoliday),
   };
}

function teacherPayload(body: Record<string, unknown>) {
   const fullName = cleanString(body.fullName);
   if (!fullName) throw new Error("Teacher name is required.");

   const ieltsScore = toNumberOrNull(body.ieltsScore, "IELTS score");
   if (ieltsScore !== null && (ieltsScore < 0 || ieltsScore > 9)) {
      throw new Error("IELTS score must be between 0 and 9.");
   }

   return {
      full_name: fullName,
      phone: nullableString(body.phone),
      birthday: validateOptionalDate(body.birthday, "Birthday"),
      ielts_score: ieltsScore,
      celta_certified: body.celtaCertified === true,
      started_working_on: validateOptionalDate(body.startedWorkingOn, "Started working"),
      stage: nullableString(body.stage),
      active: body.active !== false,
   };
}

function levelPayload(body: Record<string, unknown>) {
   const name = cleanString(body.name);
   if (!name) throw new Error("Group level name is required.");

   return {
      name,
      active: body.active !== false,
   };
}

function groupPayload(body: Record<string, unknown>) {
   const teacherId = cleanString(body.teacherId);
   const levelId = cleanString(body.levelId);
   const startsOn = cleanString(body.startsOn);
   const endsOn = validateOptionalDate(body.endsOn, "Ending date");
   const startsAt = cleanString(body.startsAt);
   const endsAt = cleanString(body.endsAt);

   if (!teacherId) throw new Error("Choose a teacher.");
   if (!levelId) throw new Error("Choose a group level.");
   if (!isDateString(startsOn)) throw new Error("Starting date is required.");
   if (!isTimeString(startsAt)) throw new Error("Valid lesson start time is required.");
   if (!isTimeString(endsAt)) throw new Error("Valid lesson end time is required.");
   if (endsAt <= startsAt) throw new Error("Lesson end time must be later than start time.");
   if (endsOn && endsOn < startsOn) throw new Error("Ending date must be after starting date.");

   return {
      teacher_id: teacherId,
      level_id: levelId,
      starts_on: startsOn,
      ends_on: endsOn,
      starts_at: startsAt,
      ends_at: endsAt,
      weekdays: normalizeWeekdays(body.weekdays),
      active_students_count: toNonNegativeInteger(body.activeStudentsCount ?? 0, "Active students"),
      active: body.active !== false,
   };
}

function coverPayload(body: Record<string, unknown>, userId: string) {
   const lessonGroupId = cleanString(body.lessonGroupId);
   const coverDate = cleanString(body.coverDate);
   const coveringTeacherId = nullableString(body.coveringTeacherId);
   const coveringTeacherName = nullableString(body.coveringTeacherName);

   if (!lessonGroupId) throw new Error("Choose a lesson group.");
   if (!isDateString(coverDate)) throw new Error("Choose a cover date.");
   if (!coveringTeacherId && !coveringTeacherName) {
      throw new Error("Choose a covering teacher or write another teacher name.");
   }

   return {
      lesson_group_id: lessonGroupId,
      cover_date: coverDate,
      covering_teacher_id: coveringTeacherId,
      covering_teacher_name: coveringTeacherId ? null : coveringTeacherName,
      created_by: userId,
   };
}

function holidayPayload(body: Record<string, unknown>, userId: string) {
   const holidayDate = cleanString(body.holidayDate);

   if (!isDateString(holidayDate)) throw new Error("Choose a holiday date.");

   return {
      holiday_date: holidayDate,
      note: nullableString(body.note),
      created_by: userId,
   };
}

export async function GET(req: Request) {
   try {
      return NextResponse.json(await loadPayload(req));
   } catch (error) {
      return jsonError(error, "Failed to load teachers.");
   }
}

export async function POST(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "teachers", "manage");
      const body = await req.json();
      const entity = cleanString(body?.entity);

      if (entity === "teacher") {
         assertDbResult(
            await supabaseAdmin.from("teacher_profiles").insert(teacherPayload(body)),
            "Failed to create teacher.",
         );
      } else if (entity === "level") {
         assertDbResult(
            await supabaseAdmin.from("teacher_group_levels").insert(levelPayload(body)),
            "Failed to create group level.",
         );
      } else if (entity === "group") {
         assertDbResult(
            await supabaseAdmin.from("teacher_lesson_groups").insert(groupPayload(body)),
            "Failed to create lesson group.",
         );
      } else if (entity === "cover") {
         assertDbResult(
            await supabaseAdmin
               .from("teacher_lesson_covers")
               .upsert(coverPayload(body, user.id), { onConflict: "lesson_group_id,cover_date" }),
            "Failed to save cover.",
         );
      } else if (entity === "holiday") {
         assertDbResult(
            await supabaseAdmin
               .from("teacher_lesson_holidays")
               .upsert(holidayPayload(body, user.id), { onConflict: "holiday_date" }),
            "Failed to save holiday.",
         );
      } else {
         throw new Error("Choose what to save.");
      }

      return NextResponse.json(await loadPayload(req));
   } catch (error) {
      return jsonError(error, "Failed to save teacher data.");
   }
}

export async function PATCH(req: Request) {
   try {
      const { user } = await requireErpPermission(req, "teachers", "manage");
      const body = await req.json();
      const entity = cleanString(body?.entity);
      const id = cleanString(body?.id);

      if (entity !== "cover" && !id) throw new Error("ID is required.");

      if (entity === "teacher") {
         assertDbResult(
            await supabaseAdmin.from("teacher_profiles").update(teacherPayload(body)).eq("id", id),
            "Failed to update teacher.",
         );
      } else if (entity === "level") {
         assertDbResult(
            await supabaseAdmin.from("teacher_group_levels").update(levelPayload(body)).eq("id", id),
            "Failed to update group level.",
         );
      } else if (entity === "group") {
         assertDbResult(
            await supabaseAdmin.from("teacher_lesson_groups").update(groupPayload(body)).eq("id", id),
            "Failed to update lesson group.",
         );
      } else if (entity === "cover") {
         assertDbResult(
            await supabaseAdmin
               .from("teacher_lesson_covers")
               .upsert(coverPayload(body, user.id), { onConflict: "lesson_group_id,cover_date" }),
            "Failed to update cover.",
         );
      } else {
         throw new Error("Choose what to update.");
      }

      return NextResponse.json(await loadPayload(req));
   } catch (error) {
      return jsonError(error, "Failed to update teacher data.");
   }
}

export async function DELETE(req: Request) {
   try {
      await requireErpPermission(req, "teachers", "manage");
      const body = await req.json();
      const entity = cleanString(body?.entity);
      const id = cleanString(body?.id);
      const holidayDate = cleanString(body?.holidayDate);

      if (entity === "cover" && id) {
         assertDbResult(
            await supabaseAdmin.from("teacher_lesson_covers").delete().eq("id", id),
            "Failed to clear cover.",
         );
      } else if (entity === "holiday" && isDateString(holidayDate)) {
         assertDbResult(
            await supabaseAdmin.from("teacher_lesson_holidays").delete().eq("holiday_date", holidayDate),
            "Failed to clear holiday.",
         );
      } else {
         throw new Error("Choose a cover record or holiday date to clear.");
      }

      return NextResponse.json(await loadPayload(req));
   } catch (error) {
      return jsonError(error, "Failed to clear cover.");
   }
}
