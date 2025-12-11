"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiHeadphonesLight, PiExamLight } from "react-icons/pi";

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

            // 1) Check user
            const { data: userData, error: userError } =
               await supabase.auth.getUser();

            if (userError || !userData.user) {
               // If somehow not logged in, go to login
               router.push("/login");
               return;
            }

            // 2) Check if this user is premium
            const premium = await getPremiumStatus(userData.user.id);
            setIsPremiumUser(premium);

            // 3) Load listening tests
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

   if (loading) {
      return (
         <div className="space-y-4">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
               <PiExamLight className="text-emerald-400" size={26} />
               <span>Mock tests</span>
            </h1>
            <p className="text-slate-400 text-sm">Loading listening tests…</p>
         </div>
      );
   }

   if (error) {
      return (
         <div className="space-y-4">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
               <PiExamLight className="text-emerald-400" size={26} />
               <span>Mock tests</span>
            </h1>
            <p className="text-red-400 text-sm">{error}</p>
         </div>
      );
   }

   return (
      <div className="space-y-6">
         <header className="flex items-center justify-between gap-3">
            <div>
               <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <PiExamLight className="text-emerald-400" size={26} />
                  <span>Mock tests</span>
               </h1>
               <p className="text-slate-400 mt-1">
                  Practice full exam-style tests. Listening tests are loaded
                  from your database.
               </p>
            </div>
         </header>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                       <p className="text-sm text-slate-400 mt-1">
                                          {test.description}
                                       </p>
                                    )}
                                 </div>

                                 <span className="text-xs font-medium text-emerald-300 group-hover:text-emerald-200">
                                    {locked ? "View plans →" : "Start test →"}
                                 </span>
                              </div>
                           </button>
                        );
                     })}
                  </div>
               )}
            </section>

            <section className="bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl p-4 md:p-5 flex items-center justify-center text-slate-500 text-sm">
               More mock sections (Reading, full IELTS, etc.) coming soon…
            </section>
         </div>
      </div>
   );
}
