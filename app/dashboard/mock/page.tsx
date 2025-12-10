"use client";

import Link from "next/link";
import { PiHeadphonesLight, PiExamLight } from "react-icons/pi";

export default function MockPage() {
   // Later we can load this from Supabase.
   // For now it's a simple hard-coded list of listening mock tests.
   const listeningTests = [
      {
         slug: "ielts-listening-2",
         title: "IELTS Listening Test 2",
         description:
            "Full IELTS-style listening test (4 parts, 40 questions) with automatic scoring.",
         questionCount: 40,
         level: "IELTS",
      },
   ];

   return (
      <div className="space-y-6">
         {/* Page heading */}
         <header className="flex items-center justify-between gap-3">
            <div>
               <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <PiExamLight className="text-emerald-400" size={26} />
                  <span>Mock tests</span>
               </h1>
               <p className="text-slate-400 mt-1">
                  Practice full exam-style tests for listening (reading and more
                  coming soon).
               </p>
            </div>
         </header>

         {/* Sections grid */}
         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Listening section card */}
            <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-4 md:p-5">
               <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                     <div className="rounded-xl bg-emerald-500/10 p-2 border border-emerald-500/40">
                        <PiHeadphonesLight
                           className="text-emerald-400"
                           size={24}
                        />
                     </div>
                     <div>
                        <h2 className="text-lg font-semibold text-slate-50">
                           Listening mock tests
                        </h2>
                        <p className="text-sm text-slate-400">
                           Timed IELTS-style listening practice with instant
                           results.
                        </p>
                     </div>
                  </div>
               </div>

               {/* Tests list */}
               <div className="space-y-3">
                  {listeningTests.map((test) => (
                     <Link
                        key={test.slug}
                        href={`/mock/listening/${test.slug}`}
                        className="group block rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3
                                   hover:border-emerald-400 hover:bg-slate-900/80 hover:-translate-y-[1px]
                                   transition-all duration-200">
                        <div className="flex items-center justify-between gap-3">
                           <div>
                              <h3 className="font-semibold text-slate-50 group-hover:text-emerald-300">
                                 {test.title}
                              </h3>
                              <p className="text-sm text-slate-400 mt-1">
                                 {test.description}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                 {test.level} • {test.questionCount} questions
                              </p>
                           </div>
                           <span className="text-xs font-medium text-emerald-300 group-hover:text-emerald-200">
                              Start test →
                           </span>
                        </div>
                     </Link>
                  ))}
               </div>
            </section>

            {/* Placeholder for future sections (Reading, Full mocks, Grammar, etc.) */}
            <section className="bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl p-4 md:p-5 flex items-center justify-center text-slate-500 text-sm">
               More mock sections (Reading, full IELTS, etc.) coming soon…
            </section>
         </div>
      </div>
   );
}
