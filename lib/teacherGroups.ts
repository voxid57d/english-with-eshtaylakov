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
