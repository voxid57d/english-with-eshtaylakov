"use client";

import Link from "next/link";
import {
   PiExamLight,
   PiFolderOpenLight,
   PiHeadphonesLight,
   PiReadCvLogoLight,
} from "react-icons/pi";

const folders = [
   {
      href: "/dashboard/mock/listening",
      title: "Listening",
      description:
         "Open the listening mock folder for timed audio-based IELTS practice.",
      icon: PiHeadphonesLight,
      accent:
         "from-emerald-500/20 via-teal-500/10 to-transparent border-emerald-500/25 text-emerald-200",
   },
   {
      href: "/dashboard/mock/reading",
      title: "Reading",
      description:
         "Open the reading mock folder for passage-based IELTS practice with timers and answer checking.",
      icon: PiReadCvLogoLight,
      accent:
         "from-sky-500/20 via-indigo-500/10 to-transparent border-sky-500/25 text-sky-200",
   },
];

export default function MockPage() {
   return (
      <div className="space-y-6">
         <header className="space-y-2">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
               <PiExamLight className="text-emerald-400" size={26} />
               <span>Mock tests</span>
            </h1>
            <p className="max-w-3xl text-sm text-slate-400">
               Choose a folder to enter the IELTS mock area. Listening and
               Reading now live as separate sections so we can keep adding more
               full tests.
            </p>
         </header>

         <div className="grid gap-4 md:grid-cols-2">
            {folders.map((folder) => {
               const Icon = folder.icon;

               return (
                  <Link
                     key={folder.href}
                     href={folder.href}
                     className={[
                        "group rounded-3xl border bg-gradient-to-br p-6 transition",
                        "hover:-translate-y-1 hover:bg-slate-900/80",
                        folder.accent,
                     ].join(" ")}>
                     <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                           <div className="inline-flex rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                              <Icon size={28} />
                           </div>
                           <div>
                              <h2 className="text-xl font-semibold text-slate-50">
                                 {folder.title}
                              </h2>
                              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
                                 {folder.description}
                              </p>
                           </div>
                        </div>

                        <PiFolderOpenLight
                           className="mt-1 text-slate-300 transition group-hover:text-white"
                           size={24}
                        />
                     </div>

                     <p className="mt-8 text-sm font-medium text-slate-100">
                        Open folder {"->"}
                     </p>
                  </Link>
               );
            })}
         </div>
      </div>
   );
}
