"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiExamLight, PiHeadphonesLight } from "react-icons/pi";

type ListeningTestRow = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   is_premium: boolean;
};

export default function MockPage() {
   const router = useRouter();

   const [tests, setTests] = useState<ListeningTestRow[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [isPremiumUser, setIsPremiumUser] = useState<boolean | null>(null);

   useEffect(() => {
      async function load() {
         try {
            setLoading(true);
            setError(null);

            const { data: userData, error: userError } =
               await supabase.auth.getUser();

            if (userError || !userData.user) {
               router.push("/login");
               return;
            }

            const premium = await getPremiumStatus(userData.user.id);
            setIsPremiumUser(premium);

            const { data, error } = await supabase
               .from("listening_tests")
               .select("id, slug, title, description, is_premium");

            if (error) {
               console.error("Error loading listening tests:", error);
               setError("Failed to load listening tests.");
               setTests([]);
               return;
            }

            setTests((data || []) as ListeningTestRow[]);
         } finally {
            setLoading(false);
         }
      }

      load();
   }, [router]);

   const loadingSkeleton = (
      <div aria-live="polite" aria-busy="true" className="space-y-6">
         <header className="flex items-center justify-between gap-3">
            <div className="space-y-3">
               <div className="h-8 w-44 rounded-full bg-slate-700/80 skeleton-shimmer" />
               <div className="h-4 w-[28rem] max-w-full rounded-full bg-slate-900 skeleton-shimmer" />
            </div>
         </header>

         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 md:p-5">
               <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                     <div className="h-12 w-12 rounded-xl border border-emerald-500/25 bg-slate-900 skeleton-shimmer" />
                     <div className="space-y-2">
                        <div className="h-6 w-44 rounded-full bg-slate-700/80 skeleton-shimmer" />
                        <div className="h-4 w-64 max-w-full rounded-full bg-slate-800 skeleton-shimmer" />
                     </div>
                  </div>
               </div>

               <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                     <div
                        key={index}
                        className="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                           <div className="flex-1 space-y-2">
                              <div className="h-5 w-3/4 rounded-full bg-slate-700/80 skeleton-shimmer" />
                              <div className="flex items-center gap-2">
                                 <div className="h-5 w-20 rounded-full bg-slate-800 skeleton-shimmer" />
                                 <div className="h-4 w-24 rounded-full bg-slate-900 skeleton-shimmer" />
                              </div>
                              <div className="h-4 w-11/12 rounded-full bg-slate-800/80 skeleton-shimmer" />
                           </div>
                           <div className="h-5 w-20 rounded-full bg-slate-800 skeleton-shimmer" />
                        </div>
                     </div>
                  ))}
               </div>
            </section>

            <section className="flex items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-4 md:p-5">
               <div className="w-full space-y-3">
                  <div className="h-6 w-40 rounded-full bg-slate-800 skeleton-shimmer" />
                  <div className="h-4 w-10/12 rounded-full bg-slate-900 skeleton-shimmer" />
                  <div className="h-4 w-8/12 rounded-full bg-slate-900/80 skeleton-shimmer" />
               </div>
            </section>
         </div>
      </div>
   );

   if (loading) {
      return loadingSkeleton;
   }

   if (error) {
      return (
         <div className="space-y-4">
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
               <PiExamLight className="text-emerald-400" size={26} />
               <span>Mock tests</span>
            </h1>
            <p className="text-sm text-red-400">{error}</p>
         </div>
      );
   }

   return (
      <div className="space-y-6">
         <header className="flex items-center justify-between gap-3">
            <div>
               <h1 className="flex items-center gap-2 text-2xl font-semibold">
                  <PiExamLight className="text-emerald-400" size={26} />
                  <span>Mock tests</span>
               </h1>
               <p className="mt-1 text-slate-400">
                  Practice full exam-style tests. Listening tests are loaded
                  from your database.
               </p>
            </div>
         </header>

         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 md:p-5">
               <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                     <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2">
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
                           Timed IELTS-style listening practice with automatic
                           scoring.
                        </p>
                     </div>
                  </div>
               </div>

               {tests.length === 0 ? (
                  <p className="text-sm text-slate-500">
                     No listening tests have been added yet.
                  </p>
               ) : (
                  <div className="space-y-3">
                     {tests.map((test) => {
                        const locked =
                           test.is_premium && isPremiumUser === false;

                        return (
                           <button
                              key={test.id}
                              type="button"
                              onClick={() => {
                                 if (locked) {
                                    router.push("/premium");
                                 } else {
                                    router.push(`/mock/listening/${test.slug}`);
                                 }
                              }}
                              className={[
                                 "w-full text-left group rounded-xl border px-4 py-3",
                                 "bg-slate-950/60 border-slate-700",
                                 "hover:border-emerald-400 hover:bg-slate-900/80 hover:-translate-y-[1px]",
                                 "transition-all duration-200",
                                 locked
                                    ? "opacity-70 cursor-pointer"
                                    : "cursor-pointer",
                              ].join(" ")}>
                              <div className="flex items-center justify-between gap-3">
                                 <div>
                                    <h3 className="font-semibold text-slate-50 group-hover:text-emerald-300">
                                       {test.title}
                                    </h3>

                                    <div className="mt-1 flex items-center gap-2">
                                       <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold
                                             ${
                                                test.is_premium
                                                   ? "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                                                   : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                                             }`}>
                                          {test.is_premium
                                             ? locked
                                                ? "Premium • Locked"
                                                : "Premium"
                                             : "Free"}
                                       </span>

                                       {locked && (
                                          <span className="text-[11px] text-slate-400">
                                             Upgrade to unlock
                                          </span>
                                       )}
                                    </div>

                                    {test.description && (
                                       <p className="mt-1 text-sm text-slate-400">
                                          {test.description}
                                       </p>
                                    )}
                                 </div>

                                 <span className="text-xs font-medium text-emerald-300 group-hover:text-emerald-200">
                                    {locked ? "View plans ->" : "Start test ->"}
                                 </span>
                              </div>
                           </button>
                        );
                     })}
                  </div>
               )}
            </section>

            <section className="flex items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-500 md:p-5">
               More mock sections (Reading, full IELTS, etc.) coming soon...
            </section>
         </div>
      </div>
   );
}
