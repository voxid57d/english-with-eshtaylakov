"use client";

import { useLocalToday } from "@/lib/useLocalToday";
import { getLocalDateString } from "@/lib/localDate";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
   PiCalendarBlankLight,
   PiCaretLeftLight,
   PiCaretRightLight,
   PiCheckCircleLight,
   PiNotePencilLight,
   PiPlusLight,
   PiTrashLight,
   PiXLight,
} from "react-icons/pi";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type TaskRole =
   | "admin"
   | "branch_manager"
   | "sales_manager"
   | "salesman"
   | "assistant"
   | "cashier";

type TaskMember = {
   user_id: string;
   role: TaskRole;
   manager_id: string | null;
   display_name: string | null;
   primary_branch_id: string | null;
   branch_name: string | null;
   active: boolean;
};

type TaskTemplate = {
   id: string;
   title: string;
   description: string | null;
   created_by: string;
   assigned_to: string;
   branch_id: string | null;
   frequency_type: "daily" | "weekly" | "monthly" | "once";
   weekdays: number[] | null;
   month_days: number[] | null;
   start_date: string;
   end_date: string | null;
   active: boolean;
   created_at: string;
   updated_at: string;
};

type TaskComment = {
   id: string;
   task_id: string;
   occurrence_date: string;
   user_id: string;
   body: string;
   created_at: string;
};

type TaskOccurrence = {
   task: TaskTemplate;
   date: string;
   isCompleted: boolean;
   completedAt: string | null;
   completedBy: string | null;
   comments: TaskComment[];
};

type TaskResponse = {
   viewer: TaskMember;
   members: TaskMember[];
   range: {
      startDate: string;
      endDate: string;
   };
   occurrences: TaskOccurrence[];
   progress: {
      total: number;
      completed: number;
      percentage: number;
   };
};

type TaskFormState = {
   id: string | null;
   title: string;
   description: string;
   assignedTo: string;
   frequencyType: TaskTemplate["frequency_type"];
   weekdays: number[];
   monthDays: string;
   startDate: string;
   endDate: string;
};

const WEEKDAYS = [
   { value: 1, label: "Mon" },
   { value: 2, label: "Tue" },
   { value: 3, label: "Wed" },
   { value: 4, label: "Thu" },
   { value: 5, label: "Fri" },
   { value: 6, label: "Sat" },
   { value: 0, label: "Sun" },
];

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayString() {
   return getLocalDateString();
}

function parseDate(value: string) {
   const [year, month, day] = value.split("-").map(Number);
   return new Date(Date.UTC(year, month - 1, day));
}

function toDateString(date: Date) {
   return date.toISOString().slice(0, 10);
}

function addMonths(date: Date, amount: number) {
   return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1));
}

function getCalendarCells(monthDate: Date) {
   const monthStart = new Date(
      Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1),
   );
   const firstWeekday = (monthStart.getUTCDay() + 6) % 7;
   const calendarStart = new Date(monthStart);
   calendarStart.setUTCDate(monthStart.getUTCDate() - firstWeekday);

   return Array.from({ length: 42 }, (_, index) => {
      const cellDate = new Date(calendarStart);
      cellDate.setUTCDate(calendarStart.getUTCDate() + index);

      return {
         date: cellDate,
         value: toDateString(cellDate),
         isCurrentMonth: cellDate.getUTCMonth() === monthDate.getUTCMonth(),
      };
   });
}

function formatDate(value: string) {
   return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
   }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonth(value: string) {
   return new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
   }).format(new Date(`${value}T00:00:00Z`));
}

function getMemberName(members: TaskMember[], userId: string | null) {
   if (!userId) return "Unknown";
   const member = members.find((entry) => entry.user_id === userId);
   return member?.display_name?.trim() || member?.user_id.slice(0, 8) || "Unknown";
}

