"use client";

import Link from "next/link";
import { PiClockCountdownLight, PiNotePencilLight } from "react-icons/pi";
import { WRITING_TASKS } from "@/lib/writing";

export default function WritingPage() {
   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
               <h1 className="flex items-center gap-2 text-3xl font-semibold">
                  <PiNotePencilLight className="text-emerald-400" />
                  <span>Writing</span>
               </h1>
               <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Choose a task first, then open one of its prompt cards like Test 1
                  or Test 2 to start writing.
               </p>
            </div>
         </div>

         <div className="grid gap-4 md:grid-cols-2">
            {WRITING_TASKS.map((task) => (
               <Link
                  key={task.taskNumber}
                  href={`/dashboard/writing/${task.taskNumber}`}
                  className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 transition hover:-translate-y-1 hover:border-emerald-500/40">
                  <div className="bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(15,23,42,0.08),rgba(251,191,36,0.08))] p-6">
                     <p className="text-xs uppercase tracking-[0.24em] text-emerald-300">
                        Writing
                     </p>
                     <h2 className="mt-2 text-3xl font-semibold text-white">
                        {task.title}
                     </h2>
                     <p className="mt-6 text-sm leading-6 text-slate-300">
                        {task.taskNumber === 1
                           ? "Summarise visual information, report key features, and compare relevant data."
                           : "Write a clear essay with reasons, examples, and a well-supported position."}
                     </p>
                  </div>

                  <div className="flex items-center justify-between p-6">
                     <div className="flex items-center gap-2 text-sm text-slate-400">
                        <PiClockCountdownLight />
                        <span>About {task.recommendedMinutes} minutes</span>
                     </div>
                     <span className="text-sm text-emerald-300 transition group-hover:text-emerald-200">
                        Open prompts
                     </span>
                  </div>
               </Link>
            ))}
         </div>
      </div>
   );
}
