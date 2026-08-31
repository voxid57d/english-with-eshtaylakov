"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
   startsOn: string;
   endsOn: string | null;
   startsAt: string;
   endsAt: string;
   weekdays: number[];
   activeStudentsCount: number;
   active: boolean;
};

type CoverView = {
   id: string;
   lessonGroupId: string;
   teacherId: string | null;
   coverDate: string;
   coveringTeacherId: string | null;
   coveringTeacherName: string | null;
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
   startsOn: string;
   endsOn: string;
   startsAt: string;
   endsAt: string;
   weekdays: number[];
   activeStudentsCount: number;
   active: boolean;
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
   startsOn: new Date().toISOString().slice(0, 10),
   endsOn: "",
   startsAt: "09:00",
   endsAt: "10:30",
   weekdays: [1, 3, 5],
   activeStudentsCount: 0,
   active: true,
};

const START_HOUR = 8;
const END_HOUR = 21;
const HOUR_HEIGHT = 64;

function addDays(dateValue: string, days: number) {
   const date = new Date(`${dateValue}T00:00:00.000Z`);
   date.setUTCDate(date.getUTCDate() + days);
   return date.toISOString().slice(0, 10);
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
   return (
      group.active &&
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
   const [activeTab, setActiveTab] = useState<"lessons" | "covers">("lessons");
   const [teachers, setTeachers] = useState<TeacherView[]>([]);
   const [levels, setLevels] = useState<LevelView[]>([]);
   const [groups, setGroups] = useState<GroupView[]>([]);
   const [covers, setCovers] = useState<CoverView[]>([]);
   const [canManage, setCanManage] = useState(false);
   const [selectedTeacherId, setSelectedTeacherId] = useState("");
   const [teacherForm, setTeacherForm] = useState<TeacherForm>(EMPTY_TEACHER_FORM);
   const [levelForm, setLevelForm] = useState<LevelForm>(EMPTY_LEVEL_FORM);
   const [groupForm, setGroupForm] = useState<GroupForm>(EMPTY_GROUP_FORM);
   const [showArchivedGroups, setShowArchivedGroups] = useState(false);
   const [weekStart, setWeekStart] = useState(getWeekStart());
   const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
   const [coverDraft, setCoverDraft] = useState<CoverDraft | null>(null);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const activeTeachers = useMemo(() => teachers.filter((teacher) => teacher.active), [teachers]);
   const selectedTeacher = teachers.find((teacher) => teacher.id === selectedTeacherId) || activeTeachers[0] || teachers[0];
   const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
   const monthDays = useMemo(() => getMonthDays(month), [month]);

   const coverByGroupDate = useMemo(() => {
      return new Map(covers.map((cover) => [`${cover.lessonGroupId}:${cover.coverDate}`, cover]));
   }, [covers]);

   const groupsByTeacher = useMemo(() => {
      return teachers.map((teacher) => {
         const teacherGroups = groups.filter((group) => group.teacherId === teacher.id);
         const activeStudentTotal = teacherGroups
            .filter((group) => group.active)
            .reduce((sum, group) => sum + group.activeStudentsCount, 0);

         return {
            ...teacher,
            groups: teacherGroups,
            activeStudentTotal,
         };
      });
   }, [groups, teachers]);

   const coverStats = useMemo(() => {
      const asked = new Map<string, number>();
      const covered = new Map<string, number>();

      for (const cover of covers) {
         if (cover.teacherId) {
            asked.set(cover.teacherId, (asked.get(cover.teacherId) || 0) + 1);
         }

         const covererKey = cover.coveringTeacherId || `another:${cover.coveringTeacherName || "Another"}`;
         covered.set(covererKey, (covered.get(covererKey) || 0) + 1);
      }

      return { asked, covered };
   }, [covers]);

   const selectedTeacherGroups = useMemo(() => {
      return groups.filter(
         (group) =>
            (!selectedTeacher || group.teacherId === selectedTeacher.id) &&
            (showArchivedGroups || group.active),
      );
   }, [groups, selectedTeacher, showArchivedGroups]);

   const loadTeachers = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(`/api/erp/teachers?month=${month}`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load teachers.");
         }

         setTeachers(payload.teachers || []);
         setLevels(payload.levels || []);
         setGroups(payload.groups || []);
         setCovers(payload.covers || []);
         setCanManage(Boolean(payload.canManage));
         setSelectedTeacherId((current) => current || payload.teachers?.[0]?.id || "");
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to load teachers.");
      } finally {
         setLoading(false);
      }
   }, [month]);

   useEffect(() => {
      void loadTeachers();
   }, [loadTeachers]);

   const saveEntity = async (entity: string, body: Record<string, unknown>, method: "POST" | "PATCH" = "POST") => {
      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
         const token = await getSupabaseAccessToken();
         const response = await fetch(`/api/erp/teachers?month=${month}`, {
            method,
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ entity, ...body }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save teacher data.");
         }

         setTeachers(payload.teachers || []);
         setLevels(payload.levels || []);
         setGroups(payload.groups || []);
         setCovers(payload.covers || []);
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
         active: teacher.active,
      });
   };

   const editGroup = (group: GroupView) => {
      setGroupForm({
         id: group.id,
         teacherId: group.teacherId,
         levelId: group.levelId,
         startsOn: group.startsOn,
         endsOn: group.endsOn || "",
         startsAt: group.startsAt,
         endsAt: group.endsAt,
         weekdays: group.weekdays,
         activeStudentsCount: group.activeStudentsCount,
         active: group.active,
      });
   };

   const updateGroupActive = async (group: GroupView, active: boolean) => {
      await saveEntity(
         "group",
         {
            id: group.id,
            teacherId: group.teacherId,
            levelId: group.levelId,
            startsOn: group.startsOn,
            endsOn: group.endsOn || "",
            startsAt: group.startsAt,
            endsAt: group.endsAt,
            weekdays: group.weekdays,
            activeStudentsCount: group.activeStudentsCount,
            active,
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
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Academic
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Teachers
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Manage teacher profiles, lesson groups, weekly schedules, and monthly covers.
                  </p>
               </div>
               <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Teachers</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{activeTeachers.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Groups</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{groups.filter((group) => group.active).length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Students</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {groups.filter((group) => group.active).reduce((sum, group) => sum + group.activeStudentsCount, 0)}
                     </p>
                  </div>
               </div>
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

         <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-1">
            <button
               type="button"
               onClick={() => setActiveTab("lessons")}
               className={[
                  "rounded-lg px-4 py-2 text-sm transition",
                  activeTab === "lessons" ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-slate-900",
               ].join(" ")}>
               Teachers&apos; lessons
            </button>
            <button
               type="button"
               onClick={() => setActiveTab("covers")}
               className={[
                  "rounded-lg px-4 py-2 text-sm transition",
                  activeTab === "covers" ? "bg-emerald-500 text-slate-950" : "text-slate-300 hover:bg-slate-900",
               ].join(" ")}>
               Covers
            </button>
         </div>

         {activeTab === "lessons" ? (
            <div className="space-y-4">
               {canManage && (
                  <section className="grid grid-cols-1 gap-4 2xl:grid-cols-[420px_320px_1fr]">
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
                              <label className="block">
                                 <span className="text-sm text-slate-300">Birthday</span>
                                 <input type="date" value={teacherForm.birthday} onChange={(event) => setTeacherForm((current) => ({ ...current, birthday: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                              </label>
                              <label className="block">
                                 <span className="text-sm text-slate-300">Started working</span>
                                 <input type="date" value={teacherForm.startedWorkingOn} onChange={(event) => setTeacherForm((current) => ({ ...current, startedWorkingOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                              </label>
                           </div>
                           <label className="block">
                              <span className="text-sm text-slate-300">Stage</span>
                              <input value={teacherForm.stage} onChange={(event) => setTeacherForm((current) => ({ ...current, stage: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" placeholder="Current stage" />
                           </label>
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
                              <button key={level.id} type="button" onClick={() => setLevelForm({ id: level.id, name: level.name, active: level.active })} className="flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-900">
                                 <span className="truncate">{level.name}</span>
                                 <span className="text-xs text-slate-500">{level.active ? "Active" : "Off"}</span>
                              </button>
                           ))}
                        </div>
                     </form>

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
                              <span className="text-sm text-slate-300">Starting date</span>
                              <input type="date" value={groupForm.startsOn} onChange={(event) => setGroupForm((current) => ({ ...current, startsOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required />
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Ending date</span>
                              <input type="date" value={groupForm.endsOn} onChange={(event) => setGroupForm((current) => ({ ...current, endsOn: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Starts</span>
                              <input type="time" value={groupForm.startsAt} onChange={(event) => setGroupForm((current) => ({ ...current, startsAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required />
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Ends</span>
                              <input type="time" value={groupForm.endsAt} onChange={(event) => setGroupForm((current) => ({ ...current, endsAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" required />
                           </label>
                           <label className="block">
                              <span className="text-sm text-slate-300">Active students</span>
                              <input type="number" min="0" value={groupForm.activeStudentsCount} onChange={(event) => setGroupForm((current) => ({ ...current, activeStudentsCount: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400" />
                           </label>
                           <label className="flex items-center gap-3 self-end rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                              <input type="checkbox" checked={groupForm.active} onChange={(event) => setGroupForm((current) => ({ ...current, active: event.target.checked }))} className="h-4 w-4 accent-emerald-500" />
                              <span className="text-sm text-slate-300">Active group</span>
                           </label>
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
                              <button key={teacher.id} type="button" onClick={() => { setSelectedTeacherId(teacher.id); if (canManage) editTeacher(teacher); }} className={[
                                 "w-full rounded-lg border px-4 py-3 text-left transition",
                                 selectedTeacher?.id === teacher.id
                                    ? "border-emerald-500/35 bg-emerald-500/10"
                                    : "border-slate-800 bg-slate-950/50 hover:bg-slate-900",
                              ].join(" ")}>
                                 <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                       <p className="truncate font-semibold text-white">{teacher.fullName}</p>
                                       <p className="mt-1 text-xs text-slate-500">
                                          {teacher.groups.filter((group) => group.active).length} groups | {teacher.activeStudentTotal} students
                                       </p>
                                    </div>
                                    <span className={[
                                       "rounded-lg border px-2 py-0.5 text-[11px]",
                                       teacher.active ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200" : "border-red-500/25 bg-red-500/10 text-red-200",
                                    ].join(" ")}>
                                       {teacher.active ? "Active" : "Inactive"}
                                    </span>
                                 </div>
                                 <p className="mt-2 truncate text-xs text-slate-500">
                                    {[teacher.phone, teacher.ieltsScore ? `IELTS ${teacher.ieltsScore}` : null, teacher.celtaCertified ? "CELTA" : null, teacher.stage].filter(Boolean).join(" | ") || "No details"}
                                 </p>
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
                              {weekDays.map((day) => (
                                 <div key={day} className="border-b border-l border-slate-800 bg-slate-950 p-3">
                                    <p className="text-sm font-semibold text-white">{weekDayShort(day)}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">{day.slice(5)}</p>
                                 </div>
                              ))}
                              <div className="bg-slate-950/50">
                                 {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => START_HOUR + index).map((hour) => (
                                    <div key={hour} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-800 px-2 py-1 text-xs text-slate-500">
                                       {String(hour).padStart(2, "0")}:00
                                    </div>
                                 ))}
                              </div>
                              {weekDays.map((day) => {
                                 const dayGroups = selectedTeacher
                                    ? groups.filter((group) => group.teacherId === selectedTeacher.id && groupIsOnDate(group, day))
                                    : [];

                                 return (
                                    <div key={day} className="relative border-l border-slate-800 bg-slate-950/30" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
                                       {Array.from({ length: END_HOUR - START_HOUR }, (_, index) => (
                                          <div key={index} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-800/80" />
                                       ))}
                                       {dayGroups.map((group) => {
                                          const top = Math.max(0, timeToMinutes(group.startsAt) - START_HOUR * 60) * (HOUR_HEIGHT / 60);
                                          const height = Math.max(36, (timeToMinutes(group.endsAt) - timeToMinutes(group.startsAt)) * (HOUR_HEIGHT / 60));

                                          return (
                                             <button key={group.id} type="button" onClick={() => canManage && editGroup(group)} style={{ top, height }} className="absolute left-2 right-2 overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/15 p-2 text-left shadow-lg shadow-slate-950/30 transition hover:bg-emerald-500/20">
                                                <p className="truncate text-xs font-semibold text-emerald-100">{group.levelName}</p>
                                                <p className="mt-1 text-[11px] text-slate-300">{group.startsAt} - {group.endsAt}</p>
                                                <p className="mt-1 truncate text-[10px] text-slate-400">{group.startsOn} to {group.endsOn || "open"}</p>
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
                                          <p className="font-semibold text-white">{group.levelName}</p>
                                          {!group.active && (
                                             <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                                                Archived
                                             </span>
                                          )}
                                       </div>
                                       <p className="mt-1 text-sm text-slate-400">{group.startsAt} - {group.endsAt}</p>
                                    </div>
                                    <span className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{group.activeStudentsCount} students</span>
                                 </div>
                                 <p className="mt-3 text-xs text-slate-500">
                                    {group.weekdays.map((day) => ERP_WEEKDAYS.find((weekday) => weekday.value === day)?.label.slice(0, 3)).join(", ")} | {group.startsOn} to {group.endsOn || "open"}
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
                              {monthDays.map((day) => (
                                 <th key={day} className="w-24 border-y border-r border-slate-800 bg-slate-950 px-2 py-3 text-center text-xs text-slate-500">
                                    <span className="block text-slate-300">{Number(day.slice(8))}</span>
                                    {weekDayShort(day)}
                                 </th>
                              ))}
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
                                    const dayGroups = groups.filter((group) => group.teacherId === teacher.id && groupIsOnDate(group, day));

                                    return (
                                       <td key={`${teacher.id}:${day}`} className="h-24 border-b border-r border-slate-800 bg-slate-950/30 p-1 align-top">
                                          <div className="space-y-1">
                                             {dayGroups.map((group) => {
                                                const cover = coverByGroupDate.get(`${group.id}:${day}`) || null;

                                                return (
                                                   <button key={group.id} type="button" onClick={() => openCover(group, day)} className="block w-full rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-left text-[11px] text-emerald-100 transition hover:bg-emerald-500/20">
                                                      <span className="block truncate">{group.levelName}</span>
                                                      <span className="block truncate text-[10px] text-slate-400">{group.startsAt}</span>
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
