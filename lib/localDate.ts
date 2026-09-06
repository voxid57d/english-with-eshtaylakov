// Browsers use the user's local day; server defaults use the branch's timezone.
export function getLocalDateString(
   date = new Date(),
   timeZone = typeof window === "undefined" ? "Asia/Tashkent" : undefined,
) {
   if (!timeZone) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
   }

   const parts = new Intl.DateTimeFormat("en", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
   }).formatToParts(date);
   const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
   return `${part("year")}-${part("month")}-${part("day")}`;
}