function getMemberBranchName(members: TaskMember[], userId: string | null) {
   if (!userId) return null;
   const member = members.find((entry) => entry.user_id === userId);
   return member?.branch_name || null;
}

function roleLabel(role: TaskRole) {
   if (role === "admin") return "Admin";
   if (role === "branch_manager") return "Branch Manager";
   if (role === "sales_manager") return "Sales Manager";
   if (role === "salesman") return "Salesman";
   if (role === "assistant") return "Assistant";
   return "Cashier";
}

function canManageTasks(role: TaskRole | undefined) {
   return role === "admin" || role === "branch_manager" || role === "sales_manager";
}

function isStaffRole(role: TaskRole) {
   return role !== "admin" && role !== "branch_manager" && role !== "sales_manager";
}

function emptyForm(date: string, assignedTo: string): TaskFormState {
   return {
      id: null,
      title: "",
      description: "",
      assignedTo,
      frequencyType: "daily",
      weekdays: [1],
      monthDays: "1",
      startDate: date,
      endDate: "",
   };
}

function recurrenceLabel(task: TaskTemplate) {
   if (task.frequency_type === "daily") return "Daily";
   if (task.frequency_type === "once") return "One time";
   if (task.frequency_type === "weekly") {
      const days = WEEKDAYS.filter((day) => (task.weekdays || []).includes(day.value))
         .map((day) => day.label)
         .join(", ");
      return `Every ${days || "week"}`;
   }

   const days = (task.month_days || []).join(", ");
   return `Monthly on ${days || "selected days"}`;
}

function parseMonthDays(value: string) {
   return Array.from(
      new Set(
         value
            .split(",")
            .map((entry) => Number(entry.trim()))
            .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 31),
      ),
   ).sort((a, b) => a - b);
}

function DatePickerPopover({
   value,
   startDate,
   isOpen,
   onOpenChange,
   onChange,
}: {
   value: string;
   startDate: string;
   isOpen: boolean;
   onOpenChange: (isOpen: boolean) => void;
   onChange: (value: string) => void;
}) {
   const [calendarMonth, setCalendarMonth] = useState(() =>
      parseDate(value || startDate || todayString()),
   );
   const calendarCells = useMemo(() => getCalendarCells(calendarMonth), [calendarMonth]);
   const today = useLocalToday();

   return (
      <div className="relative mt-1">
         <button
            type="button"
            onClick={() => {
               if (!isOpen) {
                  setCalendarMonth(parseDate(value || startDate || todayString()));
               }
               onOpenChange(!isOpen);
            }}
            className="flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-left text-sm outline-none transition hover:border-emerald-500">
            <span className={value ? "text-slate-100" : "text-slate-500"}>
               {value ? formatDate(value) : "No end date"}
            </span>
            <PiCalendarBlankLight className="shrink-0 text-slate-500" size={18} />
         </button>

         {isOpen && (
            <div className="absolute left-0 top-[calc(100%+8px)] z-30 w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-slate-700 bg-slate-950 p-3 shadow-2xl shadow-black/50">
               <div className="flex items-center justify-between gap-2">
                  <button
                     type="button"
                     onClick={() => setCalendarMonth((current) => addMonths(current, -1))}
                     className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-300 transition hover:bg-slate-800"
                     aria-label="Previous month">
                     <PiCaretLeftLight size={17} />
                  </button>
                  <p className="text-sm font-semibold text-slate-100">
                     {formatMonth(toDateString(calendarMonth))}
                  </p>
                  <button
                     type="button"
                     onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                     className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-800 text-slate-300 transition hover:bg-slate-800"
                     aria-label="Next month">
                     <PiCaretRightLight size={17} />
                  </button>
               </div>

               <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
                  {CALENDAR_WEEKDAYS.map((day) => (
                     <span key={day}>{day}</span>
                  ))}
               </div>

               <div className="mt-2 grid grid-cols-7 gap-1">
                  {calendarCells.map((cell) => {
                     const isSelected = value === cell.value;
                     const isToday = today === cell.value;
                     const isBeforeStart = startDate ? cell.value < startDate : false;

                     return (
                        <button
                           key={cell.value}
                           type="button"
                           disabled={isBeforeStart}
                           onClick={() => {
                              onChange(cell.value);
                              onOpenChange(false);
                           }}
                           className={[
                              "flex h-9 items-center justify-center rounded-lg text-sm transition disabled:cursor-not-allowed disabled:opacity-30",
                              isSelected
                                 ? "bg-emerald-500 font-semibold text-slate-950"
                                 : isToday
                                   ? "border border-emerald-400/50 text-emerald-200 hover:bg-slate-800"
                                   : cell.isCurrentMonth
                                     ? "text-slate-200 hover:bg-slate-800"
                                     : "text-slate-600 hover:bg-slate-900",
                           ].join(" ")}>
                           {cell.date.getUTCDate()}
                        </button>
                     );
                  })}
               </div>

               <div className="mt-3 flex gap-2">
                  <button
                     type="button"
                     onClick={() => {
                        onChange("");
                        onOpenChange(false);
                     }}
                     className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                     No end date
                  </button>
                  <button
                     type="button"
                     onClick={() => {
                        onChange(today);
                        onOpenChange(false);
                     }}
                     className="flex-1 rounded-lg border border-emerald-500/40 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-500/10">
                     Today
                  </button>
               </div>
            </div>
         )}
      </div>
   );
}

