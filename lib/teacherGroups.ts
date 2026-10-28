export type GroupPeriod = {
   id: string;
   seriesId: string;
   startsOn: string | null;
   endsOn: string | null;
   weekdays: number[];
   active: boolean;
   isIntake: boolean;
   archivedOn: string | null;
};

export function groupIsWithinDates(group: GroupPeriod, date: string) {
   const available = group.active || !group.archivedOn || date < group.archivedOn;
   return available && (group.isIntake || (
      !!group.startsOn && group.startsOn <= date && (!group.endsOn || date <= group.endsOn)
   ));
}

export function groupIsOnDate(group: GroupPeriod, date: string) {
   const day = new Date(`${date}T00:00:00.000Z`).getUTCDay() || 7;
   return groupIsWithinDates(group, date) && group.weekdays.includes(day);
}

// Use the displayed lesson day so historical schedules retain their period's stage.
export function groupProgressStage(
   group: Pick<GroupPeriod, "startsOn" | "endsOn" | "isIntake">,
   date: string,
): number | null {
   if (group.isIntake || !group.startsOn || !group.endsOn) return null;
   const start = Date.parse(`${group.startsOn}T00:00:00.000Z`);
   const end = Date.parse(`${group.endsOn}T00:00:00.000Z`);
   const day = Date.parse(`${date}T00:00:00.000Z`);
   if (![start, end, day].every(Number.isFinite) || end < start) return null;
   if (day >= end) return 4;
   const durationDays = (end - start) / 86_400_000 + 1;
   const elapsedDays = (day - start) / 86_400_000;
   return Math.max(0, Math.min(4, Math.floor(elapsedDays * 5 / durationDays)));
}

// Keep the schedule's complete period list separate from the one-card-per-group view.
export function groupSeries<T extends GroupPeriod>(groups: T[], today: string) {
   const series = new Map<string, T[]>();
   for (const group of groups) {
      const periods = series.get(group.seriesId) || [];
      periods.push(group);
      series.set(group.seriesId, periods);
   }
   return [...series.entries()].map(([id, unsorted]) => {
      const periods = [...unsorted].sort((a, b) => (a.startsOn || "").localeCompare(b.startsOn || ""));
      const current = periods.find((period) => period.active && groupIsWithinDates(period, today));
      const upcoming = periods.find((period) => period.active && !!period.startsOn && period.startsOn > today);
      const representative = current || upcoming || periods[periods.length - 1];
      return { id, periods, current, representative, latest: periods[periods.length - 1] };
   });
}
