"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiBriefcaseLight,
   PiCalendarBlankLight,
   PiFloppyDiskLight,
   PiPlusLight,
} from "react-icons/pi";
import {
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
   status: ErpShiftStatus;
   statusLabel: string;
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
   status: ErpShiftStatus;
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
   status: "scheduled",
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
   const [shifts, setShifts] = useState<ShiftView[]>([]);
   const [staff, setStaff] = useState<StaffOption[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [weekStart, setWeekStart] = useState(weekBounds.weekStart);
   const [weekEnd, setWeekEnd] = useState(weekBounds.weekEnd);
   const [branchFilter, setBranchFilter] = useState("all");
   const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);

   const summary = useMemo(() => {
      const completed = shifts.filter((shift) => shift.status === "completed").length;
      const attendanceIssues = shifts.filter((shift) =>
         ["late", "absent"].includes(shift.status),
      ).length;

      return {
         total: shifts.length,
         completed,
         attendanceIssues,
      };
   }, [shifts]);

   const loadShifts = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/shifts?weekStart=${weekStart}&weekEnd=${weekEnd}&branchId=${branchFilter}`,
            {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            },
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load shifts.");
         }

         setShifts(payload.shifts || []);
         setStaff(payload.staff || []);
         setBranches(payload.branches || []);
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
      setError(null);
      setSuccess(null);
   };

   const editShift = (shift: ShiftView) => {
      setForm({
         id: shift.id,
         staffUserId: shift.staffUserId,
         branchId: shift.branchId,
         shiftDate: shift.shiftDate,
         startsAt: shift.startsAt,
         endsAt: shift.endsAt,
         status: shift.status,
         note: shift.note || "",
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

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-[390px_1fr]">
            <form
               onSubmit={submitShift}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  {form.id ? <PiFloppyDiskLight className="text-emerald-300" size={22} /> : <PiPlusLight className="text-emerald-300" size={22} />}
                  <h2 className="text-lg font-semibold text-white">
                     {form.id ? "Edit shift" : "New shift"}
                  </h2>
               </div>

               <div className="mt-4 space-y-4">
                  <label className="block">
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

                  <label className="block">
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

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                  </div>

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

               <div className="mt-5 flex gap-2">
                  <button
                     type="submit"
                     disabled={saving}
                     className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                     <PiFloppyDiskLight size={18} />
                     {saving ? "Saving..." : "Save"}
                  </button>
                  {form.id && (
                     <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Cancel
                     </button>
                  )}
               </div>
            </form>

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
               ) : shifts.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No shifts for this week yet.</p>
                  </div>
               ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 2xl:grid-cols-7">
                     {weekDays.map((day) => {
                        const dayShifts = shifts.filter((shift) => shift.shiftDate === day);

                        return (
                           <div
                              key={day}
                              className="min-h-[170px] rounded-lg border border-slate-800 bg-slate-950/30 p-3">
                              <p className="text-sm font-semibold text-white">{day}</p>
                              <div className="mt-3 space-y-2">
                                 {dayShifts.length === 0 ? (
                                    <p className="text-xs text-slate-600">No coverage</p>
                                 ) : (
                                    dayShifts.map((shift) => (
                                       <button
                                          key={shift.id}
                                          type="button"
                                          onClick={() => editShift(shift)}
                                          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-emerald-500/30">
                                          <div className="flex items-center justify-between gap-2">
                                             <p className="truncate text-sm font-medium text-white">
                                                {shift.staffName}
                                             </p>
                                             <span
                                                className={[
                                                   "shrink-0 rounded-lg border px-2 py-0.5 text-[10px]",
                                                   statusClass(shift.status),
                                                ].join(" ")}>
                                                {shift.statusLabel}
                                             </span>
                                          </div>
                                          <p className="mt-1 text-xs text-slate-500">
                                             {shift.startsAt} - {shift.endsAt}
                                          </p>
                                          <p className="mt-1 truncate text-xs text-slate-500">
                                             {shift.branchName}
                                          </p>
                                       </button>
                                    ))
                                 )}
                              </div>
                           </div>
                        );
                     })}
                  </div>
               )}
            </div>
         </section>
      </div>
   );
}
