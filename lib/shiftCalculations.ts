export type Attendance = {
   isAssessed: boolean;
   absenceReason: "no_reason" | "sick_leave" | "asked" | null;
};

export function attendanceLabel(shift: Attendance) {
   if (!shift.isAssessed) return "Not assessed";
   if (shift.absenceReason === "asked") return "Asked";
   if (shift.absenceReason === "no_reason") return "No reason";
   if (shift.absenceReason === "sick_leave") return "Sick leave";
   return "Came";
}

export function summarizeAttendance(shifts: Attendance[]) {
   return {
      total: shifts.length,
      came: shifts.filter((shift) => shift.isAssessed && !shift.absenceReason).length,
      absent: shifts.filter((shift) => shift.isAssessed && shift.absenceReason).length,
      notAssessed: shifts.filter((shift) => !shift.isAssessed).length,
   };
}

// The threshold is per worker per day, including multiple shifts on that day.
export function calculateShiftPay(
   workMinutes: number,
   previousDailyMinutes: number,
   rates: { hourlyRate: number; extraHoursEnabled: boolean; extraHourlyRate: number; extraHoursThreshold: number },
) {
   const regularMinutes = rates.extraHoursEnabled
      ? Math.min(workMinutes, Math.max(0, rates.extraHoursThreshold * 60 - previousDailyMinutes))
      : workMinutes;
   return (regularMinutes * rates.hourlyRate + (workMinutes - regularMinutes) * rates.extraHourlyRate) / 60;
}
