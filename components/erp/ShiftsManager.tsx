"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiBriefcaseLight,
   PiCalendarBlankLight,
   PiCaretDownLight,
   PiCaretUpLight,
   PiClockLight,
   PiFloppyDiskLight,
   PiPlusLight,
} from "react-icons/pi";
import {
   ERP_WEEKDAYS,
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
   salaryTier: string;
   staffActive: boolean;
   uniformOk: boolean;
   lateMinutes: number;
   lateCountsPenalty: boolean;
   workQuality: "good" | "normal" | "bad";
   absenceReason: "no_reason" | "sick_leave" | "asked" | null;
   actualWorkMinutes: number | null;
   scheduledWorkMinutes: number;
   finalWorkMinutes: number;
   penaltyCount: number;
   penaltyAmount: number;
   hourlyRate: number | null;
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
   salaryTier: string;
   primaryBranchId: string | null;
};

type MonthlySummary = {
   staffUserId: string;
   staffName: string;
   staffRoleLabel: string | null;
   salaryTier: string;
   workedHours: number;
   penalties: number;
   penaltyAmount: number;
   grossSalary: number;
   salary: number;
   goodQuality: number;
   normalQuality: number;
   badQuality: number;
};

type BranchOption = {
   id: string;
   name: string;
};

type WorkingHourGroup = {
   staffUserId: string;
   staffName: string;
   staffRoleLabel: string | null;
   primaryBranchId: string | null;
   workingHours: WorkingHourView[];
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
   uniformOk: boolean;
   lateMinutes: number;
   lateCountsPenalty: boolean;
   workQuality: "good" | "normal" | "bad";
   absenceReason: "no_reason" | "sick_leave" | "asked" | null;
   actualWorkMinutes: number | null;
   note: string;
};

type WorkingHourForm = {
   id: string;
   staffUserId: string;
   branchId: string;
   weekdays: number[];
   startsAt: string;
   endsAt: string;
   breakMinutes: number;
   active: boolean;
   note: string;
};

function getLocalDateString(date = new Date()) {
   const year = date.getFullYear();
   const month = String(date.getMonth() + 1).padStart(2, "0");
   const day = String(date.getDate()).padStart(2, "0");
   return `${year}-${month}-${day}`;
}

function getWeekBoundsForLocalDate(dateValue = getLocalDateString()) {
   return getWeekBounds(new Date(`${dateValue}T00:00:00.000Z`));
}

function addMonths(monthValue: string, months: number) {
   const date = new Date(`${monthValue}-01T00:00:00.000Z`);
   date.setUTCMonth(date.getUTCMonth() + months);
   return date.toISOString().slice(0, 7);
}

const weekBounds = getWeekBoundsForLocalDate();
const currentPayrollMonth = getLocalDateString().slice(0, 7);

const EMPTY_FORM: ShiftForm = {
   id: "",
   staffUserId: "",
   branchId: "",
   shiftDate: getLocalDateString(),
   startsAt: "09:00",
   endsAt: "18:00",
   breakMinutes: 60,
   status: "scheduled",
   uniformOk: true,
   lateMinutes: 0,
   lateCountsPenalty: false,
   workQuality: "normal",
   absenceReason: null,
   actualWorkMinutes: null,
   note: "",
};

