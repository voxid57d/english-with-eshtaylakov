"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiHeadphonesLight } from "react-icons/pi";

type Level = "A1" | "A2" | "B1" | "B2" | "C1";

type ListeningTest = {
   id: string;
   slug: string;
   title: string;
   level: Level;
   is_podcast: boolean;
   requires_premium: boolean;
};

const LEVELS: Level[] = ["A1", "A2", "B1", "B2", "C1"];

export default function ListeningPage() {
   const router = useRouter();

   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [tests, setTests] = useState<ListeningTest[]>([]);
   const [completedTestIds, setCompletedTestIds] = useState<Set<string>>(
      new Set()
   );
   const [isPremium, setIsPremium] = useState(false);

   useEffect(() => {
      async function load() {
         setLoading(true);
         setError(null);

         const {
            data: { user },
            error: userError,
         } = await supabase.auth.getUser();

         if (userError) {
            console.error("Error getting user:", userError);
            setError("Could not load user information.");
            setLoading(false);
            return;
         }

         if (!user) {
            router.push("/login");
            return;
         }

         const premium = await getPremiumStatus(user.id);
         setIsPremium(premium);

         const { data: testsData, error: testsError } = await supabase
            .from("gl_tests")
            .select("id, slug, title, level, is_podcast, requires_premium")
            .order("created_at", { ascending: true });

         if (testsError) {
            console.error("Error loading listening tests:", testsError);
            setError("Could not load listening tests.");
            setLoading(false);
            return;
         }

         setTests((testsData || []) as ListeningTest[]);

         const { data: attemptsData, error: attemptsError } = await supabase
            .from("gl_attempts")
            .select("test_id")
            .eq("user_id", user.id);

         if (attemptsError) {
            console.error("Error loading attempts:", attemptsError);
         } else {
            const ids = new Set<string>(
               (attemptsData || []).map((row) => row.test_id as string)
            );
            setCompletedTestIds(ids);
         }

         setLoading(false);
      }

      load();
   }, [router]);

   const podcastTests = tests.filter((t) => t.is_podcast);
   const normalTests = tests.filter((t) => !t.is_podcast);

   const testsByLevel: Record<Level, ListeningTest[]> = {
      A1: [],
      A2: [],
      B1: [],
      B2: [],
      C1: [],
   };

   for (const test of normalTests) {
      testsByLevel[test.level].push(test);
   }

   const loadingSkeleton = (
      <section aria-live="polite" aria-busy="true" className="space-y-8">
         <div className="space-y-3">
            <div className="h-8 w-40 rounded-full bg-slate-700/80 skeleton-shimmer" />
            <div className="h-4 w-96 max-w-full rounded-full bg-slate-900 skeleton-shimmer" />
         </div>

         <section className="space-y-3">
            <div className="flex items-center gap-2">
               <div className="h-7 w-28 rounded-full bg-slate-800 skeleton-shimmer" />
               <div className="h-6 w-28 rounded-full border border-slate-800 bg-slate-900/60 skeleton-shimmer" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
               {Array.from({ length: 3 }).map((_, index) => (
                  <div
                     key={`podcast-${index}`}
                     className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
                     <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-2">
                           <div className="h-5 w-3/4 rounded-full bg-slate-700/80 skeleton-shimmer" />
                           <div className="h-4 w-32 rounded-full bg-slate-800 skeleton-shimmer" />
                        </div>
                        <div className="space-y-2">
                           <div className="h-6 w-12 rounded-full bg-slate-800 skeleton-shimmer" />
                           <div className="h-6 w-18 rounded-full bg-slate-800 skeleton-shimmer" />
                        </div>
                     </div>
                  </div>
               ))}
            </div>
         </section>

         <section className="space-y-6">
            {Array.from({ length: 3 }).map((_, groupIndex) => (
               <div key={groupIndex} className="space-y-3">
                  <div className="flex items-center gap-2">
                     <div className="h-7 w-36 rounded-full bg-slate-700/80 skeleton-shimmer" />
                     <div className="h-6 w-24 rounded-full border border-slate-800 bg-slate-900/60 skeleton-shimmer" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                     {Array.from({ length: 3 }).map((_, cardIndex) => (
                        <div
                           key={`${groupIndex}-${cardIndex}`}
                           className="space-y-3 rounded-xl border border-slate-700/70 bg-slate-900/70 p-4">
                           <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 space-y-2">
                                 <div className="h-5 w-4/5 rounded-full bg-slate-700/80 skeleton-shimmer" />
                                 <div className="h-4 w-36 rounded-full bg-slate-800 skeleton-shimmer" />
                              </div>
                              <div className="space-y-2">
                                 <div className="h-6 w-12 rounded-full bg-slate-800 skeleton-shimmer" />
                                 <div className="h-6 w-16 rounded-full bg-slate-800 skeleton-shimmer" />
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>
            ))}
         </section>
      </section>
   );

   return (
      <div className="space-y-8">
         <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
               <PiHeadphonesLight className="text-emerald-400" />
               <span>Listening</span>
            </h1>

            <p className="text-sm text-slate-400">
               Graded listening exercises and podcast-style listening practice.
            </p>
         </div>

         {loading && loadingSkeleton}

         {!loading && error && <p className="text-sm text-red-400">{error}</p>}

         {!loading && podcastTests.length > 0 && (
            <section className="space-y-3">
               <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <span>Podcasts</span>
                  <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-300">
                     Just listen &amp; read
                  </span>
               </h2>
               <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {podcastTests.map((test) => (
                     <ListeningCard
                        key={test.id}
                        test={test}
                        isCompleted={completedTestIds.has(test.id)}
                        isPremiumUser={isPremium}
                     />
                  ))}
               </div>
            </section>
         )}

         {!loading && (
            <section className="space-y-6">
               {LEVELS.map((level) => {
                  const levelTests = testsByLevel[level];
                  if (levelTests.length === 0) return null;

                  return (
                     <div key={level} className="space-y-3">
                        <h2 className="flex items-center gap-2 text-lg font-semibold">
                           <span>{level} Listening</span>
                           <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs text-slate-200">
                              {levelTests.length} exercise
                              {levelTests.length > 1 ? "s" : ""}
                           </span>
                        </h2>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                           {levelTests.map((test) => (
                              <ListeningCard
                                 key={test.id}
                                 test={test}
                                 isCompleted={completedTestIds.has(test.id)}
                                 isPremiumUser={isPremium}
                              />
                           ))}
                        </div>
                     </div>
                  );
               })}
            </section>
         )}

         {!loading && !error && tests.length === 0 && (
            <p className="text-sm text-slate-400">
               No listening content yet. Add some tests and podcasts in
               Supabase.
            </p>
         )}
      </div>
   );
}

function ListeningCard({
   test,
   isCompleted,
   isPremiumUser,
}: {
   test: ListeningTest;
   isCompleted: boolean;
   isPremiumUser: boolean;
}) {
   const router = useRouter();
   const isPremiumExercise = test.requires_premium;
   const isLocked = isPremiumExercise && !isPremiumUser;

   const premiumClasses =
      "rounded-xl border border-amber-400/70 bg-slate-900/70 hover:border-amber-300 hover:bg-slate-900 transition shadow-sm shadow-amber-900/40 p-4 space-y-2";
   const normalClasses =
      "rounded-xl border border-slate-700/70 bg-slate-900/70 hover:border-emerald-500/70 hover:bg-slate-900 transition shadow-sm shadow-slate-950/40 p-4 space-y-2";

   if (isPremiumExercise) {
      if (isLocked) {
         return (
            <div
               onClick={() => router.push("/premium")}
               className={`${premiumClasses} cursor-pointer`}>
               <CardContent
                  test={test}
                  isCompleted={isCompleted}
                  isLocked={true}
               />
            </div>
         );
      }

      return (
         <Link
            href={`/dashboard/listening/${test.slug}`}
            className={premiumClasses}>
            <CardContent
               test={test}
               isCompleted={isCompleted}
               isLocked={false}
            />
         </Link>
      );
   }

   return (
      <Link
         href={`/dashboard/listening/${test.slug}`}
         className={normalClasses}>
         <CardContent test={test} isCompleted={isCompleted} isLocked={false} />
      </Link>
   );
}

function CardContent({
   test,
   isCompleted,
   isLocked,
}: {
   test: ListeningTest;
   isCompleted: boolean;
   isLocked: boolean;
}) {
   return (
      <>
         <div className="flex items-start justify-between gap-2">
            <div>
               <p className="line-clamp-2 text-sm font-semibold text-slate-50">
                  {test.title}
               </p>
               <p className="mt-1 text-xs text-slate-400">
                  {test.is_podcast ? "Podcast mode" : "Graded listening test"}
               </p>
               {isLocked && (
                  <p className="mt-2 text-[11px] text-slate-400">
                     This listening exercise is available for Premium users.
                  </p>
               )}
            </div>

            <div className="flex flex-col items-end gap-1">
               <span className="rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] text-slate-200">
                  {test.level}
               </span>

               {isCompleted && !isLocked && (
                  <span className="rounded-full border border-emerald-400/60 bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-300">
                     Done
                  </span>
               )}

               {test.requires_premium && (
                  <span className="rounded-full border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200">
                     Premium
                  </span>
               )}
            </div>
         </div>
      </>
   );
}
