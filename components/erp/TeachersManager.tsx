"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
   PiArchiveLight,
   PiArrowCounterClockwiseLight,
   PiCalendarBlankLight,
   PiChalkboardTeacherLight,
   PiFloppyDiskLight,
   PiPlusLight,
   PiStudentLight,
   PiUsersThreeLight,
} from "react-icons/pi";
import { useSearchParams } from "next/navigation";
import { ERP_WEEKDAYS } from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type TeacherView = {
   id: string;
   fullName: string;
   phone: string | null;
   birthday: string | null;
   ieltsScore: number | null;
   celtaCertified: boolean;
   startedWorkingOn: string | null;
   stage: string | null;
   lmsTeacherUrl: string | null;
   active: boolean;
};

type LevelView = {
   id: string;
   name: string;
   active: boolean;
};

type GroupView = {
   id: string;
   teacherId: string;
   teacherName: string;
   levelId: string;
   levelName: string;
   lmsGroupName: string | null;
   lmsGroupId: string | null;
   startsOn: string | null;
   endsOn: string | null;
   startsAt: string;
   endsAt: string;
   weekdays: number[];
   activeStudentsCount: number;
   active: boolean;
   isIntake: boolean;
   archivedOn: string | null;
};

type CoverView = {
   id: string;
   lessonGroupId: string;
   teacherId: string | null;
   coverDate: string;
   coveringTeacherId: string | null;
   coveringTeacherName: string | null;
};

type HolidayView = {
   id: string;
   holidayDate: string;
   note: string | null;
};

type ScheduleCard = {
   key: string;
   group: GroupView;
   variant: "lesson" | "cover" | "intake";
   coveringFor?: string;
};

type TeacherForm = {
   id: string;
   fullName: string;
   phone: string;
   birthday: string;
   ieltsScore: string;
   celtaCertified: boolean;
   startedWorkingOn: string;
   stage: string;
   lmsTeacherUrl: string;
   active: boolean;
};

type LevelForm = {
   id: string;
   name: string;
   active: boolean;
};

type GroupForm = {
   id: string;
   teacherId: string;
   levelId: string;
   lmsGroupName: string;
   lmsGroupId: string;
   startsOn: string;
   endsOn: string;
   startsAt: string;
   endsAt: string;
   weekdays: number[];
   activeStudentsCount: number;
   active: boolean;
   isIntake: boolean;
   archivedOn: string;
};

type CoverDraft = {
   group: GroupView;
   date: string;
   existingCover: CoverView | null;
   coveringTeacherId: string;
   coveringTeacherName: string;
};

const EMPTY_TEACHER_FORM: TeacherForm = {
   id: "",
   fullName: "",
   phone: "",
   birthday: "",
   ieltsScore: "",
   celtaCertified: false,
   startedWorkingOn: "",
   stage: "",
   lmsTeacherUrl: "",
   active: true,
};

const EMPTY_LEVEL_FORM: LevelForm = {
   id: "",
   name: "",
   active: true,
};

const EMPTY_GROUP_FORM: GroupForm = {
   id: "",
   teacherId: "",
   levelId: "",
   lmsGroupName: "",
   lmsGroupId: "",
   startsOn: new Date().toISOString().slice(0, 10),
   endsOn: "",
   startsAt: "09:00",
   endsAt: "10:30",
   weekdays: [1, 3, 5],
   activeStudentsCount: 0,
   active: true,
   isIntake: false,
   archivedOn: "",
};

const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_HEIGHT = 64;
const LESSON_TIME_OPTIONS = Array.from({ length: (END_HOUR - START_HOUR + 1) * 2 }, (_, index) => {
   const totalMinutes = START_HOUR * 60 + index * 30;
   const hours = Math.floor(totalMinutes / 60);
   const minutes = totalMinutes % 60;

   return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}).filter((time) => time <= `${END_HOUR}:00`);
const QUICK_LESSON_TIMES = ["08:00", "10:00", "14:00", "16:00", "18:00", "20:00"];

function addDays(dateValue: string, days: number) {
   const date = new Date(`${dateValue}T00:00:00.000Z`);
   date.setUTCDate(date.getUTCDate() + days);
   return date.toISOString().slice(0, 10);
}

function formatLocalDate(date: Date) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");

   return `${year}-${month}-${day}`;
}

function formatDateForDisplay(value: string) {
   if (!value) return "";

   const [year, month, day] = value.split("-");
   if (!year || !month || !day) return value;

   return `${day}/${month}/${year}`;
}

function normalizeDateDisplay(value: string) {
   const digits = value.replace(/\D/g, "").slice(0, 8);
   const day = digits.slice(0, 2);
   const month = digits.slice(2, 4);
   const year = digits.slice(4, 8);

   return [day, month, year].filter(Boolean).join("/");
}

function parseDisplayDate(value: string) {
   const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
   if (!match) return null;

   const [, day, month, year] = match;
   const isoDate = `${year}-${month}-${day}`;
   const parsedDate = new Date(`${isoDate}T00:00:00.000Z`);

   if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== Number(year) ||
      parsedDate.getUTCMonth() + 1 !== Number(month) ||
      parsedDate.getUTCDate() !== Number(day)
   ) {
      return null;
   }

   return isoDate;
}

function getWeekStart(anchor = new Date()) {
   const date = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate()));
   const day = date.getUTCDay();
   date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
   return date.toISOString().slice(0, 10);
}

function getWeekday(dateValue: string) {
   const day = new Date(`${dateValue}T00:00:00.000Z`).getUTCDay();
   return day === 0 ? 7 : day;
}