const EMPTY_WORKING_HOUR_FORM: WorkingHourForm = {
   id: "",
   staffUserId: "",
   branchId: "",
   weekdays: [1],
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

function attendanceLabel(absenceReason: ShiftView["absenceReason"]) {
   if (absenceReason === "asked") return "Asked";
   if (absenceReason === "no_reason") return "No reason";
   if (absenceReason === "sick_leave") return "Sick leave";
   return "Came";
}

function attendanceClass(absenceReason: ShiftView["absenceReason"]) {
   if (absenceReason === "no_reason") {
      return "border-red-500/30 bg-red-500/10 text-red-200";
   }

   if (absenceReason === "asked" || absenceReason === "sick_leave") {
      return "border-sky-500/30 bg-sky-500/10 text-sky-200";
   }

   return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
}

export default function ShiftsManager() {
   const [activeTab, setActiveTab] = useState<"daily-shifts" | "working-hours">("daily-shifts");
   const [shifts, setShifts] = useState<ShiftView[]>([]);
   const [workingHours, setWorkingHours] = useState<WorkingHourView[]>([]);
   const [staff, setStaff] = useState<StaffOption[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [monthlySummaries, setMonthlySummaries] = useState<MonthlySummary[]>([]);
   const [shiftDrafts, setShiftDrafts] = useState<Record<string, Partial<ShiftView>>>({});
   const [canManage, setCanManage] = useState(false);
   const [weekStart, setWeekStart] = useState(weekBounds.weekStart);
   const [weekEnd, setWeekEnd] = useState(weekBounds.weekEnd);
   const [selectedDate, setSelectedDate] = useState(getLocalDateString());
   const [payrollMonth, setPayrollMonth] = useState(currentPayrollMonth);
   const [branchFilter, setBranchFilter] = useState("all");
   const [form, setForm] = useState<ShiftForm>(EMPTY_FORM);
   const [workingHourForm, setWorkingHourForm] = useState<WorkingHourForm>(
      EMPTY_WORKING_HOUR_FORM,
   );
   const [shiftModalOpen, setShiftModalOpen] = useState(false);
   const [expandedTemplateStaffIds, setExpandedTemplateStaffIds] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
   const today = useMemo(() => getLocalDateString(), []);

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
               salaryTier: staffMember?.salaryTier || "default",
               staffActive: true,
               uniformOk: true,
               lateMinutes: 0,
               lateCountsPenalty: false,
               workQuality: "normal",
               absenceReason: null,
               actualWorkMinutes: null,
               scheduledWorkMinutes: Math.max(
                  0,
                  (Number(workingHour.endsAt.slice(0, 2)) * 60 +
                     Number(workingHour.endsAt.slice(3, 5))) -
                     (Number(workingHour.startsAt.slice(0, 2)) * 60 +
                        Number(workingHour.startsAt.slice(3, 5))) -
                     workingHour.breakMinutes,
               ),
               finalWorkMinutes: Math.max(
                  0,
                  (Number(workingHour.endsAt.slice(0, 2)) * 60 +
                     Number(workingHour.endsAt.slice(3, 5))) -
                     (Number(workingHour.startsAt.slice(0, 2)) * 60 +
                        Number(workingHour.startsAt.slice(3, 5))) -
                     workingHour.breakMinutes,
               ),
               penaltyCount: 0,
               penaltyAmount: 0,
               hourlyRate: null,
               note: workingHour.note,
               isGenerated: true,
               sourceWorkingHourId: workingHour.id,
            });
         }
      }

      return [...shifts, ...generated].map((shift) => {
         const draft = shiftDrafts[shift.id];
         return draft ? { ...shift, ...draft } : shift;
      }).sort((left, right) => {
         if (left.shiftDate !== right.shiftDate) {
            return left.shiftDate.localeCompare(right.shiftDate);
         }

         return left.startsAt.localeCompare(right.startsAt);
      });
   }, [branchFilter, branches, shiftDrafts, shifts, staff, weekDays, workingHours]);

   const summary = useMemo(() => {
      const selectedDayShifts = scheduledShifts.filter(
         (shift) => shift.shiftDate === selectedDate,
      );
      const came = selectedDayShifts.filter((shift) => !shift.absenceReason).length;
      const absent = selectedDayShifts.length - came;

      return {
         total: selectedDayShifts.length,
         came,
         absent,
      };
   }, [scheduledShifts, selectedDate]);

   const monthlyDashboard = useMemo(
      () =>
         monthlySummaries.reduce(
            (total, entry) => ({
               workedHours: total.workedHours + entry.workedHours,
               penalties: total.penalties + entry.penalties,
               penaltyAmount: total.penaltyAmount + entry.penaltyAmount,
               salary: total.salary + entry.salary,
               goodQuality: total.goodQuality + entry.goodQuality,
               normalQuality: total.normalQuality + entry.normalQuality,
               badQuality: total.badQuality + entry.badQuality,
            }),
            {
               workedHours: 0,
               penalties: 0,
               penaltyAmount: 0,
               salary: 0,
               goodQuality: 0,
               normalQuality: 0,
               badQuality: 0,
            },
         ),
      [monthlySummaries],
   );

   const dailyShifts = useMemo(
      () => scheduledShifts.filter((shift) => shift.shiftDate === selectedDate),
      [scheduledShifts, selectedDate],
   );

   const ratingRows = useMemo<MonthlySummary[]>(() => {
      const summariesByStaff = new Map(
         monthlySummaries.map((entry) => [entry.staffUserId, entry]),
      );

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
         .map((member) => {
            const summary = summariesByStaff.get(member.userId);

            return (
               summary || {
                  staffUserId: member.userId,
                  staffName: member.fullName,
                  staffRoleLabel: member.roleLabel,
                  salaryTier: member.salaryTier,
                  workedHours: 0,
                  penalties: 0,
                  penaltyAmount: 0,
                  grossSalary: 0,
                  salary: 0,
                  goodQuality: 0,
                  normalQuality: 0,
                  badQuality: 0,
               }
            );
         });
   }, [branchFilter, monthlySummaries, scheduledShifts, staff]);

   const workingHourGroups = useMemo<WorkingHourGroup[]>(() => {
      const groups = new Map<string, WorkingHourGroup>();

      for (const member of staff) {
         groups.set(member.userId, {
            staffUserId: member.userId,
            staffName: member.fullName,
            staffRoleLabel: member.roleLabel,
            primaryBranchId: member.primaryBranchId,
            workingHours: [],
         });
      }

      for (const workingHour of workingHours) {
         const existing = groups.get(workingHour.staffUserId);
         const group =
            existing ||
            {
               staffUserId: workingHour.staffUserId,
               staffName: workingHour.staffName,
               staffRoleLabel: workingHour.staffRoleLabel,
               primaryBranchId: null,
               workingHours: [],
            };

         group.workingHours.push(workingHour);
         groups.set(workingHour.staffUserId, group);
      }

      return Array.from(groups.values())
         .filter((group) => group.workingHours.length > 0)
         .map((group) => ({
            ...group,
            workingHours: [...group.workingHours].sort(
               (left, right) => left.weekday - right.weekday,
            ),
         }))
         .sort((left, right) => left.staffName.localeCompare(right.staffName));
   }, [staff, workingHours]);

   const loadShifts = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const [response, workingHoursResponse] = await Promise.all([
            fetch(
            `/api/erp/shifts?weekStart=${weekStart}&weekEnd=${weekEnd}&payrollMonth=${payrollMonth}&branchId=${branchFilter}`,
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
         setMonthlySummaries(payload.monthlySummaries || []);
         setCanManage(Boolean(payload.canManage));
         setWorkingHours(workingHoursPayload.workingHours || []);
         setShiftDrafts({});
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load shifts.",
         );
      } finally {
         setLoading(false);
      }
   }, [branchFilter, payrollMonth, weekEnd, weekStart]);

   useEffect(() => {
      void loadShifts();
   }, [loadShifts]);

   const changeSelectedDate = (dateValue: string) => {
      if (!dateValue) return;
      const nextWeek = getWeekBoundsForLocalDate(dateValue);
      setSelectedDate(dateValue);
      setWeekStart(nextWeek.weekStart);
      setWeekEnd(nextWeek.weekEnd);
      setPayrollMonth(dateValue.slice(0, 7));
   };

   const moveSelectedDate = (days: number) => {
      changeSelectedDate(addDays(selectedDate, days));
   };

   const movePayrollMonth = (months: number) => {
      setPayrollMonth((current) => addMonths(current, months));
   };

   const showDailyShifts = () => {
      const currentWeek = getWeekBoundsForLocalDate(today);
      setSelectedDate(today);
      setWeekStart(currentWeek.weekStart);
      setWeekEnd(currentWeek.weekEnd);
      setPayrollMonth(today.slice(0, 7));
      setActiveTab("daily-shifts");
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
         uniformOk: shift.uniformOk,
         lateMinutes: shift.lateMinutes,
         lateCountsPenalty: shift.lateCountsPenalty,
         workQuality: shift.workQuality,
         absenceReason: shift.absenceReason,
         actualWorkMinutes: null,
         note: shift.note || "",
      });
      setShiftModalOpen(true);
      setError(null);
      setSuccess(null);
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
         weekdays: [workingHour.weekday],
         startsAt: workingHour.startsAt,
         endsAt: workingHour.endsAt,
         breakMinutes: workingHour.breakMinutes,
         active: workingHour.active,
         note: workingHour.note || "",
      });
      setError(null);
      setSuccess(null);
   };

   const handleWorkingHourStaffChange = (staffUserId: string) => {
      const member = staff.find((entry) => entry.userId === staffUserId);
      setWorkingHourForm((current) => ({
         ...current,
         staffUserId,
         branchId: current.branchId || member?.primaryBranchId || "",
      }));
   };

   const toggleWorkingHourWeekday = (weekday: number) => {
      setWorkingHourForm((current) => {
         if (current.id) {
            return {
               ...current,
               weekdays: [weekday],
            };
         }

         const hasWeekday = current.weekdays.includes(weekday);
         const weekdays = hasWeekday
            ? current.weekdays.filter((value) => value !== weekday)
            : [...current.weekdays, weekday].sort((left, right) => left - right);

         return {
            ...current,
            weekdays,
         };
      });
   };

   const toggleTemplateStaff = (staffUserId: string) => {
      setExpandedTemplateStaffIds((current) =>
         current.includes(staffUserId)
            ? current.filter((value) => value !== staffUserId)
            : [...current, staffUserId],
      );
   };

   const updateShiftDraft = (shiftId: string, updates: Partial<ShiftView>) => {
      const currentShift = scheduledShifts.find((shift) => shift.id === shiftId);
      if (!currentShift) return;

      const applyUpdate = (shift: ShiftView): ShiftView => {
         const nextShift = { ...shift, ...updates };
         if (nextShift.absenceReason) {
            nextShift.uniformOk = true;
            nextShift.lateMinutes = 0;
            nextShift.lateCountsPenalty = false;
            nextShift.workQuality = "normal";
         }
         const lateDeductedMinutes = Math.floor(nextShift.lateMinutes / 60) * 60;
         const finalWorkMinutes = nextShift.absenceReason
            ? 0
            : Math.max(0, nextShift.scheduledWorkMinutes - lateDeductedMinutes);
         const penaltyCount = nextShift.absenceReason
            ? nextShift.absenceReason === "no_reason"
               ? 1
               : 0
            : [
                 nextShift.uniformOk !== true,
                 nextShift.lateCountsPenalty === true,
                 nextShift.workQuality === "bad",
              ].filter(Boolean).length;
         const status = nextShift.absenceReason ? "absent" : "scheduled";

         return {
            ...nextShift,
            status,
            statusLabel: ERP_SHIFT_STATUS_LABELS[status],
            actualWorkMinutes: null,
            finalWorkMinutes,
            penaltyCount,
         };
      };

      const nextShift = applyUpdate(currentShift);
      setShiftDrafts((current) => ({ ...current, [shiftId]: nextShift }));
   };

   const saveDailyAssessments = async () => {
      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/shifts", {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               action: "bulkAssessments",
               shifts: dailyShifts.map((shift) => ({
                  ...shift,
                  uniformOk: shift.absenceReason ? true : shift.uniformOk,
                  lateMinutes: shift.absenceReason ? 0 : shift.lateMinutes,
                  lateCountsPenalty: shift.absenceReason ? false : shift.lateCountsPenalty,
                  workQuality: shift.absenceReason ? "normal" : shift.workQuality,
                  actualWorkMinutes: null,
                  status: shift.absenceReason ? "absent" : "scheduled",
               })),
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save daily checklist.");
         }

         setSuccess("Daily checklist saved.");
         await loadShifts();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save daily checklist.",
         );
      } finally {
         setSaving(false);
      }
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
            body: JSON.stringify({
               ...form,
               actualWorkMinutes: null,
               status: form.absenceReason ? "absent" : "scheduled",
            }),
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

         if (workingHourForm.weekdays.length === 0) {
            throw new Error("Choose at least one weekday.");
         }

         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/working-hours", {
            method: workingHourForm.id ? "PATCH" : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               ...workingHourForm,
               weekday: workingHourForm.weekdays[0],
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save working hours.");
         }

         setWorkingHours(payload.workingHours || []);
         setSuccess(
            workingHourForm.id
               ? "Working hours updated."
               : `${workingHourForm.weekdays.length} working day${
                    workingHourForm.weekdays.length === 1 ? "" : "s"
                 } saved.`,
         );
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

   const renderDailyAssessmentCard = (shift: ShiftView) => {
      const summary = monthlySummaries.find((entry) => entry.staffUserId === shift.staffUserId);
      const isAbsentState = Boolean(shift.absenceReason);
      const penaltyTone =
         shift.penaltyCount >= 3
            ? "border-red-500/50 bg-red-500/10"
            : shift.penaltyCount === 2
              ? "border-orange-500/40 bg-orange-500/10"
              : shift.penaltyCount === 1
                ? "border-amber-500/35 bg-amber-500/10"
                : "border-slate-800 bg-slate-950/30";

      return (
         <div key={shift.id} className={`rounded-lg border p-3 ${penaltyTone}`}>
            <div className="flex items-start justify-between gap-3">
               <div className="min-w-0">
                  <p className="break-words text-base font-semibold leading-5 text-white">
                     {shift.staffName}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                     {[shift.staffRoleLabel, shift.branchName].filter(Boolean).join(" - ")}
                  </p>
               </div>
               <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                     className={[
                        "rounded-lg border px-2 py-1 text-xs",
                        attendanceClass(shift.absenceReason),
                     ].join(" ")}>
                     {attendanceLabel(shift.absenceReason)}
                  </span>
                  <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                     {summary ? `${summary.salary.toLocaleString()} sum` : "0 sum"}
                  </span>
               </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
               <div>
                  <p className="text-sm font-medium text-slate-200">
                     {shift.startsAt} - {shift.endsAt}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                     {shift.breakMinutes} min break
                  </p>
               </div>
               {canManage && (
                  <div className="flex items-center gap-2">
                     <button
                        type="button"
                        onClick={() => editShift(shift)}
                        disabled={saving}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 disabled:opacity-60">
                        Change hours
                     </button>
                  </div>
               )}
            </div>

            {!isAbsentState && (
               <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                     <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200">
                        <input
                           type="checkbox"
                           checked={shift.uniformOk}
                           onChange={(event) =>
                              updateShiftDraft(shift.id, { uniformOk: event.target.checked })
                           }
                           className="h-4 w-4 accent-emerald-500"
                        />
                        Uniform
                     </label>

                     <label className="block">
                        <span className="sr-only">Quality</span>
                        <select
                           value={shift.workQuality}
                           onChange={(event) =>
                              updateShiftDraft(shift.id, {
                                 workQuality: event.target.value as ShiftView["workQuality"],
                              })
                           }
                           className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           <option value="good">Good</option>
                           <option value="normal">Normal</option>
                           <option value="bad">Bad</option>
                        </select>
                     </label>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                     <label className="block">
                        <span className="text-xs text-slate-400">Late minutes</span>
                        <input
                           type="number"
                           min="0"
                           step="1"
                           value={shift.lateMinutes}
                           onChange={(event) =>
                              updateShiftDraft(shift.id, { lateMinutes: Number(event.target.value) })
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        />
                     </label>
                     <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 sm:mt-5">
                        <input
                           type="checkbox"
                           checked={shift.lateCountsPenalty}
                           onChange={(event) =>
                              updateShiftDraft(shift.id, { lateCountsPenalty: event.target.checked })
                           }
                           className="h-4 w-4 accent-emerald-500"
                        />
                        Late penalty
                     </label>
                  </div>
               </>
            )}

            <div className="mt-3">
               <label className="block">
                  <span className="text-xs text-slate-400">State</span>
                  <select
                     value={shift.absenceReason || ""}
                     onChange={(event) =>
                        updateShiftDraft(shift.id, {
                           absenceReason:
                              (event.target.value as ShiftView["absenceReason"]) || null,
                        })
                     }
                     className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                     <option value="">Came</option>
                     <option value="asked">Asked</option>
                     <option value="no_reason">No reason</option>
                     <option value="sick_leave">Sick leave</option>
                  </select>
               </label>
            </div>

            <textarea
               value={shift.note || ""}
               onChange={(event) => updateShiftDraft(shift.id, { note: event.target.value })}
               rows={2}
               className="mt-3 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
               placeholder="Quick comment"
            />
         </div>
      );
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Schedule
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Shifts
                  </h1>
               </div>
               <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                     <button
                        type="button"
                        onClick={() => movePayrollMonth(-1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Previous month
                     </button>
                     <input
                        type="month"
                        value={payrollMonth}
                        onChange={(event) => setPayrollMonth(event.target.value || currentPayrollMonth)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     />
                     <button
                        type="button"
                        onClick={() => movePayrollMonth(1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Next month
                     </button>
                  </div>
               <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Worked hours</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {Math.round(monthlyDashboard.workedHours * 100) / 100}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Penalties</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{monthlyDashboard.penalties}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Penalty sum</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {monthlyDashboard.penaltyAmount.toLocaleString()}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Salary</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {monthlyDashboard.salary.toLocaleString()}
                     </p>
                  </div>
               </div>
                  <div className="grid grid-cols-3 gap-3">
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Day shifts</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Came</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.came}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Absent</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.absent}</p>
                     </div>
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
               onClick={showDailyShifts}
               className={[
                  "rounded-lg px-4 py-2 text-sm transition",
                  activeTab === "daily-shifts"
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

                     <fieldset className="block">
                        <legend className="text-sm text-slate-300">
                           {workingHourForm.id ? "Weekday" : "Weekdays"}
                        </legend>
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                           {ERP_WEEKDAYS.map((day) => (
                              <label
                                 key={day.value}
                                 className={[
                                    "flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition",
                                    workingHourForm.weekdays.includes(day.value)
                                       ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-100"
                                       : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500",
                                 ].join(" ")}>
                                 <input
                                    type="checkbox"
                                    checked={workingHourForm.weekdays.includes(day.value)}
                                    onChange={() => toggleWorkingHourWeekday(day.value)}
                                    className="h-4 w-4 accent-emerald-500"
                                 />
                                 {day.label}
                              </label>
                           ))}
                        </div>
                     </fieldset>

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
                  ) : workingHourGroups.length === 0 ? (
                     <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                        <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                        <p className="mt-2 text-sm text-slate-400">No working hours set yet.</p>
                     </div>
                  ) : (
                     <div className="mt-4 space-y-3">
                        {workingHourGroups.map((group) => {
                           const expanded = expandedTemplateStaffIds.includes(group.staffUserId);
                           const activeDays = group.workingHours.filter(
                              (workingHour) => workingHour.active,
                           ).length;
                           return (
                              <div
                                 key={group.staffUserId}
                                 className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/40">
                                 <button
                                    type="button"
                                    onClick={() => toggleTemplateStaff(group.staffUserId)}
                                    className="flex w-full flex-col gap-3 px-4 py-4 text-left transition hover:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                       <p className="truncate font-semibold text-white">{group.staffName}</p>
                                       <p className="mt-1 text-sm text-slate-400">
                                          {group.staffRoleLabel || "Staff member"} - {activeDays} active of{" "}
                                          {group.workingHours.length} set
                                       </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                       <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-300">
                                          {group.workingHours.length} day{group.workingHours.length === 1 ? "" : "s"}
                                       </span>
                                       {expanded ? (
                                          <PiCaretUpLight className="text-slate-400" size={18} />
                                       ) : (
                                          <PiCaretDownLight className="text-slate-400" size={18} />
                                       )}
                                    </div>
                                 </button>

                                 {expanded && (
                                    <div className="border-t border-slate-800 p-3">
                                       <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                          {group.workingHours.map((workingHour) => {
                                             const weekdayLabel =
                                                ERP_WEEKDAYS.find(
                                                   (day) => day.value === workingHour.weekday,
                                                )?.label || "Weekday";

                                             return (
                                                <button
                                                   key={workingHour.id}
                                                   type="button"
                                                   onClick={() => canManage && editWorkingHour(workingHour)}
                                                   disabled={!canManage}
                                                   className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left transition hover:border-emerald-500/30 disabled:cursor-default disabled:hover:border-slate-800">
                                                   <div className="flex items-start justify-between gap-3">
                                                      <div>
                                                         <p className="font-medium text-white">
                                                            {weekdayLabel}
                                                         </p>
                                                         <p className="mt-1 text-sm text-slate-400">
                                                            {workingHour.startsAt} to {workingHour.endsAt}
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
                                                      {workingHour.branchName || "No branch"} -{" "}
                                                      {workingHour.breakMinutes} min break
                                                   </p>
                                                </button>
                                             );
                                          })}
                                       </div>
                                    </div>
                                 )}
                              </div>
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
                     <div>
                        <h2 className="text-lg font-semibold text-white">Daily shifts</h2>
                        <p className="mt-1 text-sm text-slate-500">{selectedDate}</p>
                     </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                     <button
                        type="button"
                        onClick={() => moveSelectedDate(-1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Previous day
                     </button>
                     <input
                        type="date"
                        value={selectedDate}
                        onChange={(event) => changeSelectedDate(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     />
                     <button
                        type="button"
                        onClick={() => moveSelectedDate(1)}
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                        Next day
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

               {canManage && dailyShifts.length > 0 && (
                  <div className="mt-4 flex justify-end">
                     <button
                        type="button"
                        onClick={() => void saveDailyAssessments()}
                        disabled={saving}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        <PiFloppyDiskLight size={18} />
                        {saving ? "Saving..." : "Save daily checklist"}
                     </button>
                  </div>
               )}

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading daily shifts...</p>
               ) : dailyShifts.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No shifts scheduled for this day.</p>
                  </div>
               ) : (
                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                     {dailyShifts.map(renderDailyAssessmentCard)}
                  </div>
               )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                     <PiBriefcaseLight className="text-emerald-300" size={22} />
                     <h2 className="text-lg font-semibold text-white">Rating list</h2>
                  </div>
                  <span className="text-sm text-slate-500">{payrollMonth}</span>
               </div>

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading rating list...</p>
               ) : ratingRows.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiBriefcaseLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No workers match this branch.</p>
                  </div>
               ) : (
                  <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                     <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left text-sm">
                           <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                              <tr>
                                 <th className="px-4 py-3">Worker</th>
                                 <th className="px-4 py-3">Role</th>
                                 <th className="px-4 py-3">Worked</th>
                                 <th className="px-4 py-3">Good</th>
                                 <th className="px-4 py-3">Normal</th>
                                 <th className="px-4 py-3">Bad</th>
                                 <th className="px-4 py-3">Penalties</th>
                                 <th className="px-4 py-3">Penalty sum</th>
                                 <th className="px-4 py-3">Salary</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-800">
                              {[...ratingRows]
                                 .sort((left, right) => {
                                    if (right.penalties !== left.penalties) {
                                       return right.penalties - left.penalties;
                                    }

                                    return right.workedHours - left.workedHours;
                                 })
                                 .map((row) => (
                                    <tr key={row.staffUserId} className="bg-slate-950/30">
                                       <td className="px-4 py-3 font-medium text-white">
                                          {row.staffName}
                                       </td>
                                       <td className="px-4 py-3 text-slate-300">
                                          {row.staffRoleLabel || "Staff"}
                                       </td>
                                       <td className="px-4 py-3 text-slate-300">{row.workedHours}h</td>
                                       <td className="px-4 py-3 text-emerald-200">{row.goodQuality}</td>
                                       <td className="px-4 py-3 text-slate-300">{row.normalQuality}</td>
                                       <td className="px-4 py-3 text-red-200">{row.badQuality}</td>
                                       <td className="px-4 py-3 text-slate-300">{row.penalties}</td>
                                       <td className="px-4 py-3 text-slate-300">
                                          {row.penaltyAmount.toLocaleString()}
                                       </td>
                                       <td className="px-4 py-3 font-semibold text-white">
                                          {row.salary.toLocaleString()}
                                       </td>
                                    </tr>
                                 ))}
                           </tbody>
                        </table>
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

                  <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                     <span className="font-medium text-white">
                        {staff.find((member) => member.userId === form.staffUserId)?.fullName || "Worker"}
                     </span>
                     <span className="text-slate-500"> - </span>
                     <span>
                        {branches.find((branch) => branch.id === form.branchId)?.name || "Branch"}
                     </span>
                     <span className="text-slate-500"> - </span>
                     <span>{form.shiftDate}</span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">

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
                  </div>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                     <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        <PiFloppyDiskLight size={18} />
                        {saving ? "Saving..." : "Save hours"}
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
