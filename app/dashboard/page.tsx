// app/dashboard/page.tsx

export default function DashboardPage() {
   return (
      <div className="space-y-6">
         {/* Quote card */}
         <div className="rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">Quote of the day</p>
            <p className="mt-2 text-lg">
               "Learning a new language rewires your brain."
            </p>
         </div>
      </div>
   );
}