function getMonthDays(month: string) {
   const [year, monthNumber] = month.split("-").map(Number);
   const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
   return Array.from({ length: lastDay }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

function monthLabel(month: string) {
   return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${month}-01T00:00:00.000Z`),
   );
}

function timeToMinutes(time: string) {
   const [hours, minutes] = time.split(":").map(Number);
   return hours * 60 + minutes;
}

function groupIsOnDate(group: GroupView, date: string) {
   const isAvailableOnDate = group.active || !group.archivedOn || date < group.archivedOn;

   if (group.isIntake) {
      return isAvailableOnDate && group.weekdays.includes(getWeekday(date));
   }

   return (
      isAvailableOnDate &&
      !!group.startsOn &&
      group.startsOn <= date &&
      (!group.endsOn || group.endsOn >= date) &&
      group.weekdays.includes(getWeekday(date))
   );
}

function weekDayShort(date: string) {
   return new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
      new Date(`${date}T00:00:00.000Z`),
   );
}

function hourBarClass(hour: number) {
   if (hour < 12) {
      return "border-sky-500/25 bg-sky-500/10 text-sky-200";
   }

   if (hour < 14) {
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
   }

   return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
}

function DateField({
   label,
   value,
   onChange,
   required = false,
}: {
   label: string;
   value: string;
   onChange: (value: string) => void;
   required?: boolean;
}) {
   const [displayValue, setDisplayValue] = useState(() => formatDateForDisplay(value));

   useEffect(() => {
      setDisplayValue(formatDateForDisplay(value));
   }, [value]);

   return (
      <label className="block">
         <span className="text-sm text-slate-300">{label}</span>
         <input
            type="text"
            inputMode="numeric"
            placeholder="dd/mm/yyyy"
            pattern="\d{2}/\d{2}/\d{4}"
            value={displayValue}
            onChange={(event) => {
               const nextDisplayValue = normalizeDateDisplay(event.target.value);
               setDisplayValue(nextDisplayValue);

               if (!nextDisplayValue) {
                  onChange("");
                  return;
               }

               const nextValue = parseDisplayDate(nextDisplayValue);
               if (nextValue) {
                  onChange(nextValue);
               }
            }}
            onBlur={() => setDisplayValue(formatDateForDisplay(value))}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
            required={required}
         />
      </label>
   );
}

function LessonTimeField({
   label,
   value,
   onChange,
}: {
   label: string;
   value: string;
   onChange: (value: string) => void;
}) {
   const options = LESSON_TIME_OPTIONS.includes(value)
      ? LESSON_TIME_OPTIONS
      : [...LESSON_TIME_OPTIONS, value].sort();

   return (
      <div>
         <span className="text-sm text-slate-300">{label}</span>
         <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
            required>
            {options.map((time) => (
               <option key={time} value={time}>
                  {time}
               </option>
            ))}
         </select>
         <div className="mt-2 grid grid-cols-3 gap-1.5">
            {QUICK_LESSON_TIMES.map((time) => (
               <button
                  key={time}
                  type="button"
                  onClick={() => onChange(time)}
                  className={[
                     "rounded-md border px-2 py-1 text-xs transition",
                     value === time
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900",
                  ].join(" ")}>
                  {time}
               </button>
            ))}
         </div>
      </div>
   );
}

function CoverBadge({ cover, teachers }: { cover: CoverView | null; teachers: TeacherView[] }) {
   if (!cover) return null;

   const name =
      cover.coveringTeacherName ||
      teachers.find((teacher) => teacher.id === cover.coveringTeacherId)?.fullName ||
      "Covered";

   return (
      <span className="mt-1 block truncate rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">
         {name}
      </span>
   );
}

export default function TeachersManager() {
   const searchParams = useSearchParams();
   const activeTab = searchParams.get("section") === "covers" ? "covers" : "lessons";
   const editorSectionRef = useRef<HTMLElement | null>(null);
   const [activeEditor, setActiveEditor] = useState<"teacher" | "levels" | "group" | null>(null);
   const [teachers, setTeachers] = useState<TeacherView[]>([]);
   const [levels, setLevels] = useState<LevelView[]>([]);
   const [groups, setGroups] = useState<GroupView[]>([]);
   const [covers, setCovers] = useState<CoverView[]>([]);
   const [holidays, setHolidays] = useState<HolidayView[]>([]);
   const [canManage, setCanManage] = useState(false);
   const [selectedTeacherId, setSelectedTeacherId] = useState("");
   const [teacherForm, setTeacherForm] = useState<TeacherForm>(EMPTY_TEACHER_FORM);
   const [levelForm, setLevelForm] = useState<LevelForm>(EMPTY_LEVEL_FORM);
   const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM);
   const [showArchivedGroups, setShowArchivedGroups] = useState(false);
   const [weekStart, setWeekStart] = useState(getWeekStart());
   const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
   const [coverDraft, setCoverDraft] = useState<CoverDraft | null>(null);
   const [holidayDate, setHolidayDate] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.active), [teachers]);
   const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId) || activeTeachers[0] || teachers[0];
   const today = useMemo(() => formatLocalDate(new Date()), []);
   const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
   const monthDays = useMemo(() => getMonthDays(month), [month]);
   const holidayDates = useMemo(() => new Set(holidays.map((holiday) => holiday.holidayDate)), [holidays]);
   const effectiveCovers = useMemo(
      () => covers.filter((cover) => !holidayDates.has(cover.coverDate)),
      [covers, holidayDates],
   );
   const monthlyCovers = useMemo(
      () => effectiveCovers.filter((cover) => cover.coverDate.startsWith(month)),
      [effectiveCovers, month],
   );
   const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
   const activeRegularGroups = useMemo(
      () => groups.filter((group) => group.active && !group.isIntake),
      [groups],
   );
   const activeIntakeGroups = useMemo(
      () => groups.filter((group) => group.active && group.isIntake),
      [groups],
   );
   const activeStudentsTotal = useMemo(
      () => activeRegularGroups.reduce((sum, group) => sum + group.activeStudentsCount, 0),
      [activeRegularGroups],
   );

   const coverByGroupDate = useMemo(() => {
      return new Map(effectiveCovers.map((cover) => [`${cover.lessonGroupId}:${cover.coverDate}`, cover]));
   }, [effectiveCovers]);

   const groupsByTeacher = useMemo(() => {
      return teachers.map((teacher) => {
         const teacherGroups = groups.filter((group) => group.teacherId === teacher.id);
         const activeStudentTotal = teacherGroups
            .filter((group) => group.active && !group.isIntake)
            .reduce((sum, group) => sum + group.activeStudentsCount, 0);
         const activeGroupTotal = teacherGroups.filter((group) => group.active && !group.isIntake).length;
         const intakeGroupTotal = teacherGroups.filter((group) => group.active && group.isIntake).length;

         return {
            ...teacher,
            groups: teacherGroups,
            activeGroupTotal,
            intakeGroupTotal,
            activeStudentTotal,
         };
      });
   }, [groups, teachers]);

   const coverStats = useMemo(() => {
      const asked = new Map<string, number>();
      const covered = new Map<string, number>();

      for (const cover of monthlyCovers) {
         if (cover.teacherId) {
            asked.set(cover.teacherId, (asked.get(cover.teacherId) || 0) + 1);
         }

         const covererKey = cover.coveringTeacherId || `another:${cover.coveringTeacherName || "Another"}`;
         covered.set(covererKey, (covered.get(covererKey) || 0) + 1);
      }

      return { asked, covered };
   }, [monthlyCovers]);

   const selectedTeacherGroups = useMemo(() => {
      return groups.filter(
         (group) =>
            (!selectedTeacher || group.teacherId === selectedTeacher.id) &&
            (showArchivedGroups || group.active),
      );
   }, [groups, selectedTeacher, showArchivedGroups]);
   const coveredLessonsTotal = useMemo(
      () => [...coverStats.covered.values()].reduce((sum, count) => sum + count, 0),
      [coverStats],
   );

   const loadTeachers = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/teachers?month=${month}&weekStart=${weekStart}&weekEnd=${addDays(weekStart, 6)}`,
            {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            },
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load teachers.");
         }

         setTeachers(payload.teachers || []);
         setLevels(payload.levels || []);
         setGroups(payload.groups || []);
         setCovers(payload.covers || []);
         setHolidays(payload.holidays || []);
         setCanManage(Boolean(payload.canManage));
         setSelectedTeacherId((current) => current || payload.teachers?.[0]?.id || "");
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to load teachers.");
      } finally {
         setLoading(false);
      }
   }, [month, weekStart]);

   useEffect(() => {
      void loadTeachers();
   }, [loadTeachers]);

   const saveEntity = async (entity: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") => {
      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/teachers?month=${month}&weekStart=${weekStart}&weekEnd=${addDays(weekStart, 6)}`,
            {
            method,
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entity, ...body }),
            },
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save teacher data.");
         }

         setTeachers(payload.teachers || []);
         setLevels(payload.levels || []);
         setGroups(payload.groups || []);
         setCovers(payload.covers || []);
         setHolidays(payload.holidays || []);
         setCanManage(Boolean(payload.canManage));
         setSuccess("Saved.");
         return true;
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to save teacher data.");
         return false;
      } finally {
         setSaving(false);
      }
   };

   const openHolidayDialog = (day: string) => {
      if (!canManage) return;
      setHolidayDate(day);
      setError(null);
      setSuccess(null);
   };

   const saveHoliday = async () => {
      if (!holidayDate) return;
      if (await saveEntity("holiday", { holidayDate }, "POST")) {
         setSuccess("Lessons cancelled for this day.");
         setHolidayDate(null);
      }
   };

   const clearHoliday = async () => {
      if (!holidayDate) return;

      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/teachers?month=${month}&weekStart=${weekStart}&weekEnd=${addDays(weekStart, 6)}`,
            {
               method: "DELETE",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify({ entity: "holiday", holidayDate }),
            },
         );
         const payload = await response.json();
         if (!response.ok) throw new Error(payload.error || "Failed to restore lessons.");
         setCovers(payload.covers || []);
         setHolidays(payload.holidays || []);
         setSuccess("Lessons restored for this day.");
         setHolidayDate(null);
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to restore lessons.");
      } finally {
         setSaving(false);
      }
   };

   const submitTeacher = async (event: React.FormEvent) => {
      event.preventDefault();
      if (await saveEntity("teacher", teacherForm, teacherForm.id ? "PATCH" : "POST")) {
         setTeacherForm(EMPTY_TEACHER_FORM);
      }
   };

   const submitLevel = async (event: React.FormEvent) => {
      event.preventDefault();
      if (await saveEntity("level", levelForm, levelForm.id ? "PATCH" : "POST")) {
         setLevelForm(EMPTY_LEVEL_FORM);
      }
   };

   const submitGroup = async (event: React.FormEvent) => {
      event.preventDefault();
      if (await saveEntity("group", groupForm, groupForm.id ? "PATCH" : "POST")) {
         setGroupForm(EMPTY_GROUP_FORM);
      }
   };

   const saveCover = async (event: React.FormEvent) => {
      event.preventDefault();
      if (!coverDraft) return;

      const saved = await saveEntity(
         "cover",
         {
            lessonGroupId: coverDraft.group.id,
            coverDate: coverDraft.date,
            coveringTeacherId: coverDraft.coveringTeacherId === "another" ? "" : coverDraft.coveringTeacherId,
            coveringTeacherName: coverDraft.coveringTeacherId === "another" ? coverDraft.coveringTeacherName : "",
         },
         coverDraft.existingCover ? "PATCH" : "POST",
      );
      if (saved) {
         setCoverDraft(null);
      }
   };

   const clearCover = async () => {
      if (!coverDraft?.existingCover) return;

      setSaving(true);
      setError(null);
      setSuccess(null);
      try {
         const token = await getSupabaseAccessToken();
         const response = await fetch(`/api/erp/teachers?month=${month}`, {
            method: "DELETE",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entity: "cover", id: coverDraft.existingCover.id }),
         });
         const payload = await response.json();
         if (!response.ok) throw new Error(payload.error || "Failed to clear cover.");
         setCovers(payload.covers || []);
         setSuccess("Cover cleared.");
         setCoverDraft(null);
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to clear cover.");
      } finally {
         setSaving(false);
      }
   };

   const editTeacher = (teacher: TeacherView) => {
      setTeacherForm({
         id: teacher.id,
         fullName: teacher.fullName,
         phone: teacher.phone || "",
         birthday: teacher.birthday || "",
         ieltsScore: teacher.ieltsScore === null ? "" : String(teacher.ieltsScore),
         celtaCertified: teacher.celtaCertified,
         startedWorkingOn: teacher.startedWorkingOn || "",
         stage: teacher.stage || "",
         lmsTeacherUrl: teacher.lmsTeacherUrl || "",
         active: teacher.active,
      });
      setActiveEditor("teacher");
      requestAnimationFrame(() => {
         editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
   };

   const editGroup = (group: GroupView) => {
      setGroupForm({
         id: group.id,
         teacherId: group.teacherId,
         levelId: group.levelId,
         lmsGroupName: group.lmsGroupName || "",
         lmsGroupId: group.lmsGroupId || "",
         startsOn: group.startsOn || "",
         endsOn: group.endsOn || "",
         startsAt: group.startsAt,
         endsAt: group.endsAt,
         weekdays: group.weekdays,
         activeStudentsCount: group.activeStudentsCount,
         active: group.active,
         isIntake: group.isIntake,
         archivedOn: group.archivedOn || "",
      });
      setActiveEditor("group");
      requestAnimationFrame(() => {
         editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
   };

   const updateGroupActive = async (group: GroupView, active: boolean) => {
      await saveEntity(
         "group",
         {
            id: group.id,
            teacherId: group.teacherId,
            levelId: group.levelId,
            lmsGroupName: group.lmsGroupName || "",
            lmsGroupId: group.lmsGroupId || "",
            startsOn: group.startsOn || "",
            endsOn: group.endsOn || "",
            startsAt: group.startsAt,
            endsAt: group.endsAt,
            weekdays: group.weekdays,
            activeStudentsCount: group.activeStudentsCount,
            active,
            isIntake: group.isIntake,
            archivedOn: active ? "" : group.archivedOn || today,
         },
         "PATCH",
      );
   };

   const openCover = (group: GroupView, date: string) => {
      if (!canManage) return;
      const existingCover = coverByGroupDate.get(`${group.id}:${date}`) || null;
      setCoverDraft({
         group,
         date,
         existingCover,
         coveringTeacherId: existingCover?.coveringTeacherId || (existingCover?.coveringTeacherName ? "another" : ""),
         coveringTeacherName: existingCover?.coveringTeacherName || "",
      });
   };

   const toggleWeekday = (weekday: number) => {
      setGroupForm((current) => ({
         ...current,
         weekdays: current.weekdays.includes(weekday)
            ? current.weekdays.filter((entry) => entry !== weekday)
            : [...current.weekdays, weekday].sort((left, right) => left - right),
      }));
   };

   const moveMonth = (offset: number) => {
      const [year, monthNumber] = month.split("-").map(Number);
      const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
      setMonth(date.toISOString().slice(0, 7));
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
               <div>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">
                     Teachers
                  </h1>
               </div>
               {activeTab === "covers" ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-2">
                     <p className="text-xs text-slate-500">Covered lessons</p>
                     <p className="text-xl font-semibold text-white">{coveredLessonsTotal}</p>
                  </div>
               ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                        <p className="text-xs text-slate-500">Teachers</p>
                        <p className="text-xl font-semibold text-white">{activeTeachers.length}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                        <p className="text-xs text-slate-500">Groups</p>
                        <p className="text-xl font-semibold text-white">{activeRegularGroups.length}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                        <p className="text-xs text-slate-500">Intake</p>
                        <p className="text-xl font-semibold text-white">{activeIntakeGroups.length}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                        <p className="text-xs text-slate-500">Students</p>
                        <p className="text-xl font-semibold text-white">{activeStudentsTotal}</p>
                     </div>
                  </div>
               )}
            </div>
         </section>

         {(error || success) && (
            <div
               className={[
                  "rounded-lg border px-4 py-3 text-sm",
                  error
                     ? "border-red-500/30 bg-red-500/10 text-red-200"
                     : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
               ].join(" ")}>
               {error || success}
            </div>
         )}

         {activeTab === "lessons" ? (
            <div className="space-y-4">
               {canManage && (
                  <section ref={editorSectionRef} className="space-y-3">
                     <div className="flex flex-wrap gap-2">
                        {[
                           ["teacher", "Teacher profile"],
                           ["levels", "Group levels"],
                           ["group", "Lesson group"],
                        ].map(([editor, label]) => (
                           <button
                              key={editor}
                              type="button"
                              onClick={() =>
                                 setActiveEditor((current) =>
                                    current === editor ? null : (editor as "teacher" | "levels" | "group"),
                                 )
                              }
                              className={[
                                 "rounded-lg border px-3 py-2 text-sm transition",
                                 activeEditor === editor
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-slate-700 text-slate-300 hover:bg-slate-800",
                              ].join(" ")}>
                              {label}
                           </button>
                        ))}
                     </div>

                     <div className="grid grid-cols-1 gap-4">
                     {activeEditor === "teacher" && (
                     <form onSubmit={submitTeacher} className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex items-center gap-2">
                           {teacherForm.id ? <PiFloppyDiskLight className="text-emerald-300" size={22} /> : <PiPlusLight className="text-emerald-300" size={22} />}
                           <h2 className="text-lg font-semibold text-white">Teacher profile</h2>
                        </div>
                        <div className="mt-4 space-y-3">
                           <label className="block">
                              <span className="text-sm text-slate-300">Full name</span>
                              <input value={teacherForm.fullName} onChange={(event) => setTeacherForm((current) => ({ ...current, fullName: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required />
                           </label>
                           <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="block">
                                 <span className="text-sm text-slate-300">Phone</span>
                                 <input value={teacherForm.phone} onChange={(event) => setTeacherForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" placeholder="+998" />
                              </label>
                              <label className="block">
                                 <span className="text-sm text-slate-300">IELTS</span>
                                 <input type="number" min="0" max="9" step="0.5" value={teacherForm.ieltsScore} onChange={(event) => setTeacherForm((current) => ({ ...current, ieltsScore: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                              </label>
                           </div>
                           <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <DateField
                                 label="Birthday"
                                 value={teacherForm.birthday}
                                 onChange={(birthday) => setTeacherForm((current) => ({ ...current, birthday }))}
                              />
                              <DateField
                                 label="Started working"
                                 value={teacherForm.startedWorkingOn}
                                 onChange={(startedWorkingOn) => setTeacherForm((current) => ({ ...current, startedWorkingOn }))}
                              />
                           </div>
                           <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <label className="block">
                                 <span className="text-sm text-slate-300">Stage</span>
                                 <input value={teacherForm.stage} onChange={(event) => setTeacherForm((current) => ({ ...current, stage: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" placeholder="Current stage" />
                              </label>
                              <label className="block">
                                 <span className="text-sm text-slate-300">LMS teacher link</span>
                                 <input type="url" value={teacherForm.lmsTeacherUrl} onChange={(event) => setTeacherForm((current) => ({ ...current, lmsTeacherUrl: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" placeholder="https://..." />
                              </label>
                           </div>
                           <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                                 <input type="checkbox" checked={teacherForm.celtaCertified} onChange={(event) => setTeacherForm((current) => ({ ...current, celtaCertified: event.target.checked }))} className="h-4 w-4 accent-emerald-500" />
                                 <span className="text-sm text-slate-300">CELTA certified</span>
                              </label>
                              <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                                 <input type="checkbox" checked={teacherForm.active} onChange={(event) => setTeacherForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-emerald-500" />
                                 <span className="text-sm text-slate-300">Active</span>
                              </label>
                           </div>
                        </div>
                        <div className="mt-5 flex gap-2">
                           <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                              <PiFloppyDiskLight size={18} />
                              {saving ? "Saving..." : "Save"}
                           </button>
                           {teacherForm.id && (
                              <button type="button" onClick={() => setTeacherForm(EMPTY_TEACHER_FORM)} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                                 Cancel
                              </button>
                           )}
                        </div>
                     </form>
                     )}

                     {activeEditor === "levels" && (
                     <form onSubmit={submitLevel} className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex items-center gap-2">
                           <PiStudentLight className="text-emerald-300" size={22} />
                           <h2 className="text-lg font-semibold text-white">Group levels</h2>
                        </div>
                        <label className="mt-4 block">
                           <span className="text-sm text-slate-300">Level name</span>
                           <input value={levelForm.name} onChange={(event) => setLevelForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" placeholder="Beginner" required />
                        </label>
                        <label className="mt-3 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                           <input type="checkbox" checked={levelForm.active} onChange={(event) => setLevelForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-emerald-500" />
                           <span className="text-sm text-slate-300">Active level</span>
                        </label>
                        <button type="submit" disabled={saving} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                           <PiFloppyDiskLight size={18} />
                           Save level
                        </button>
                        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
                           {levels.map((level) => (
                              <button key={level.id} type="button" onClick={() => { setLevelForm({ id: level.id, name: level.name, active: level.active }); setActiveEditor("levels"); }} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-900">
                                 <span className="truncate">{level.name}</span>
                                 <span className="text-xs text-slate-500">{level.active ? "Active" : "Off"}</span>
                              </button>
                           ))}
                        </div>
                     </form>
                     )}

                     {activeEditor === "group" && (
                     <form onSubmit={submitGroup} className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex items-center gap-2">
                           <PiChalkboardTeacherLight className="text-emerald-300" size={22} />
                           <h2 className="text-lg font-semibold text-white">Lesson group</h2>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                           <label className="block">
                              <span className="text-sm text-slate-300">Teacher</span>
                              <select value={groupForm.teacherId} onChange={(event) => setGroupForm((current) => ({ ...current, teacherId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required>
                                 <option value="">Choose teacher</option>
                                 {activeTeachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}
                              </select>
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Level</span>
                              <select value={groupForm.levelId} onChange={(event) => setGroupForm((current) => ({ ...current, levelId: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required>
                                 <option value="">Choose level</option>
                                 {levels.filter((level) => level.active).map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
                              </select>
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Group name</span>
                              <input
                                 value={groupForm.lmsGroupName}
                                 onChange={(event) => setGroupForm((current) => ({ ...current, lmsGroupName: event.target.value }))}
                                 className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                 placeholder="Exact LMS group name"
                              />
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Group ID</span>
                              <input
                                 value={groupForm.lmsGroupId}
                                 onChange={(event) => setGroupForm((current) => ({ ...current, lmsGroupId: event.target.value }))}
                                 className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                 placeholder="Manual LMS ID"
                              />
                           </label>
                           {!groupForm.isIntake && (
                              <>
                                 <DateField
                                    label="Starting date"
                                    value={groupForm.startsOn}
                                    onChange={(startsOn) => setGroupForm((current) => ({ ...current, startsOn }))}
                                    required
                                 />
                                 <DateField
                                    label="Ending date"
                                    value={groupForm.endsOn}
                                    onChange={(endsOn) => setGroupForm((current) => ({ ...current, endsOn }))}
                                 />
                              </>
                           )}
                           <LessonTimeField
                              label="Starts"
                              value={groupForm.startsAt}
                              onChange={(startsAt) => setGroupForm((current) => ({ ...current, startsAt }))}
                           />
                           <LessonTimeField
                              label="Ends"
                              value={groupForm.endsAt}
                              onChange={(endsAt) => setGroupForm((current) => ({ ...current, endsAt }))}
                           />
                           {!groupForm.isIntake && (
                              <>
                                 <label className="block">
                                    <span className="text-sm text-slate-300">Active students</span>
                                    <input type="number" min="0" value={groupForm.activeStudentsCount} onChange={(event) => setGroupForm((current) => ({ ...current, activeStudentsCount: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                                 </label>
                              </>
                           )}
                           <div className="flex flex-wrap items-center gap-5 self-end rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                              {!groupForm.isIntake && (
                                 <label className="inline-flex items-center gap-2">
                                    <input
                                       type="checkbox"
                                       checked={groupForm.active}
                                       onChange={(event) =>
                                          setGroupForm((current) => ({
                                             ...current,
                                             active: event.target.checked,
                                             archivedOn: event.target.checked ? "" : current.archivedOn || today,
                                          }))
                                       }
                                       className="h-4 w-4 accent-emerald-500"
                                    />
                                    <span className="text-sm text-slate-300">Active group</span>
                                 </label>
                              )}
                              <label className="inline-flex items-center gap-2">
                                 <input
                                    type="checkbox"
                                    checked={groupForm.isIntake}
                                    onChange={(event) =>
                                       setGroupForm((current) => ({
                                          ...current,
                                          isIntake: event.target.checked,
                                          activeStudentsCount: event.target.checked ? 0 : current.activeStudentsCount,
                                       }))
                                    }
                                    className="h-4 w-4 accent-sky-500"
                                 />
                                 <span className="text-sm text-slate-300">Intake</span>
                              </label>
                           </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                           {ERP_WEEKDAYS.map((weekday) => (
                              <button key={weekday.value} type="button" onClick={() => toggleWeekday(weekday.value)} className={[
                                 "rounded-lg border px-3 py-1.5 text-xs transition",
                                 groupForm.weekdays.includes(weekday.value)
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-slate-700 text-slate-400 hover:bg-slate-800",
                              ].join(" ")}>
                                 {weekday.label.slice(0, 3)}
                              </button>
                           ))}
                        </div>
                        <div className="mt-5 flex gap-2">
                           <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                              <PiFloppyDiskLight size={18} />
                              Save group
                           </button>
                           {groupForm.id && (
                              <button type="button" onClick={() => setGroupForm(EMPTY_GROUP_FORM)} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                                 Cancel
                              </button>
                           )}
                        </div>
                     </form>
                     )}
                     </div>
                  </section>
               )}

               <section className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                     <div className="flex items-center gap-2">
                        <PiUsersThreeLight className="text-emerald-300" size={22} />
                        <h2 className="text-lg font-semibold text-white">Teacher list</h2>
                     </div>
                     {loading ? (
                        <p className="mt-4 text-sm text-slate-500">Loading teachers...</p>
                     ) : groupsByTeacher.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">No teachers yet.</p>
                     ) : (
                        <div className="mt-4 space-y-2">
                           {groupsByTeacher.map((teacher) => (
                              <button key={teacher.id} type="button" onClick={() => setSelectedTeacherId(teacher.id)} className={[
                                 "w-full rounded-lg border px-4 py-3 text-left transition",
                                 selectedTeacher?.id === teacher.id
                                    ? "border-emerald-500/35 bg-emerald-500/10"
                                    : "border-slate-800 bg-slate-950/50 hover:bg-slate-900",
                              ].join(" ")}>
                                 <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                       <p className="truncate font-semibold text-white">{teacher.fullName}</p>
                                       <p className="mt-1 text-xs text-slate-500">
                                          {teacher.activeGroupTotal} groups | {teacher.intakeGroupTotal} intake | {teacher.activeStudentTotal} students
                                       </p>
                                    </div>
                                    <span className={[
                                       "rounded-lg border px-2 py-0.5 text-[11px]",
                                       teacher.active ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-200",
                                    ].join(" ")}>
                                       {teacher.active ? "Active" : "Inactive"}
                                    </span>
                                 </div>
                                 <div className="mt-2 flex items-center gap-2">
                                    <p className="min-w-0 flex-1 truncate text-xs text-slate-500">
                                       {[teacher.phone, teacher.ieltsScore ? `IELTS ${teacher.ieltsScore}` : null, teacher.celtaCertified ? "CELTA" : null, teacher.stage].filter(Boolean).join(" | ") || "No details"}
                                    </p>
                                    {(teacher.lmsTeacherUrl || canManage) && (
                                       <span className="flex shrink-0 flex-col gap-1">
                                          <span
                                             role="button"
                                             tabIndex={teacher.lmsTeacherUrl ? 0 : -1}
                                             aria-disabled={!teacher.lmsTeacherUrl}
                                             onClick={(event) => {
                                                event.stopPropagation();
                                                if (teacher.lmsTeacherUrl) {
                                                   window.open(teacher.lmsTeacherUrl, "_blank", "noopener,noreferrer");
                                                }
                                             }}
                                             onKeyDown={(event) => {
                                                if ((event.key === "Enter" || event.key === " ") && teacher.lmsTeacherUrl) {
                                                   event.preventDefault();
                                                   event.stopPropagation();
                                                   window.open(teacher.lmsTeacherUrl, "_blank", "noopener,noreferrer");
                                                }
                                             }}
                                             className={[
                                                "w-11 rounded-md border px-2 py-1 text-center text-xs transition",
                                                teacher.lmsTeacherUrl
                                                   ? "border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10"
                                                   : "cursor-not-allowed border-slate-800 text-slate-600",
                                             ].join(" ")}>
                                             Go
                                          </span>
                                          {canManage && (
                                             <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(event) => {
                                                   event.stopPropagation();
                                                   editTeacher(teacher);
                                                }}
                                                onKeyDown={(event) => {
                                                   if (event.key === "Enter" || event.key === " ") {
                                                      event.preventDefault();
                                                      event.stopPropagation();
                                                      editTeacher(teacher);
                                                   }
                                                }}
                                                className="w-11 rounded-md border border-slate-700 px-2 py-1 text-center text-xs text-slate-300 transition hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-200">
                                                Edit
                                             </span>
                                          )}
                                       </span>
                                    )}
                                 </div>
                              </button>
                           ))}
                        </div>
                     )}
                  </div>

                  <div className="space-y-4">
                     <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                           <div className="flex items-center gap-2">
                              <PiCalendarBlankLight className="text-emerald-300" size={22} />
                              <h2 className="text-lg font-semibold text-white">
                                 {selectedTeacher?.fullName || "Weekly schedule"}
                              </h2>
                           </div>
                           <div className="flex flex-wrap items-center gap-2">
                              <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">Previous</button>
                              <span className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">{weekStart} to {addDays(weekStart, 6)}</span>
                              <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">Next</button>
                           </div>
                        </div>
                        <div className="mt-4 overflow-x-auto">
                           <div className="grid min-w-[980px] grid-cols-[72px_repeat(7,minmax(120px,1fr))] overflow-hidden rounded-lg border border-slate-800">
                              <div className="border-b border-slate-800 bg-slate-950 p-3 text-xs text-slate-500">Time</div>
                              {weekDays.map((day) => {
                                 const isSunday = getWeekday(day) === 7;
                                 const isToday = day === today;

                                 return (
                                 <div
                                    key={day}
                                    className={[
                                       "border-b border-l p-3",
                                       holidayDates.has(day)
                                          ? "border-red-500/30 bg-red-500/10"
                                          : isToday
                                            ? "border-emerald-500/40 bg-emerald-500/10"
                                            : isSunday
                                              ? "border-slate-800 bg-red-500/10"
                                              : "border-slate-800 bg-slate-950",
                                    ].join(" ")}>
                                    <button
                                       type="button"
                                       onClick={() => openHolidayDialog(day)}
                                       disabled={!canManage}
                                       className="block w-full rounded-md text-left transition hover:bg-slate-900/40 disabled:cursor-default disabled:hover:bg-transparent">
                                    <div className="flex items-start justify-between gap-2">
                                       <div>
                                          <p className="text-sm font-semibold text-white">{weekDayShort(day)}</p>
                                          <p className="mt-0.5 text-xs text-slate-500">{day.slice(5)}</p>
                                       </div>
                                       {isToday && (
                                          <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-200">
                                             Today
                                          </span>
                                       )}
                                    </div>
                                    {holidayDates.has(day) && (
                                       <span className="mt-2 inline-flex rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-200">
                                          Holiday
                                       </span>
                                    )}
                                    </button>
                                 </div>
                                 );
                              })}
                              <div className="bg-slate-950/50">
                                 {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index).map((hour) => (
                                    <div
                                       key={hour}
                                       style={{ height: HOUR_HEIGHT }}
                                       className={[
                                          "border-b px-2 py-1 text-xs font-medium",
                                          hourBarClass(hour),
                                       ].join(" ")}>
                                       {String(hour).padStart(2, "0")}:00
                                    </div>
                                 ))}
                              </div>
                              {weekDays.map((day) => {
                                 const isSunday = getWeekday(day) === 7;
                                 const isToday = day === today;
                                 const scheduleCards: ScheduleCard[] = selectedTeacher && !holidayDates.has(day)
                                    ? [
                                         ...groups
                                            .filter(
                                               (group) =>
                                                  group.teacherId === selectedTeacher.id &&
                                                  groupIsOnDate(group, day) &&
                                                  !coverByGroupDate.has(`${group.id}:${day}`),
                                            )
                                            .map((group) => ({
                                               key: `lesson:${group.id}:${day}`,
                                               group,
                                               variant: group.isIntake ? "intake" as const : "lesson" as const,
                                            })),
                                         ...effectiveCovers
                                            .filter((cover) => cover.coveringTeacherId === selectedTeacher.id && cover.coverDate === day)
                                            .flatMap((cover) => {
                                               const group = groupById.get(cover.lessonGroupId);
                                               if (!group || !groupIsOnDate(group, day)) return [];

                                               return [{
                                                  key: `cover:${cover.id}`,
                                                  group,
                                                  variant: "cover" as const,
                                                  coveringFor: group.teacherName,
                                               }];
                                            }),
                                      ].sort((left, right) => left.group.startsAt.localeCompare(right.group.startsAt))
                                    : [];
                                 const slotTotals = new Map<string, number>();
                                 const slotIndexes = new Map<string, number>();

                                 for (const card of scheduleCards) {
                                    const slotKey = `${card.group.startsAt}:${card.group.endsAt}`;
                                    slotTotals.set(slotKey, (slotTotals.get(slotKey) || 0) + 1);
                                 }

                                 return (
                                    <div
                                       key={day}
                                       className={[
                                          "relative border-l",
                                       holidayDates.has(day)
                                          ? "border-red-500/30 bg-red-500/10"
                                          : isToday
                                             ? "border-emerald-500/40 bg-emerald-500/10"
                                             : isSunday
                                               ? "border-slate-800 bg-red-500/10"
                                               : "border-slate-800 bg-slate-950/30",
                                       ].join(" ")}
                                       style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
                                       {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
                                          <div key={index} style={{ height: HOUR_HEIGHT }} className="pointer-events-none border-b border-slate-800/80" />
                                       ))}
                                       {scheduleCards.map((card) => {
                                          const top = Math.max(0, timeToMinutes(card.group.startsAt) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
                                          const height = Math.max(36, (timeToMinutes(card.group.endsAt) - timeToMinutes(card.group.startsAt)) * (HOUR_HEIGHT / 60));
                                          const slotKey = `${card.group.startsAt}:${card.group.endsAt}`;
                                          const slotTotal = slotTotals.get(slotKey) || 1;
                                          const slotIndex = slotIndexes.get(slotKey) || 0;
                                          slotIndexes.set(slotKey, slotIndex + 1);

                                          return (
                                             <button
                                                key={card.key}
                                                type="button"
                                                onClick={() => canManage && editGroup(card.group)}
                                                style={{
                                                   top,
                                                   height,
                                                   left: `calc(${(slotIndex / slotTotal) * 100}% + 0.5rem)`,
                                                   right: `calc(${((slotTotal - slotIndex - 1) / slotTotal) * 100}% + 0.5rem)`,
                                                }}
                                                   className={[
                                                      "absolute z-10 overflow-hidden rounded-lg p-2 text-left shadow-lg shadow-slate-950/30 transition",
                                                      card.variant === "cover"
                                                         ? "border border-amber-500/35 bg-amber-100 text-slate-950 hover:bg-amber-200"
                                                         : card.variant === "intake"
                                                           ? "border border-sky-500/35 bg-sky-100 text-slate-950 hover:bg-sky-200"
                                                           : "border border-emerald-500/30 bg-emerald-100 text-slate-950 hover:bg-emerald-200",
                                                   ].join(" ")}>
                                                <p
                                                   className={[
                                                      "truncate text-xs font-semibold",
                                                      card.variant === "cover"
                                                         ? "text-amber-800"
                                                         : card.variant === "intake"
                                                           ? "text-sky-800"
                                                           : "text-emerald-800",
                                                   ].join(" ")}>
                                                   {card.group.lmsGroupName || card.group.levelName}
                                                </p>
                                                <p className="mt-1 text-[11px] text-slate-800">
                                                   {card.group.startsAt} - {card.group.endsAt}
                                                </p>
                                                {card.group.lmsGroupId && (
                                                   <p className="mt-1 truncate text-[10px] text-slate-700">
                                                      ID {card.group.lmsGroupId}
                                                   </p>
                                                )}
                                                {card.variant === "cover" ? (
                                                   <p className="mt-1 truncate text-[10px] font-medium text-amber-800">
                                                      Cover for {card.coveringFor}
                                                   </p>
                                                ) : card.variant === "intake" ? (
                                                   <p className="mt-1 truncate text-[10px] font-medium text-sky-800">
                                                      Intake
                                                   </p>
                                                ) : (
                                                   <p className="mt-1 truncate text-[10px] text-slate-700">
                                                      {card.group.startsOn} to {card.group.endsOn || "open"}
                                                   </p>
                                                )}
                                             </button>
                                          );
                                       })}
                                    </div>
                                 );
                              })}
                           </div>
                        </div>
                     </div>

                     <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                           <div>
                              <h2 className="text-lg font-semibold text-white">Groups</h2>
                              <p className="mt-1 text-sm text-slate-500">
                                 {showArchivedGroups ? "Showing active and archived groups" : "Showing active groups"}
                              </p>
                           </div>
                           <button
                              type="button"
                              onClick={() => setShowArchivedGroups((current) => !current)}
                              className={[
                                 "inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                                 showArchivedGroups
                                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                    : "border-slate-700 text-slate-300 hover:bg-slate-800",
                              ].join(" ")}>
                              <PiArchiveLight size={18} />
                              Archived groups
                           </button>
                        </div>
                        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                           {selectedTeacherGroups.length === 0 ? (
                              <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-sm text-slate-500">
                                 {showArchivedGroups ? "No groups yet." : "No active groups."}
                              </div>
                           ) : selectedTeacherGroups.map((group) => (
                              <div key={group.id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
                                 <div className="flex items-start justify-between gap-3">
                                    <div>
                                       <div className="flex flex-wrap items-center gap-2">
                                          <p className="font-semibold text-white">{group.lmsGroupName || group.levelName}</p>
                                          {group.isIntake && (
                                             <span className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200">
                                                Intake
                                             </span>
                                          )}
                                          {!group.active && (
                                             <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                                                Archived
                                             </span>
                                          )}
                                       </div>
                                       <p className="mt-1 text-sm text-slate-400">
                                          {group.levelName} | {group.startsAt} - {group.endsAt}
                                       </p>
                                       {group.lmsGroupId && (
                                          <p className="mt-1 text-xs text-slate-500">ID {group.lmsGroupId}</p>
                                       )}
                                    </div>
                                    {!group.isIntake && (
                                       <span className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{group.activeStudentsCount} students</span>
                                    )}
                                 </div>
                                 <p className="mt-3 text-xs text-slate-500">
                                    {group.weekdays.map((day) => ERP_WEEKDAYS.find((weekday) => weekday.value === day)?.label.slice(0, 3)).join(", ")}
                                    {!group.isIntake && ` | ${group.startsOn} to ${group.endsOn || "open"}`}
                                 </p>
                                 {canManage && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                       <button
                                          type="button"
                                          onClick={() => editGroup(group)}
                                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800">
                                          Edit
                                       </button>
                                       <button
                                          type="button"
                                          onClick={() => {
                                             if (group.lmsGroupId) {
                                                window.open(
                                                   `https://main.ieltszoneapp.uz/admin/groups/${encodeURIComponent(group.lmsGroupId)}`,
                                                   "_blank",
                                                   "noopener,noreferrer",
                                                );
                                             }
                                          }}
                                          disabled={!group.lmsGroupId}
                                          className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">
                                          Go
                                       </button>
                                       <button
                                          type="button"
                                          onClick={() => void updateGroupActive(group, !group.active)}
                                          disabled={saving}
                                          className={[
                                             "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition disabled:opacity-60",
                                             group.active
                                                ? "border-amber-500/30 text-amber-200 hover:bg-amber-500/10"
                                                : "border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10",
                                          ].join(" ")}>
                                          {group.active ? <PiArchiveLight size={15} /> : <PiArrowCounterClockwiseLight size={15} />}
                                          {group.active ? "Archive" : "Restore"}
                                       </button>
                                    </div>
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </section>
            </div>
         ) : (
            <section className="space-y-4">
               <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                     <div>
                        <h2 className="text-lg font-semibold text-white">Monthly covers</h2>
                        <p className="mt-1 text-sm text-slate-400">
                           {monthLabel(month)}
                        </p>
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={() => moveMonth(-1)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">Previous</button>
                        <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                        <button type="button" onClick={() => moveMonth(1)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">Next</button>
                     </div>
                  </div>

                  <div className="mt-4 overflow-x-auto pb-2">
                     <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-left text-sm">
                        <thead>
                           <tr>
                              <th className="sticky left-0 z-10 w-56 border border-slate-800 bg-slate-950 px-3 py-3 text-xs uppercase tracking-[0.14em] text-slate-500">
                                 Teacher
                              </th>
                              {monthDays.map((day) => {
                                 const isSunday = getWeekday(day) === 7;
                                 const isToday = day === today;

                                 return (
                                 <th
                                    key={day}
                                    className={[
                                       "w-24 border-y border-r px-2 py-3 text-center text-xs",
                                       isToday
                                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                          : isSunday
                                            ? "border-slate-800 bg-red-500/10 text-red-200"
                                            : "border-slate-800 bg-slate-950 text-slate-500",
                                    ].join(" ")}>
                                    <button
                                       type="button"
                                       onClick={() => openHolidayDialog(day)}
                                       disabled={!canManage}
                                       className="block w-full rounded-md transition hover:bg-slate-900/40 disabled:cursor-default disabled:hover:bg-transparent">
                                       <span className="block text-slate-300">{Number(day.slice(8))}</span>
                                       {weekDayShort(day)}
                                       {isToday && (
                                          <span className="mt-1 block rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5 text-[10px] font-semibold text-emerald-200">
                                             Today
                                          </span>
                                       )}
                                       {holidayDates.has(day) && (
                                          <span className="mt-1 block rounded-md border border-red-500/30 bg-red-500/10 px-1 py-0.5 text-[10px] font-semibold text-red-200">
                                             Holiday
                                          </span>
                                       )}
                                    </button>
                                 </th>
                                 );
                              })}
                           </tr>
                        </thead>
                        <tbody>
                           {activeTeachers.map((teacher) => (
                              <tr key={teacher.id}>
                                 <th className="sticky left-0 z-10 border-x border-b border-slate-800 bg-slate-950 px-3 py-3 align-top">
                                    <p className="font-semibold text-white">{teacher.fullName}</p>
                                    <p className="mt-1 text-xs text-slate-500">
                                       Asked {coverStats.asked.get(teacher.id) || 0} | Covered {coverStats.covered.get(teacher.id) || 0}
                                    </p>
                                 </th>
                                 {monthDays.map((day) => {
                                    const isSunday = getWeekday(day) === 7;
                                    const isToday = day === today;
                                    const dayGroups = groups.filter((group) => group.teacherId === teacher.id && !group.isIntake && groupIsOnDate(group, day) && !holidayDates.has(day));

                                    return (
                                       <td
                                          key={`${teacher.id}:${day}`}
                                          className={[
                                             "h-24 border-b border-r p-1 align-top",
                                             holidayDates.has(day)
                                                ? "border-red-500/30 bg-red-500/10"
                                                : isToday
                                                  ? "border-emerald-500/40 bg-emerald-500/10"
                                                  : isSunday
                                                    ? "border-slate-800 bg-red-500/10"
                                                  : "border-slate-800 bg-slate-950/30",
                                          ].join(" ")}>
                                          <div className="space-y-1">
                                             {dayGroups.map((group) => {
                                                const cover = coverByGroupDate.get(`${group.id}:${day}`) || null;

                                                return (
                                                   <button key={group.id} type="button" onClick={() => openCover(group, day)} className="block w-full rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-left text-[11px] text-emerald-100 transition hover:bg-emerald-500/20">
                                                      <span className="block truncate">{group.lmsGroupName || group.levelName}</span>
                                                      <span className="block truncate text-[10px] text-slate-400">{group.startsAt}</span>
                                                      {group.lmsGroupId && (
                                                         <span className="block truncate text-[10px] text-slate-400">ID {group.lmsGroupId}</span>
                                                      )}
                                                      <CoverBadge cover={cover} teachers={teachers} />
                                                   </button>
                                                );
                                             })}
                                          </div>
                                       </td>
                                    );
                                 })}
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>

               <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                     <h2 className="text-lg font-semibold text-white">Asked for cover</h2>
                     <div className="mt-4 space-y-2">
                        {activeTeachers.map((teacher) => (
                           <div key={teacher.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                              <span className="text-sm text-slate-200">{teacher.fullName}</span>
                              <span className="text-sm font-semibold text-white">{coverStats.asked.get(teacher.id) || 0}</span>
                           </div>
                        ))}
                     </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                     <h2 className="text-lg font-semibold text-white">Covered lessons</h2>
                     <div className="mt-4 space-y-2">
                        {[...coverStats.covered.entries()].map(([key, count]) => (
                           <div key={key} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                              <span className="text-sm text-slate-200">
                                 {key.startsWith("another:")
                                    ? key.replace("another:", "")
                                    : teachers.find((teacher) => teacher.id === key)?.fullName || "Teacher"}
                              </span>
                              <span className="text-sm font-semibold text-white">{count}</span>
                           </div>
                        ))}
                     </div>
                  </div>
               </div>
            </section>
         )}

         {holidayDate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
               <div className="w-full max-w-sm rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-2xl">
                  <h2 className="text-lg font-semibold text-white">Holiday day</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                     Should {holidayDate} be a holiday? All lessons on this date will be hidden from schedules and covers.
                  </p>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                     <button
                        type="button"
                        onClick={() => setHolidayDate(null)}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Cancel
                     </button>
                     {holidayDates.has(holidayDate) ? (
                        <button
                           type="button"
                           onClick={() => void clearHoliday()}
                           disabled={saving}
                           className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-60">
                           {saving ? "Restoring..." : "Restore lessons"}
                        </button>
                     ) : (
                        <button
                           type="button"
                           onClick={() => void saveHoliday()}
                           disabled={saving}
                           className="inline-flex flex-1 items-center justify-center rounded-lg bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-60">
                           {saving ? "Saving..." : "Mark as holiday"}
                        </button>
                     )}
                  </div>
               </div>
            </div>
         )}

         {coverDraft && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
               <form onSubmit={saveCover} className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                     <div>
                        <h2 className="text-lg font-semibold text-white">Lesson cover</h2>
                        <p className="mt-1 text-sm text-slate-400">
                           {coverDraft.group.teacherName} | {coverDraft.group.levelName} | {coverDraft.date}
                        </p>
                     </div>
                     <button type="button" onClick={() => setCoverDraft(null)} className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Close
                     </button>
                  </div>

                  <label className="mt-5 block">
                     <span className="text-sm text-slate-300">Covering teacher</span>
                     <select value={coverDraft.coveringTeacherId} onChange={(event) => setCoverDraft((current) => current ? { ...current, coveringTeacherId: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required>
                        <option value="">Choose teacher</option>
                        {activeTeachers.map((teacher) => (
                           <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>
                        ))}
                        <option value="another">Another</option>
                     </select>
                  </label>

                  {coverDraft.coveringTeacherId === "another" && (
                     <label className="mt-4 block">
                        <span className="text-sm text-slate-300">Another teacher name</span>
                        <input value={coverDraft.coveringTeacherName} onChange={(event) => setCoverDraft((current) => current ? { ...current, coveringTeacherName: event.target.value } : current)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required />
                     </label>
                  )}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                     <button type="submit" disabled={saving} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        <PiFloppyDiskLight size={18} />
                        {saving ? "Saving..." : "Save cover"}
                     </button>
                     {coverDraft.existingCover && (
                        <button type="button" onClick={() => void clearCover()} disabled={saving} className="rounded-lg border border-red-500/30 px-4 py-2.5 text-sm text-red-200 transition hover:bg-red-500/10 disabled:opacity-60">
                           Clear
                        </button>
                     )}
                  </div>
               </form>
            </div>
         )}
      </div>
   );
}
