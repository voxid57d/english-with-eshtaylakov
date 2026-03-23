const UZBEKISTAN_TIME_ZONE = "Asia/Tashkent";

function formatDateInTimeZone(date: Date, timeZone: string) {
   const parts = new Intl.DateTimeFormat("en", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
   }).formatToParts(date);

   const year = parts.find((part) => part.type === "year")?.value;
   const month = parts.find((part) => part.type === "month")?.value;
   const day = parts.find((part) => part.type === "day")?.value;

   if (!year || !month || !day) {
      throw new Error(`Failed to format date for timezone ${timeZone}.`);
   }

   return `${year}-${month}-${day}`;
}

export function getUzbekistanDateString(date = new Date()) {
   return formatDateInTimeZone(date, UZBEKISTAN_TIME_ZONE);
}

export function getUzbekistanRecentDateStrings(date = new Date()) {
   const today = getUzbekistanDateString(date);
   const yesterday = getUzbekistanDateString(
      new Date(date.getTime() - 24 * 60 * 60 * 1000),
   );

   return { today, yesterday };
}
