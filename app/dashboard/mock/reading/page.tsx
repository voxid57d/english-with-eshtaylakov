"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiArrowLeftLight, PiReadCvLogoLight } from "react-icons/pi";

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
            <Link
               href="/dashboard/mock"
               className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200">
               <PiArrowLeftLight size={18} />
               <span>Back to folders</span>
            </Link>

            <div>
               <h1 className="flex items-center gap-2 text-2xl font-semibold">
                  <PiReadCvLogoLight className="text-sky-400" size={26} />
                  <span>Reading folder</span>
               </h1>
               <p className="mt-1 text-sm text-slate-400">
                  Passage-based IELTS reading mock tests with timers and answer
                  review.
               </p>
            </div>
         </header>

         {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
               Loading reading tests...
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
            <div className="space-y-3">
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
                        className="w-full rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:-translate-y-[1px] hover:border-sky-400/30 hover:bg-slate-900">
                        <div className="flex items-start justify-between gap-4">
                           <div>
                              <h2 className="font-semibold text-slate-50">
                                 {test.title}
                              </h2>
                              {test.description && (
                                 <p className="mt-2 text-sm text-slate-400">
                                    {test.description}
                                 </p>
                              )}
                              <p className="mt-3 text-xs text-slate-500">
                                 {test.is_premium
                                    ? locked
                                       ? "Premium locked"
                                       : "Premium"
                                    : "Free"}
                              </p>
                           </div>

                           <span className="text-sm font-medium text-sky-300">
                              {locked ? "View plans ->" : "Start ->"}
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
