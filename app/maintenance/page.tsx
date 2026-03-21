import Link from "next/link";

export default function MaintenancePage() {
   return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),_rgba(2,6,23,1)_45%)] px-6 py-16 text-slate-100">
         <div className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-3xl flex-col items-center justify-center">
            <div className="w-full rounded-[2rem] border border-emerald-500/20 bg-slate-950/70 p-8 shadow-[0_30px_100px_rgba(2,6,23,0.55)] sm:p-10">
               <p className="text-xs uppercase tracking-[0.35em] text-emerald-300">
                  Maintenance Mode
               </p>
               <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                  Talk Time is getting an upgrade.
               </h1>
               <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                  We are temporarily pausing access while we roll out a larger update.
                  The site will be back as soon as everything is stable.
               </p>

               <div className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                  <p className="text-sm font-medium text-slate-100">
                     What is happening right now
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                     We are applying backend and gameplay changes, validating data, and
                     checking that the new experience is safe to reopen.
                  </p>
               </div>

               <div className="mt-8 flex flex-wrap gap-3">
                  <Link
                     href="/"
                     className="rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">
                     Refresh later
                  </Link>
               </div>
            </div>
         </div>
      </main>
   );
}
