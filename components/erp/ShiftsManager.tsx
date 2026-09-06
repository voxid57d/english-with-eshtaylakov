"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createLatestRequest, removeSavedDrafts } from "@/lib/shiftDrafts";
import { installUnsavedChangesGuard } from "@/lib/unsavedChanges";
import { getLocalDateString } from "@/lib/localDate";
import { useLocalToday } from "@/lib/useLocalToday";
import { attendanceLabel, summarizeAttendance } from "@/lib/shiftCalculations";
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
   isAssessed: boolean;
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

type RatingSortKey =
   | "staffName"
   | "staffRoleLabel"
   | "workedHours"
   | "goodQuality"
   | "normalQuality"
   | "badQuality"
   | "penalties"
   | "penaltyAmount"
   | "salary";

type RatingSort = {
   key: RatingSortKey;
   direction: "asc" | "desc";
};

function getSalesmanTierLabel(row: Pick<MonthlySummary, "staffRoleLabel" | "salaryTier">) {
   if (row.staffRoleLabel !== "Salesman" || row.salaryTier === "default") {
      return null;
   }

   return row.salaryTier.replace("_", " ");
}

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
   isAssessed: boolean;
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

function getWeekBoundsForLocalDate(dateValue = getLocalDateString()) {
   return getWeekBounds(dateValue);
}

function addMonths(monthValue: string, months: number) {
   const date = new Date(`${monthValue}-01T00:00:00.000Z`);
   date.setUTCMonth(date.getUTCMonth() + months);
   return date.toISOString().slice(0, 7);
}

