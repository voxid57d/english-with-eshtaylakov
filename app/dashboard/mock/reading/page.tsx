"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiReadCvLogoLight } from "react-icons/pi";

type ReadingMockTestRow = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   is_premium: boolean;
   is_published: boolean;
};

export default function MockReadingPage() {
   const router = useRouter();
   const [tests, setTests] = useState<ReadingMockTestRow[]>([]);
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
               .from("reading_mock_tests")
               .select("id, slug, title, description, is_premium, is_published")
               .eq("is_published", true)
               .order("created_at", { ascending: false });

            if (error) {
               throw error;
            }

            setTests((data || []) as ReadingMockTestRow[]);
         } catch (requestError) {
            console.error(requestError);
            setError("Failed to load reading tests.");
         } finally {
            setLoading(false);
         }
      }

      load();
   }, [router]);

   return (
      <div className="space-y-6">
         <header className="space-y-3">
            <div>
               <h1 className="flex items-center gap-2 text-2xl font-semibold">
                  <PiReadCvLogoLight className="text-sky-400" size={26} />
                  <span>IELTS Reading</span>
               </h1>
            </div>
         </header>

         {loading ? (
            <div className="space-y-3">
               {Array.from({ length: 4 }).map((_, index) => (
                  <div
                     key={`reading-skeleton-${index}`}
                     className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                     <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 space-y-3">
                           <div className="h-5 w-52 max-w-[70%] rounded-full bg-slate-700/80 skeleton-shimmer" />
                           <div className="h-4 w-4/5 rounded-full bg-slate-800 skeleton-shimmer" />
                           <div className="h-4 w-2/3 rounded-full bg-slate-900 skeleton-shimmer" />
                           <div className="h-3 w-20 rounded-full bg-slate-800 skeleton-shimmer" />
                        </div>
                        <div className="mt-1 h-4 w-16 rounded-full bg-slate-800 skeleton-shimmer" />
                     </div>
                  </div>
               ))}
            </div>
         ) : error ? (
            <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
               {error}
            </div>
         ) : tests.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
               No reading tests have been added yet.
            </div>
         ) : (
            <div className="grid gap-4 lg:grid-cols-2">
               {tests.map((test) => {
                  const locked = test.is_premium && isPremiumUser === false;

                  return (
                     <button
                        key={test.id}
                        type="button"
                        onClick={() => {
                           if (locked) {
                              router.push("/premium");
                           } else {
                              router.push(`/mock/reading/${test.slug}`);
                           }
                        }}
                        className="group w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-900/70 text-left transition hover:-translate-y-1 hover:border-sky-400/35 hover:bg-slate-900">
                        <div className="bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(59,130,246,0.06),rgba(15,23,42,0.02))] p-5">
                           <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                 <p className="text-[11px] uppercase tracking-[0.24em] text-sky-300">
                                    IELTS Reading
                                 </p>
                                 <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                                    {test.title}
                                 </h2>
                              </div>
                              <span className="rounded-full border border-white/10 bg-slate-950/40 px-3 py-1 text-xs font-medium text-sky-200">
                                 Full test
                              </span>
                           </div>
                        </div>

                        <div className="flex items-center justify-between gap-4 p-5">
                           <span className="shrink-0 rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-300 transition group-hover:border-sky-300/35 group-hover:bg-sky-500/15 group-hover:text-sky-200">
                              {locked ? "View plans ->" : "Start test ->"}
                           </span>
                        </div>
                     </button>
                  );
               })}
            </div>
         )}
      </div>
   );
}
