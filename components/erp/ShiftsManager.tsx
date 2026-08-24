"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiBriefcaseLight,
   PiCalendarBlankLight,
   PiClockLight,
   PiFloppyDiskLight,
   PiPlusLight,
} from "react-icons/pi";
import {
   ERP_WEEKDAYS,
   ERP_SHIFT_STATUSES,
   ERP_SHIFT_STATUS_LABELS,
   getWeekBounds,
   type ErpShiftStatus,
   type ErpStaffRole,
} from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type ShiftView = {
   id: string;
   staffUserId: string;
   staffName: string;
   staffRole: ErpStaffRole | null;
   staffRoleLabel: string | null;
   branchId: string;
   branchName: string;
   shiftDate: string;
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   status: ErpShiftStatus;
   statusLabel: string;
   note: string | null;
   isGenerated?: boolean;
   sourceWorkingHourId?: string;
};

type WorkingHourView = {
   id: string;
   staffUserId: string;
   staffName: string;
   staffRole: ErpStaffRole | null;
   staffRoleLabel: string | null;
   branchId: string | null;
   branchName: string | null;
   weekday: number;
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   active: boolean;
   note: string | null;
};

type StaffOption = {
   userId: string;
   fullName: string;
   role: ErpStaffRole;
   roleLabel: string;
   primaryBranchId: string | null;
};

type BranchOption = {
   id: string;
   name: string;
};

type ShiftForm = {
   id: string;
   staffUserId: string;
   branchId: string;
   shiftDate: string;
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   status: ErpShiftStatus;
   note: string;
};

type WorkingHourForm = {
   id: string;
   staffUserId: string;
   branchId: string;
   weekday: number;
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   active: boolean;
   note: string;
};

const weekBounds = getWeekBounds();

const EMPTY_FORM: ShiftForm = {
   id: "",
   staffUserId: "",
   branchId: "",
   shiftDate: new Date().toISOString().slice(0, 10),
   startsAt: "09:00",
   endsAt: "18:00",
   breakMinutes: 60,
   status: "scheduled",
   note: "",
};

const EMPTY_WORKING_HOUR_FORM: WorkingHourForm = {
   id: "",
   staffUserId: "",
   branchId: "",
   weekday: 1,
   startsAt: "09:00",
   endsAt: "18:00",
   breakMinutes: 60,
   active: true,
   note: "",
};

function addDays(dateValue: string, days: number) {
   const date = new Date(`${dateValue}T00:00:00.000Z`);
   date.setUTCDate(date.getUTCDate() + days);
   return date.toISOString().slice(0, 10);
}

function getWeekDays(weekStart: string) {
   return Array.from({ length: 7 }).map((_, index) => addDays(weekStart, index));
}

function getErpWeekday(dateValue: string) {
   const day = new Date(`${dateValue}T00:00:00.000Z`).getUTCDay();
   return day === 0 ? 7 : day;
}

function statusClass(status: ErpShiftStatus) {
   if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
   if (status === "late") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
   if (status === "absent") return "border-red-500/30 bg-red-500/10 text-red-200";
   if (["day_off", "sick_leave", "approved_leave"].includes(status)) {
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
   }
   return "border-slate-700 bg-slate-800 text-slate-300";
}