export default function TasksPage() {
   const router = useRouter();
   const [view, setView] = useState<"daily" | "monthly">("daily");
   const [date, setDate] = useState(todayString());
   const [assignee, setAssignee] = useState("all");
   const [data, setData] = useState<TaskResponse | null>(null);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);
   const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);
   const [isEndCalendarOpen, setIsEndCalendarOpen] = useState(false);
   const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
   const [form, setForm] = useState<TaskFormState>(() => emptyForm(todayString(), ""));

   const loadTasks = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const params = new URLSearchParams({
            view,
            date,
            assignee,
         });
         const response = await fetch(`/api/tasks?${params.toString()}`, {
            headers: {
               Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
         });
         const payload = await response.json();

         if (!response.ok) {
            if (response.status === 401) {
               router.replace("/login");
               return;
            }

            throw new Error(payload.error || "Failed to load tasks.");
         }

         const nextData = payload as TaskResponse;
         setData(nextData);
         setForm((current) => {
            if (current.id || current.title || current.description) return current;
            const defaultAssignee =
               canManageTasks(nextData.viewer.role)
                  ? nextData.members.find((member) => isStaffRole(member.role))?.user_id ||
                    nextData.viewer.user_id
                  : nextData.viewer.user_id;

            return emptyForm(date, defaultAssignee);
         });
      } catch (requestError) {
         setError(
            requestError instanceof Error ? requestError.message : "Failed to load tasks.",
         );
      } finally {
         setLoading(false);
      }
   }, [assignee, date, router, view]);

   useEffect(() => {
      void loadTasks();
   }, [loadTasks]);

   const occurrencesByDate = useMemo(() => {
      const groups = new Map<string, TaskOccurrence[]>();
      for (const occurrence of data?.occurrences || []) {
         const existing = groups.get(occurrence.date) || [];
         existing.push(occurrence);
         groups.set(occurrence.date, existing);
      }

      return Array.from(groups.entries());
   }, [data?.occurrences]);

   const canManageTeam = canManageTasks(data?.viewer.role);

   const getDefaultAssignee = () =>
         canManageTasks(data?.viewer.role)
            ? data.members.find((member) => isStaffRole(member.role))?.user_id ||
              data.viewer.user_id
            : data?.viewer.user_id || "";

   const resetForm = () => {
      setForm(emptyForm(date, getDefaultAssignee()));
      setIsEndCalendarOpen(false);
   };

   const openNewTaskForm = () => {
      resetForm();
      setSuccess(null);
      setError(null);
      setIsTaskFormOpen(true);
   };

   const closeTaskForm = () => {
      resetForm();
      setIsTaskFormOpen(false);
   };

   const handleSubmitTask = async () => {
      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const endpoint = form.id ? `/api/tasks/${form.id}` : "/api/tasks";
         const response = await fetch(endpoint, {
            method: form.id ? "PATCH" : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               title: form.title,
               description: form.description,
               assignedTo: form.assignedTo,
               frequencyType: form.frequencyType,
               weekdays: form.weekdays,
               monthDays: parseMonthDays(form.monthDays),
               startDate: form.startDate,
               endDate: form.endDate,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save task.");
         }

         setSuccess(form.id ? "Task updated." : "Task created.");
         resetForm();
         setIsTaskFormOpen(false);
         await loadTasks();
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to save task.");
      } finally {
         setSaving(false);
      }
   };

   const handleEditTask = (task: TaskTemplate) => {
      setForm({
         id: task.id,
         title: task.title,
         description: task.description || "",
         assignedTo: task.assigned_to,
         frequencyType: task.frequency_type,
         weekdays: task.weekdays || [1],
         monthDays: (task.month_days || [1]).join(", "),
         startDate: task.start_date,
         endDate: task.end_date || "",
      });
      setIsTaskFormOpen(true);
      setSuccess(null);
      setError(null);
   };

   const handleArchiveTask = async (taskId: string) => {
      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(`/api/tasks/${taskId}`, {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${token}`,
            },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to archive task.");
         }

         setSuccess("Task archived.");
         await loadTasks();
      } catch (requestError) {
         setError(
            requestError instanceof Error ? requestError.message : "Failed to archive task.",
         );
      } finally {
         setSaving(false);
      }
   };

   const toggleCompletion = async (occurrence: TaskOccurrence) => {
      try {
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/tasks/completions", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               taskId: occurrence.task.id,
               occurrenceDate: occurrence.date,
               completed: !occurrence.isCompleted,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update completion.");
         }

         await loadTasks();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update completion.",
         );
      }
   };

   const addComment = async (occurrence: TaskOccurrence) => {
      const key = `${occurrence.task.id}:${occurrence.date}`;
      const comment = commentDrafts[key]?.trim() || "";
      if (!comment) return;

      try {
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/tasks/comments", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               taskId: occurrence.task.id,
               occurrenceDate: occurrence.date,
               comment,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to add comment.");
         }

         setCommentDrafts((current) => ({ ...current, [key]: "" }));
         await loadTasks();
      } catch (requestError) {
         setError(requestError instanceof Error ? requestError.message : "Failed to add comment.");
      }
   };

   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
               <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                  Team checklist
               </p>
               <h1 className="mt-2 text-3xl font-semibold">Tasks</h1>
               <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Create repeated work once, then check daily and monthly progress without spreadsheet formulas.
               </p>
            </div>

            <div className="flex flex-wrap items-stretch gap-3">
               <button
                  type="button"
                  onClick={isTaskFormOpen ? closeTaskForm : openNewTaskForm}
                  className={[
                     "flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition",
                     isTaskFormOpen
                        ? "border border-slate-700 text-slate-200 hover:bg-slate-800"
                        : "bg-emerald-500 text-slate-950 hover:bg-emerald-400",
                  ].join(" ")}>
                  {isTaskFormOpen ? <PiXLight size={18} /> : <PiPlusLight size={18} />}
                  {isTaskFormOpen ? "Hide form" : "New task"}
               </button>

               <div className="min-w-[240px] rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                     <span className="text-sm text-slate-400">
                        {view === "monthly" ? "Monthly" : "Daily"} progress
                     </span>
                     <span className="text-2xl font-semibold text-white">
                        {data?.progress.percentage ?? 0}%
                     </span>
                  </div>
                  <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-800">
                     <div
                        className="h-full rounded-full bg-emerald-400 transition-all"
                        style={{ width: `${data?.progress.percentage ?? 0}%` }}
                     />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                     {data?.progress.completed ?? 0} of {data?.progress.total ?? 0} done
                  </p>
               </div>
            </div>
         </div>

         <section
            className={
               isTaskFormOpen ? "grid gap-4 xl:grid-cols-[360px_1fr]" : "space-y-4"
            }>
            {isTaskFormOpen && (
            <div className="space-y-4">
               <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center gap-2">
                     <PiPlusLight className="text-emerald-300" size={20} />
                     <h2 className="font-semibold">
                        {form.id ? "Edit task" : "Create task"}
                     </h2>
                  </div>

                  <div className="mt-4 space-y-3">
                     <input
                        value={form.title}
                        onChange={(event) =>
                           setForm((current) => ({ ...current, title: event.target.value }))
                        }
                        placeholder="Task title"
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                     />
                     <textarea
                        value={form.description}
                        onChange={(event) =>
                           setForm((current) => ({
                              ...current,
                              description: event.target.value,
                           }))
                        }
                        rows={3}
                        placeholder="Details or instructions"
                        className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                     />

                     <label className="block text-xs uppercase tracking-[0.16em] text-slate-500">
                        Assignee
                     </label>
                     <select
                        value={form.assignedTo}
                        onChange={(event) =>
                           setForm((current) => ({
                              ...current,
                              assignedTo: event.target.value,
                           }))
                        }
                        disabled={!canManageTeam}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 disabled:opacity-70">
                        {(data?.members || []).map((member) => (
                           <option key={member.user_id} value={member.user_id}>
                              {getMemberName(data?.members || [], member.user_id)}
                              {" "}
                              ({roleLabel(member.role)})
                              {member.branch_name ? ` - ${member.branch_name}` : ""}
                           </option>
                        ))}
                     </select>

                     <label className="block text-xs uppercase tracking-[0.16em] text-slate-500">
                        Repeat
                     </label>
                     <select
                        value={form.frequencyType}
                        onChange={(event) =>
                           setForm((current) => ({
                              ...current,
                              frequencyType: event.target.value as TaskTemplate["frequency_type"],
                           }))
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="once">One time</option>
                     </select>

                     {form.frequencyType === "weekly" && (
                        <div className="grid grid-cols-4 gap-2">
                           {WEEKDAYS.map((day) => {
                              const selected = form.weekdays.includes(day.value);
                              return (
                                 <button
                                    key={day.value}
                                    type="button"
                                    onClick={() =>
                                       setForm((current) => ({
                                          ...current,
                                          weekdays: selected
                                             ? current.weekdays.filter(
                                                  (value) => value !== day.value,
                                               )
                                             : [...current.weekdays, day.value],
                                       }))
                                    }
                                    className={[
                                       "h-10 rounded-xl border text-sm transition",
                                       selected
                                          ? "border-emerald-400 bg-emerald-500 text-slate-950"
                                          : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800",
                                    ].join(" ")}>
                                    {day.label}
                                 </button>
                              );
                           })}
                        </div>
                     )}

                     {form.frequencyType === "monthly" && (
                        <input
                           value={form.monthDays}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 monthDays: event.target.value,
                              }))
                           }
                           placeholder="20 or 1, 15, 30"
                           className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                     )}

                     <div className="grid grid-cols-2 gap-3">
                        <div>
                           <label className="block text-xs uppercase tracking-[0.16em] text-slate-500">
                              Start
                           </label>
                           <input
                              type="date"
                              value={form.startDate}
                              onChange={(event) =>
                                 setForm((current) => ({
                                    ...current,
                                    startDate: event.target.value,
                                 }))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-emerald-500"
                           />
                        </div>
                        <div>
                           <label className="block text-xs uppercase tracking-[0.16em] text-slate-500">
                              End
                           </label>
                           <DatePickerPopover
                              value={form.endDate}
                              startDate={form.startDate}
                              isOpen={isEndCalendarOpen}
                              onOpenChange={setIsEndCalendarOpen}
                              onChange={(nextDate) =>
                                 setForm((current) => ({
                                    ...current,
                                    endDate: nextDate,
                                 }))
                              }
                           />
                        </div>
                     </div>

                     <div className="flex gap-2">
                        <button
                           type="button"
                           onClick={() => void handleSubmitTask()}
                           disabled={saving}
                           className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                           <PiCheckCircleLight size={18} />
                           {saving ? "Saving..." : form.id ? "Save changes" : "Create"}
                        </button>
                        {form.id && (
                           <button
                              type="button"
                              onClick={closeTaskForm}
                              className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition hover:bg-slate-800"
                              aria-label="Cancel editing">
                              <PiXLight size={18} />
                           </button>
                        )}
                     </div>
                  </div>
               </div>
            </div>
            )}

            <div className="space-y-4">
               <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                     <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1">
                        {(["daily", "monthly"] as const).map((mode) => (
                           <button
                              key={mode}
                              type="button"
                              onClick={() => setView(mode)}
                              className={[
                                 "rounded-lg px-4 py-2 text-sm font-medium transition",
                                 view === mode
                                    ? "bg-emerald-500 text-slate-950"
                                    : "text-slate-300 hover:bg-slate-800",
                              ].join(" ")}>
                              {mode === "daily" ? "Daily" : "Monthly"}
                           </button>
                        ))}
                     </div>

                     <input
                        type={view === "monthly" ? "month" : "date"}
                        value={view === "monthly" ? date.slice(0, 7) : date}
                        onChange={(event) => {
                           const nextValue =
                              view === "monthly"
                                 ? `${event.target.value}-01`
                                 : event.target.value;
                           setDate(nextValue);
                        }}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                     />

                     <select
                        value={assignee}
                        onChange={(event) => setAssignee(event.target.value)}
                        className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                        <option value="all">All visible users</option>
                        {(data?.members || []).map((member) => (
                           <option key={member.user_id} value={member.user_id}>
                              {getMemberName(data?.members || [], member.user_id)}
                           </option>
                        ))}
                     </select>
                  </div>

                  <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
                     <PiCalendarBlankLight className="text-emerald-300" size={18} />
                     <span>
                        {view === "monthly"
                           ? formatMonth(data?.range.startDate || date)
                           : formatDate(date)}
                     </span>
                  </div>
               </div>

               {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                     {error}
                  </div>
               )}

               {success && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                     {success}
                  </div>
               )}

               {loading ? (
                  <div className="space-y-3">
                     {Array.from({ length: 5 }).map((_, index) => (
                        <div
                           key={index}
                           className="h-28 animate-pulse rounded-xl border border-slate-800 bg-slate-900/70"
                        />
                     ))}
                  </div>
               ) : occurrencesByDate.length === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                     No tasks scheduled for this view.
                  </div>
               ) : (
                  <div className="space-y-4">
                     {occurrencesByDate.map(([groupDate, occurrences]) => {
                        const completed = occurrences.filter(
                           (occurrence) => occurrence.isCompleted,
                        ).length;
                        const percentage = Math.round((completed / occurrences.length) * 100);

                        return (
                           <section
                              key={groupDate}
                              className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                 <div>
                                    <h2 className="font-semibold">{formatDate(groupDate)}</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                       {completed} of {occurrences.length} complete
                                    </p>
                                 </div>
                                 <div className="flex min-w-[180px] items-center gap-3">
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
                                       <div
                                          className="h-full rounded-full bg-sky-400"
                                          style={{ width: `${percentage}%` }}
                                       />
                                    </div>
                                    <span className="w-10 text-right text-sm text-slate-300">
                                       {percentage}%
                                    </span>
                                 </div>
                              </div>

                              <div className="mt-4 space-y-3">
                                 {occurrences.map((occurrence) => {
                                    const key = `${occurrence.task.id}:${occurrence.date}`;
                                    const canEdit =
                                       canManageTasks(data?.viewer.role) ||
                                       occurrence.task.created_by === data?.viewer.user_id;

                                    return (
                                       <div
                                          key={key}
                                          className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                                          <div className="flex flex-wrap items-start justify-between gap-3">
                                             <label className="flex min-w-0 flex-1 items-start gap-3">
                                                <input
                                                   type="checkbox"
                                                   checked={occurrence.isCompleted}
                                                   onChange={() => void toggleCompletion(occurrence)}
                                                   className="mt-1 h-5 w-5 rounded border-slate-600 accent-emerald-400"
                                                />
                                                <span className="min-w-0">
                                                   <span
                                                      className={[
                                                         "block font-medium",
                                                         occurrence.isCompleted
                                                            ? "text-slate-400 line-through"
                                                            : "text-slate-100",
                                                      ].join(" ")}>
                                                      {occurrence.task.title}
                                                   </span>
                                                   {occurrence.task.description && (
                                                      <span className="mt-1 block text-sm text-slate-400">
                                                         {occurrence.task.description}
                                                      </span>
                                                   )}
                                                   <span className="mt-2 block text-xs text-slate-500">
                                                      {getMemberName(
                                                         data?.members || [],
                                                         occurrence.task.assigned_to,
                                                      )}{" "}
                                                      · {recurrenceLabel(occurrence.task)}
                                                      {getMemberBranchName(
                                                         data?.members || [],
                                                         occurrence.task.assigned_to,
                                                      )
                                                         ? ` · ${getMemberBranchName(
                                                              data?.members || [],
                                                              occurrence.task.assigned_to,
                                                           )}`
                                                         : ""}
                                                   </span>
                                                </span>
                                             </label>

                                             {canEdit && (
                                                <div className="flex gap-2">
                                                   <button
                                                      type="button"
                                                      onClick={() => handleEditTask(occurrence.task)}
                                                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-300 transition hover:bg-slate-800"
                                                      aria-label="Edit task">
                                                      <PiNotePencilLight size={18} />
                                                   </button>
                                                   <button
                                                      type="button"
                                                      onClick={() =>
                                                         void handleArchiveTask(occurrence.task.id)
                                                      }
                                                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/30 text-red-200 transition hover:bg-red-500/10"
                                                      aria-label="Archive task">
                                                      <PiTrashLight size={18} />
                                                   </button>
                                                </div>
                                             )}
                                          </div>

                                          {occurrence.comments.length > 0 && (
                                             <div className="mt-3 space-y-2">
                                                {occurrence.comments.map((comment) => (
                                                   <div
                                                      key={comment.id}
                                                      className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm">
                                                      <p className="text-slate-300">{comment.body}</p>
                                                      <p className="mt-1 text-xs text-slate-500">
                                                         {getMemberName(
                                                            data?.members || [],
                                                            comment.user_id,
                                                         )}
                                                      </p>
                                                   </div>
                                                ))}
                                             </div>
                                          )}

                                          <div className="mt-3 flex gap-2">
                                             <input
                                                value={commentDrafts[key] || ""}
                                                onChange={(event) =>
                                                   setCommentDrafts((current) => ({
                                                      ...current,
                                                      [key]: event.target.value,
                                                   }))
                                                }
                                                placeholder="Add a comment"
                                                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm outline-none focus:border-emerald-500"
                                             />
                                             <button
                                                type="button"
                                                onClick={() => void addComment(occurrence)}
                                                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
                                                Send
                                             </button>
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </section>
                        );
                     })}
                  </div>
               )}
            </div>
         </section>
      </div>
   );
}