const EMPTY_FORM: ShiftForm = {
   id: "",
   staffUserId: "",
   branchId: "",
   shiftDate: "",
   startsAt: "09:00",
   endsAt: "18:00",
   breakMinutes: 60,
   status: "scheduled",
   isAssessed: false,
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

function attendanceClass(shift: ShiftView) {
   if (!shift.isAssessed) return "border-slate-700 bg-slate-800/50 text-slate-300";
   const { absenceReason } = shift;
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
   const [shiftDrafts, setShiftDrafts] = useState<Record<string, ShiftView>>({});
   const [canManage, setCanManage] = useState(false);
   const [weekStart, setWeekStart] = useState(() => getWeekBoundsForLocalDate().weekStart);
   const [weekEnd, setWeekEnd] = useState(() => getWeekBoundsForLocalDate().weekEnd);
   const [selectedDate, setSelectedDate] = useState(getLocalDateString());
   const [payrollMonth, setPayrollMonth] = useState(() => getLocalDateString().slice(0, 7));
   const [ratingSort, setRatingSort] = useState<RatingSort>({
      key: "penalties",
      direction: "desc",
   });
   const [branchFilter, setBranchFilter] = useState("all");
   const [form, setForm] = useState<ShiftForm>(() => ({ ...EMPTY_FORM, shiftDate: getLocalDateString() }));
   const [workingHourForm, setWorkingHourForm] = useState<WorkingHourForm>(
      EMPTY_WORKING_HOUR_FORM,
   );
   const [shiftModalOpen, setShiftModalOpen] = useState(false);
   const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
   const [originalForm, setOriginalForm] = useState<ShiftForm | null>(null);
   const [originalWorkingHourForm, setOriginalWorkingHourForm] = useState(EMPTY_WORKING_HOUR_FORM);
   const latestLoad = useRef(createLatestRequest());
   const reloadCurrentView = useRef<() => Promise<void>>(async () => {});
   const mounted = useRef(false);
   const [expandedTemplateStaffIds, setExpandedTemplateStaffIds] = useState<string[]>([]);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
   const today = useLocalToday();
   const pendingDraftCount = Object.keys(shiftDrafts).length;
   const formDirty = shiftModalOpen && JSON.stringify(form) !== JSON.stringify(originalForm);
   const workingHoursDirty = JSON.stringify(workingHourForm) !== JSON.stringify(originalWorkingHourForm);
   const hasUnsavedChanges = pendingDraftCount > 0 || formDirty || workingHoursDirty || saving;

   useEffect(() => {
      mounted.current = true;
      return () => { mounted.current = false; };
   }, []);

   useEffect(() => {
      if (hasUnsavedChanges) {
         return installUnsavedChangesGuard(saving
            ? "Shift changes are still saving. Leave anyway? The save may continue after you leave."
            : undefined);
      }
   }, [hasUnsavedChanges, saving]);

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
               isAssessed: false,
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
               finalWorkMinutes: 0,
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
      return summarizeAttendance(selectedDayShifts);
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

   const sortedRatingRows = useMemo(() => {
      const direction = ratingSort.direction === "asc" ? 1 : -1;
      const stringKeys: RatingSortKey[] = ["staffName", "staffRoleLabel"];

      return [...ratingRows].sort((left, right) => {
         if (stringKeys.includes(ratingSort.key)) {
            const leftValue = String(left[ratingSort.key] || "");
            const rightValue = String(right[ratingSort.key] || "");
            const result = leftValue.localeCompare(rightValue);
            return result === 0
               ? left.staffName.localeCompare(right.staffName)
               : result * direction;
         }

         const result = Number(left[ratingSort.key]) - Number(right[ratingSort.key]);
         return result === 0
            ? left.staffName.localeCompare(right.staffName)
            : result * direction;
      });
   }, [ratingRows, ratingSort]);

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
      const request = latestLoad.current.begin();
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         if (!request.isCurrent()) return;
         const [response, workingHoursResponse] = await Promise.all([
            fetch(
            `/api/erp/shifts?weekStart=${weekStart}&weekEnd=${weekEnd}&payrollMonth=${payrollMonth}&branchId=${branchFilter}`,
            {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
               signal: request.signal,
            },
            ),
            fetch("/api/erp/working-hours", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
               signal: request.signal,
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

         if (!request.isCurrent()) return;
         setShifts(payload.shifts || []);
         setStaff(payload.staff || []);
         setBranches(payload.branches || []);
         setMonthlySummaries(payload.monthlySummaries || []);
         setCanManage(Boolean(payload.canManage));
         setWorkingHours(workingHoursPayload.workingHours || []);
      } catch (requestError) {
         if (!request.isCurrent()) return;
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load shifts.",
         );
      } finally {
         if (request.isCurrent()) setLoading(false);
      }
   }, [branchFilter, payrollMonth, weekEnd, weekStart]);

   useEffect(() => {
      reloadCurrentView.current = loadShifts;
      const requests = latestLoad.current;
      void loadShifts();
      return () => requests.cancel();
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

   const changeRatingSort = (key: RatingSortKey) => {
      setRatingSort((current) => ({
         key,
         direction:
            current.key === key && current.direction === "desc" ? "asc" : "desc",
      }));
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
      if (formDirty && !window.confirm("Discard your unsaved hour changes?")) return;
      setEditingShiftId(null);
      setOriginalForm(null);
      setForm({ ...EMPTY_FORM, shiftDate: getLocalDateString() });
      setShiftModalOpen(false);
      setError(null);
      setSuccess(null);
   };

   const editShift = (shift: ShiftView) => {
      const nextForm: ShiftForm = {
         id: shift.isGenerated ? "" : shift.id,
         staffUserId: shift.staffUserId,
         branchId: shift.branchId,
         shiftDate: shift.shiftDate,
         startsAt: shift.startsAt,
         endsAt: shift.endsAt,
         breakMinutes: shift.breakMinutes,
         status: shift.status,
         isAssessed: shift.isAssessed,
         uniformOk: shift.uniformOk,
         lateMinutes: shift.lateMinutes,
         lateCountsPenalty: shift.lateCountsPenalty,
         workQuality: shift.workQuality,
         absenceReason: shift.absenceReason,
         actualWorkMinutes: null,
         note: shift.note || "",
      };
      setForm(nextForm);
      setOriginalForm(nextForm);
      setEditingShiftId(shift.id);
      setShiftModalOpen(true);
      setError(null);
      setSuccess(null);
   };

   const resetWorkingHourForm = () => {
      setWorkingHourForm(EMPTY_WORKING_HOUR_FORM);
      setOriginalWorkingHourForm(EMPTY_WORKING_HOUR_FORM);
      setError(null);
      setSuccess(null);
   };

   const editWorkingHour = (workingHour: WorkingHourView) => {
      if (workingHoursDirty && !window.confirm("Discard your unsaved working-hour changes?")) return;
      const nextForm: WorkingHourForm = {
         id: workingHour.id,
         staffUserId: workingHour.staffUserId,
         branchId: workingHour.branchId || "",
         weekdays: [workingHour.weekday],
         startsAt: workingHour.startsAt,
         endsAt: workingHour.endsAt,
         breakMinutes: workingHour.breakMinutes,
         active: workingHour.active,
         note: workingHour.note || "",
      };
      setWorkingHourForm(nextForm);
      setOriginalWorkingHourForm(nextForm);
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
      if (!canManage || saving || loading) return;
      const currentShift = scheduledShifts.find((shift) => shift.id === shiftId);
      if (!currentShift) return;

      const applyUpdate = (shift: ShiftView): ShiftView => {
         const nextShift = { ...shift, ...updates };
         if (!nextShift.isAssessed) nextShift.absenceReason = null;
         if (!nextShift.isAssessed || nextShift.absenceReason) {
            nextShift.uniformOk = true;
            nextShift.lateMinutes = 0;
            nextShift.lateCountsPenalty = false;
            nextShift.workQuality = "normal";
         }
         const lateDeductedMinutes = Math.floor(nextShift.lateMinutes / 60) * 60;
         const finalWorkMinutes = !nextShift.isAssessed || nextShift.absenceReason
            ? 0
            : Math.max(0, nextShift.scheduledWorkMinutes - lateDeductedMinutes);
         const penaltyCount = !nextShift.isAssessed ? 0 : nextShift.absenceReason
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
      if (saving || !canManage || pendingDraftCount === 0) return;
      const savedDrafts = { ...shiftDrafts };
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
               shifts: Object.values(savedDrafts).map((shift) => ({
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

         if (!mounted.current) return;
         setShiftDrafts((current) => removeSavedDrafts(current, savedDrafts));
         const savedCount = Object.keys(savedDrafts).length;
         setSuccess(`${savedCount} shift change${savedCount === 1 ? "" : "s"} saved.`);
         await reloadCurrentView.current();
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
      const savedDrafts = editingShiftId && shiftDrafts[editingShiftId] ? { [editingShiftId]: shiftDrafts[editingShiftId] } : {};
      event.preventDefault();
      if (saving) return;

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

         if (!mounted.current) return;
         setShiftDrafts((current) => removeSavedDrafts(current, savedDrafts));
         setEditingShiftId(null);
         setOriginalForm(null);
         setSuccess(form.id ? "Shift updated." : "Shift created.");
         setForm({ ...EMPTY_FORM, shiftDate: getLocalDateString() });
         setShiftModalOpen(false);
         await reloadCurrentView.current();
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
      if (saving) return;

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
         setOriginalWorkingHourForm(EMPTY_WORKING_HOUR_FORM);
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
         <fieldset key={shift.id} disabled={!canManage || saving || loading} className={`min-w-0 rounded-lg border p-3 ${penaltyTone}`}>
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
                        attendanceClass(shift),
                     ].join(" ")}>
                     {attendanceLabel(shift)}
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

            {shift.isAssessed && !isAbsentState && (
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
                     value={shift.isAssessed ? shift.absenceReason || "" : "not_assessed"}
                     onChange={(event) =>
                        updateShiftDraft(shift.id, {
                           isAssessed: event.target.value !== "not_assessed",
                           absenceReason: event.target.value === "not_assessed" ? null :
                              (event.target.value as ShiftView["absenceReason"]) || null,
                        })
                     }
                     className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                     <option value="not_assessed">Not assessed</option>
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
         </fieldset>
      );
   };

   const renderRatingSortHeader = (key: RatingSortKey, label: string) => {
      const active = ratingSort.key === key;
      const arrow = active ? (ratingSort.direction === "desc" ? "↓" : "↑") : "";

      return (
         <button
            type="button"
            onClick={() => changeRatingSort(key)}
            className={[
               "inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] transition hover:text-white",
               active ? "text-emerald-300" : "text-slate-500",
            ].join(" ")}>
            <span>{label}</span>
            <span className="w-3 text-left">{arrow}</span>
         </button>
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
                        onChange={(event) => setPayrollMonth(event.target.value || getLocalDateString().slice(0, 7))}
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Day shifts</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.total}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Came</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.came}</p>
                     </div>
                     <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                        <p className="text-xs text-slate-500">Not assessed</p>
                        <p className="mt-1 text-2xl font-semibold text-white">{summary.notAssessed}</p>
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

         {pendingDraftCount > 0 && (
            <section aria-label="Unsaved shift changes" className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-slate-950 p-4 shadow-lg">
               <div>
                  <p role="status" className="text-sm font-semibold text-amber-200">{pendingDraftCount} unsaved shift change{pendingDraftCount === 1 ? "" : "s"}</p>
                  <p className="mt-1 text-xs text-slate-400">Includes edits on other dates and branches. Unassessed shifts do not count toward pay.</p>
               </div>
               <div className="flex gap-2">
                  <button type="button" disabled={saving} onClick={() => {
                     if (window.confirm("Discard all unsaved shift changes, including other dates and branches?")) {
                        setShiftDrafts({});
                        setSuccess(null);
                     }
                  }} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-60">Discard all</button>
                  <button type="button" disabled={saving || loading || !canManage} onClick={() => void saveDailyAssessments()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                     <PiFloppyDiskLight size={18} />{saving ? "Saving..." : "Save all changes"}
                  </button>
               </div>
            </section>
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
                                 <th className="px-4 py-3">{renderRatingSortHeader("staffName", "Worker")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("staffRoleLabel", "Role")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("workedHours", "Worked")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("goodQuality", "Good")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("normalQuality", "Normal")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("badQuality", "Bad")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("penalties", "Penalties")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("penaltyAmount", "Penalty sum")}</th>
                                 <th className="px-4 py-3">{renderRatingSortHeader("salary", "Salary")}</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-800">
                              {sortedRatingRows.map((row) => {
                                 const salesmanTierLabel = getSalesmanTierLabel(row);

                                 return (
                                    <tr key={row.staffUserId} className="bg-slate-950/30">
                                       <td className="px-4 py-3 font-medium text-white">
                                          <div className="flex flex-wrap items-center gap-2">
                                             <span>{row.staffName}</span>
                                             {salesmanTierLabel && (
                                                <span className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal text-emerald-100">
                                                   {salesmanTierLabel}
                                                </span>
                                             )}
                                          </div>
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
                                 );
                              })}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
            </div>
         </section>
         )}

         {shiftModalOpen && canManage && (
            <div className="app-backdrop fixed inset-0 z-50 flex items-center justify-center px-4 py-6 backdrop-blur-sm">
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