export default function ShiftsManager() {
   const [activeTab, setActiveTab] = useState<"shifts" | "working-hours">("shifts");
   const [shifts, setShifts] = useState<ShiftView[]>([]);
   const [workingHours, setWorkingHours] = useState<WorkingHourView[]>([]);
   const [staff, setStaff] = useState<StaffOption[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [canManage, setCanManage] = useState(false);
   const [weekStart, setWeekStart] = useState(weekBounds.weekStart);
   const [weekEnd, setWeekEnd] = useState(weekBounds.weekEnd);
   const [branchFilter, setBranchFilter] = useState("all");
   const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
   const [workingHourForm, setWorkingHourForm] = useState<WorkingHourForm>(
      EMPTY_WORKING_HOUR_FORM,
   );
   const [shiftModalOpen, setShiftModalOpen] = useState(false);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

   const scheduledShifts = useMemo(() => {
      const savedByStaffDate = new Map(
         shifts.map((shift) => [`${shift.staffUserId}:${shift.shiftDate}`, shift]),
      );
      const staffById = new Map(staff.map((member) => [member.userId, member]));
      const branchById = new Map(branches.map((branch) => [branch.id, branch]));
      const generated: ShiftView[] = [];

      for (const day of weekDays) {
         const weekday = getErpWeekday(day);

         for (const workingHour of workingHours) {
            if (!workingHour.active || workingHour.weekday !== weekday) continue;

            const savedShift = savedByStaffDate.get(`${workingHour.staffUserId}:${day}`);
            if (savedShift) continue;

            const staffMember = staffById.get(workingHour.staffUserId);
            const branchId =
               workingHour.branchId || staffMember?.primaryBranchId || "";
            const branchName =
               workingHour.branchName ||
               (branchId ? branchById.get(branchId)?.name : null) ||
               "No branch";

            if (branchFilter !== "all" && branchId !== branchFilter) continue;

            generated.push({
               id: `template:${workingHour.id}:${day}`,
               staffUserId: workingHour.staffUserId,
               staffName: workingHour.staffName,
               staffRole: workingHour.staffRole,
               staffRoleLabel: workingHour.staffRoleLabel,
               branchId,
               branchName,
               shiftDate: day,
               startsAt: workingHour.startsAt,
               endsAt: workingHour.endsAt,
               breakMinutes: workingHour.breakMinutes,
               status: "scheduled",
               statusLabel: ERP_SHIFT_STATUS_LABELS.scheduled,
               note: workingHour.note,
               isGenerated: true,
               sourceWorkingHourId: workingHour.id,
            });
         }
      }

      return [...shifts, ...generated].sort((left, right) => {
         if (left.shiftDate !== right.shiftDate) {
            return left.shiftDate.localeCompare(right.shiftDate);
         }

         return left.startsAt.localeCompare(right.startsAt);
      });
   }, [branchFilter, branches, shifts, staff, weekDays, workingHours]);

   const summary = useMemo(() => {
      const completed = scheduledShifts.filter((shift) => shift.status === "completed").length;
      const attendanceIssues = scheduledShifts.filter((shift) =>
         ["late", "absent"].includes(shift.status),
      ).length;

      return {
         total: scheduledShifts.length,
         completed,
         attendanceIssues,
      };
   }, [scheduledShifts]);

   const staffColumns = useMemo(() => {
      return staff
         .filter((member) => {
            if (branchFilter === "all") return true;
            return (
               member.primaryBranchId === branchFilter ||
               scheduledShifts.some(
                  (shift) =>
                     shift.staffUserId === member.userId && shift.branchId === branchFilter,
               )
            );
         })
         .map((member) => ({
            ...member,
            shifts: weekDays.map((day) => ({
               date: day,
               weekdayLabel:
                  ERP_WEEKDAYS.find((weekday) => weekday.value === getErpWeekday(day))
                     ?.label || "Day",
               shifts: scheduledShifts.filter(
                  (shift) => shift.staffUserId === member.userId && shift.shiftDate === day,
               ),
            })),
         }));
   }, [branchFilter, scheduledShifts, staff, weekDays]);

   const loadShifts = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const [response, workingHoursResponse] = await Promise.all([
            fetch(
            `/api/erp/shifts?weekStart=${weekStart}&weekEnd=${weekEnd}&branchId=${branchFilter}`,
            {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            },
            ),
            fetch("/api/erp/working-hours", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            }),
         ]);
         const payload = await response.json();
         const workingHoursPayload = await workingHoursResponse.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load shifts.");
         }

         if (!workingHoursResponse.ok) {
            throw new Error(workingHoursPayload.error || "Failed to load working hours.");
         }

         setShifts(payload.shifts || []);
         setStaff(payload.staff || []);
         setBranches(payload.branches || []);
         setCanManage(Boolean(payload.canManage));
         setWorkingHours(workingHoursPayload.workingHours || []);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load shifts.",
         );
      } finally {
         setLoading(false);
      }
   }, [branchFilter, weekEnd, weekStart]);

   useEffect(() => {
      void loadShifts();
   }, [loadShifts]);

   const moveWeek = (days: number) => {
      const nextStart = addDays(weekStart, days);
      setWeekStart(nextStart);
      setWeekEnd(addDays(nextStart, 6));
   };

   const resetForm = () => {
      setForm(EMPTY_FORM);
      setShiftModalOpen(false);
      setError(null);
      setSuccess(null);
   };

   const editShift = (shift: ShiftView) => {
      setForm({
         id: shift.isGenerated ? "" : shift.id,
         staffUserId: shift.staffUserId,
         branchId: shift.branchId,
         shiftDate: shift.shiftDate,
         startsAt: shift.startsAt,
         endsAt: shift.endsAt,
         breakMinutes: shift.breakMinutes,
         status: shift.status,
         note: shift.note || "",
      });
      setShiftModalOpen(true);
      setError(null);
      setSuccess(null);
   };

   const completeShift = async (shift: ShiftView) => {
      if (!shift.branchId) {
         setError("Choose a branch before completing this shift.");
         return;
      }

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/shifts", {
            method: shift.isGenerated ? "POST" : "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               id: shift.isGenerated ? "" : shift.id,
               staffUserId: shift.staffUserId,
               branchId: shift.branchId,
               shiftDate: shift.shiftDate,
               startsAt: shift.startsAt,
               endsAt: shift.endsAt,
               breakMinutes: shift.breakMinutes,
               status: "completed",
               note: shift.note || "",
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to complete shift.");
         }

         setSuccess("Shift completed.");
         await loadShifts();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to complete shift.",
         );
      } finally {
         setSaving(false);
      }
   };

   const resetWorkingHourForm = () => {
      setWorkingHourForm(EMPTY_WORKING_HOUR_FORM);
      setError(null);
      setSuccess(null);
   };

   const editWorkingHour = (workingHour: WorkingHourView) => {
      setWorkingHourForm({
         id: workingHour.id,
         staffUserId: workingHour.staffUserId,
         branchId: workingHour.branchId || "",
         weekday: workingHour.weekday,
         startsAt: workingHour.startsAt,
         endsAt: workingHour.endsAt,
         breakMinutes: workingHour.breakMinutes,
         active: workingHour.active,
         note: workingHour.note || "",
      });
      setError(null);
      setSuccess(null);
   };

   const handleStaffChange = (staffUserId: string) => {
      const member = staff.find((entry) => entry.userId === staffUserId);
      setForm((current) => ({
         ...current,
         staffUserId,
         branchId: current.branchId || member?.primaryBranchId || "",
      }));
   };

   const handleWorkingHourStaffChange = (staffUserId: string) => {
      const member = staff.find((entry) => entry.userId === staffUserId);
      setWorkingHourForm((current) => ({
         ...current,
         staffUserId,
         branchId: current.branchId || member?.primaryBranchId || "",
      }));
   };

   const submitShift = async (event: React.FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/shifts", {
            method: form.id ? "PATCH" : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(form),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save shift.");
         }

         setSuccess(form.id ? "Shift updated." : "Shift created.");
         setForm(EMPTY_FORM);
         setShiftModalOpen(false);
         await loadShifts();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save shift.",
         );
      } finally {
         setSaving(false);
      }
   };

   const submitWorkingHour = async (event: React.FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/working-hours", {
            method: workingHourForm.id ? "PATCH" : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(workingHourForm),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save working hours.");
         }

         setWorkingHours(payload.workingHours || []);
         setSuccess(workingHourForm.id ? "Working hours updated." : "Working hours saved.");
         setWorkingHourForm(EMPTY_WORKING_HOUR_FORM);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save working hours.",
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Schedule
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Shifts
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Plan weekly staff coverage by branch and record attendance outcomes.
                  </p>
               </div>
               <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Shifts</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Completed</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{summary.completed}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Issues</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{summary.attendanceIssues}</p>
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
               onClick={() => setActiveTab("shifts")}
               className={[
                  "rounded-lg px-4 py-2 text-sm transition",
                  activeTab === "shifts"
                     ? "bg-emerald-500 text-slate-950"
                     : "text-slate-300 hover:bg-slate-900",
               ].join(" ")}>
               Daily shifts
            </button>
            <button
               type="button"
               onClick={() => setActiveTab("working-hours")}
               className={[
                  "rounded-lg px-4 py-2 text-sm transition",
                  activeTab === "working-hours"
                     ? "bg-emerald-500 text-slate-950"
                     : "text-slate-300 hover:bg-slate-900",
               ].join(" ")}>
               Working hours
            </button>
         </div>

         {activeTab === "working-hours" ? (
            <section
               className={[
                  "grid grid-cols-1 gap-4",
                  canManage ? "xl:grid-cols-[390px_1fr]" : "",
               ].join(" ")}>
               {canManage && (
               <form
                  onSubmit={submitWorkingHour}
                  className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center gap-2">
                     {workingHourForm.id ? <PiFloppyDiskLight className="text-emerald-300" size={22} /> : <PiPlusLight className="text-emerald-300" size={22} />}
                     <h2 className="text-lg font-semibold text-white">
                        {workingHourForm.id ? "Edit working hours" : "Set working hours"}
                     </h2>
                  </div>

                  <div className="mt-4 space-y-4">
                     <label className="block">
                        <span className="text-sm text-slate-300">Staff member</span>
                        <select
                           value={workingHourForm.staffUserId}
                           onChange={(event) => handleWorkingHourStaffChange(event.target.value)}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required>
                           <option value="">Choose staff</option>
                           {staff.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                 {member.fullName} ({member.roleLabel})
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Branch</span>
                        <select
                           value={workingHourForm.branchId}
                           onChange={(event) =>
                              setWorkingHourForm((current) => ({
                                 ...current,
                                 branchId: event.target.value,
                              }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           <option value="">No branch</option>
                           {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                 {branch.name}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Weekday</span>
                        <select
                           value={workingHourForm.weekday}
                           onChange={(event) =>
                              setWorkingHourForm((current) => ({
                                 ...current,
                                 weekday: Number(event.target.value),
                              }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           {ERP_WEEKDAYS.map((day) => (
                              <option key={day.value} value={day.value}>
                                 {day.label}
                              </option>
                           ))}
                        </select>
                     </label>

                     <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block">
                           <span className="text-sm text-slate-300">Start</span>
                           <input
                              type="time"
                              value={workingHourForm.startsAt}
                              onChange={(event) =>
                                 setWorkingHourForm((current) => ({
                                    ...current,
                                    startsAt: event.target.value,
                                 }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                              required
                           />
                        </label>
                        <label className="block">
                           <span className="text-sm text-slate-300">End</span>
                           <input
                              type="time"
                              value={workingHourForm.endsAt}
                              onChange={(event) =>
                                 setWorkingHourForm((current) => ({
                                    ...current,
                                    endsAt: event.target.value,
                                 }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                              required
                           />
                        </label>
                        <label className="block">
                           <span className="text-sm text-slate-300">Break</span>
                           <input
                              type="number"
                              min="0"
                              step="5"
                              value={workingHourForm.breakMinutes}
                              onChange={(event) =>
                                 setWorkingHourForm((current) => ({
                                    ...current,
                                    breakMinutes: Number(event.target.value),
                                 }))
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           />
                        </label>
                     </div>

                     <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                        <input
                           type="checkbox"
                           checked={workingHourForm.active}
                           onChange={(event) =>
                              setWorkingHourForm((current) => ({
                                 ...current,
                                 active: event.target.checked,
                              }))
                           }
                           className="h-4 w-4 accent-emerald-500"
                        />
                        Active working day
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Note</span>
                        <textarea
                           value={workingHourForm.note}
                           onChange={(event) =>
                              setWorkingHourForm((current) => ({
                                 ...current,
                                 note: event.target.value,
                              }))
                           }
                           rows={3}
                           className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           placeholder="Optional note"
                        />
                     </label>
                  </div>

                  <div className="mt-5 flex gap-2">
                     <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        <PiFloppyDiskLight size={18} />
                        {saving ? "Saving..." : "Save"}
                     </button>
                     {workingHourForm.id && (
                        <button
                           type="button"
                           onClick={resetWorkingHourForm}
                           className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                           Cancel
                        </button>
                     )}
                  </div>
               </form>
               )}

               <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex items-center gap-2">
                     <PiClockLight className="text-emerald-300" size={22} />
                     <h2 className="text-lg font-semibold text-white">Monday to Sunday templates</h2>
                  </div>

                  {loading ? (
                     <p className="mt-4 text-sm text-slate-500">Loading working hours...</p>
                  ) : workingHours.length === 0 ? (
                     <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                        <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                        <p className="mt-2 text-sm text-slate-400">No working hours set yet.</p>
                     </div>
                  ) : (
                     <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {workingHours.map((workingHour) => {
                           const weekdayLabel =
                              ERP_WEEKDAYS.find((day) => day.value === workingHour.weekday)?.label ||
                              "Weekday";

                           return (
                              <button
                                 key={workingHour.id}
                                 type="button"
                                 onClick={() => canManage && editWorkingHour(workingHour)}
                                 disabled={!canManage}
                                 className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-left transition hover:border-emerald-500/30 disabled:cursor-default disabled:hover:border-slate-800">
                                 <div className="flex items-start justify-between gap-3">
                                    <div>
                                       <p className="font-semibold text-white">{workingHour.staffName}</p>
                                       <p className="mt-1 text-sm text-slate-400">
                                          {weekdayLabel} - {workingHour.startsAt} to {workingHour.endsAt}
                                       </p>
                                    </div>
                                    <span
                                       className={[
                                          "rounded-lg border px-2 py-1 text-xs",
                                          workingHour.active
                                             ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                             : "border-slate-700 bg-slate-900 text-slate-500",
                                       ].join(" ")}>
                                       {workingHour.active ? "Active" : "Off"}
                                    </span>
                                 </div>
                                 <p className="mt-3 text-xs text-slate-500">
                                    {workingHour.branchName || "No branch"} - {workingHour.breakMinutes} min break
                                 </p>
                              </button>
                           );
                        })}
                     </div>
                  )}
               </div>
            </section>
         ) : (
         <section className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2">
                     <PiCalendarBlankLight className="text-emerald-300" size={22} />
                     <h2 className="text-lg font-semibold text-white">Weekly schedule</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                     <button
                        type="button"
                        onClick={() => moveWeek(-7)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Previous
                     </button>
                     <span className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                        {weekStart} to {weekEnd}
                     </span>
                     <button
                        type="button"
                        onClick={() => moveWeek(7)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Next
                     </button>
                     <select
                        value={branchFilter}
                        onChange={(event) => setBranchFilter(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                        <option value="all">All branches</option>
                        {branches.map((branch) => (
                           <option key={branch.id} value={branch.id}>
                              {branch.name}
                           </option>
                        ))}
                     </select>
                  </div>
               </div>

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading shifts...</p>
               ) : staffColumns.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">
                        No staff members match this branch.
                     </p>
                  </div>
               ) : (
                  <div className="mt-4 overflow-x-auto pb-2">
                     <div
                        className="grid gap-3"
                        style={{
                           minWidth: `${Math.max(1, staffColumns.length) * 260}px`,
                           gridTemplateColumns: `repeat(${staffColumns.length}, minmax(240px, 1fr))`,
                        }}>
                        {staffColumns.map((member) => (
                           <div
                              key={member.userId}
                              className="min-h-[360px] rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                                 <p className="break-words text-base font-semibold leading-5 text-white">
                                    {member.fullName}
                                 </p>
                                 <p className="mt-1 text-xs text-slate-500">{member.roleLabel}</p>
                              </div>

                              <div className="mt-3 space-y-2">
                                 {member.shifts.map((day) => (
                                    <div
                                       key={`${member.userId}:${day.date}`}
                                       className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                                       <div className="flex items-center justify-between gap-2">
                                          <div>
                                             <p className="text-sm font-semibold text-white">
                                                {day.weekdayLabel}
                                             </p>
                                             <p className="mt-0.5 text-xs text-slate-500">{day.date}</p>
                                          </div>
                                          {day.shifts.length === 0 && (
                                             <span className="text-xs text-slate-600">No shift</span>
                                          )}
                                       </div>

                                       {day.shifts.length > 0 && (
                                          <div className="mt-3 space-y-2">
                                             {day.shifts.map((shift) => (
                                                <div
                                                   key={shift.id}
                                                   className="rounded-lg border border-slate-800 bg-slate-900/70 p-3">
                                                   <div className="flex flex-wrap items-center gap-2">
                                                      <span
                                                         className={[
                                                            "inline-flex rounded-lg border px-2 py-0.5 text-[10px]",
                                                            statusClass(shift.status),
                                                         ].join(" ")}>
                                                         {shift.statusLabel}
                                                      </span>
                                                      {shift.isGenerated && (
                                                         <span className="rounded-lg border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400">
                                                            Planned
                                                         </span>
                                                      )}
                                                   </div>
                                                   <p className="mt-2 text-sm font-medium text-slate-200">
                                                      {shift.startsAt} - {shift.endsAt}
                                                   </p>
                                                   {shift.breakMinutes > 0 && (
                                                      <p className="text-xs text-slate-500">
                                                         {shift.breakMinutes} min break
                                                      </p>
                                                   )}
                                                   <p className="mt-1 break-words text-xs text-slate-500">
                                                      {shift.branchName}
                                                   </p>
                                                   {canManage && (
                                                      <div className="mt-3 grid grid-cols-2 gap-2">
                                                         <button
                                                            type="button"
                                                            onClick={() => void completeShift(shift)}
                                                            disabled={saving || shift.status === "completed"}
                                                            className="rounded-lg bg-emerald-500 px-2 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                                                            Complete
                                                         </button>
                                                         <button
                                                            type="button"
                                                            onClick={() => editShift(shift)}
                                                            disabled={saving}
                                                            className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-60">
                                                            Change
                                                         </button>
                                                      </div>
                                                   )}
                                                </div>
                                             ))}
                                          </div>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
               )}
            </div>
         </section>
         )}

         {shiftModalOpen && canManage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
               <form
                  onSubmit={submitShift}
                  className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-800 bg-slate-950 p-5 shadow-2xl">
                  <div className="flex items-start justify-between gap-4">
                     <div className="flex items-center gap-2">
                        <PiFloppyDiskLight className="text-emerald-300" size={22} />
                        <h2 className="text-lg font-semibold text-white">Change shift hours</h2>
                     </div>
                     <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Close
                     </button>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                     <label className="block md:col-span-2">
                        <span className="text-sm text-slate-300">Staff member</span>
                        <select
                           value={form.staffUserId}
                           onChange={(event) => handleStaffChange(event.target.value)}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required>
                           <option value="">Choose staff</option>
                           {staff.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                 {member.fullName} ({member.roleLabel})
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block md:col-span-2">
                        <span className="text-sm text-slate-300">Branch</span>
                        <select
                           value={form.branchId}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, branchId: event.target.value }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required>
                           <option value="">Choose branch</option>
                           {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                 {branch.name}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Date</span>
                        <input
                           type="date"
                           value={form.shiftDate}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, shiftDate: event.target.value }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required
                        />
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Status</span>
                        <select
                           value={form.status}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 status: event.target.value as ErpShiftStatus,
                              }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           {ERP_SHIFT_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                 {ERP_SHIFT_STATUS_LABELS[status]}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Start</span>
                        <input
                           type="time"
                           value={form.startsAt}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, startsAt: event.target.value }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required
                        />
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">End</span>
                        <input
                           type="time"
                           value={form.endsAt}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, endsAt: event.target.value }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required
                        />
                     </label>

                     <label className="block md:col-span-2">
                        <span className="text-sm text-slate-300">Break minutes</span>
                        <input
                           type="number"
                           min="0"
                           step="5"
                           value={form.breakMinutes}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 breakMinutes: Number(event.target.value),
                              }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        />
                     </label>

                     <label className="block md:col-span-2">
                        <span className="text-sm text-slate-300">Note</span>
                        <textarea
                           value={form.note}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, note: event.target.value }))
                           }
                           rows={3}
                           className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           placeholder="Optional note"
                        />
                     </label>
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                     <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        <PiFloppyDiskLight size={18} />
                        {saving ? "Saving..." : "Save shift"}
                     </button>
                     <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Cancel
                     </button>
                  </div>
               </form>
            </div>
         )}
      </div>
   );
}
