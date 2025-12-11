"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";

// ---- Types ----
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

         // 1) Get current user
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

         // 2) Check premium status
         const premium = await getPremiumStatus(user.id);
         setIsPremium(premium);

         // 3) Fetch all graded listening tests & podcasts
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

         const typedTests = (testsData || []) as ListeningTest[];
         setTests(typedTests);

         // 4) Fetch completed attempts for this user
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

   // Separate podcasts from normal tests
   const podcastTests = tests.filter((t) => t.is_podcast);
   const normalTests = tests.filter((t) => !t.is_podcast);

   // Group normal tests by level
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

   return (
      <div className="space-y-8">
         {/* Header (no subscription status chip) */}
         <div>
            <h1 className="text-2xl font-semibold">Listening</h1>
            <p className="text-sm text-slate-400">
               Graded listening exercises and podcast-style listening practice.
            </p>
         </div>

         {loading && (
            <p className="text-sm text-slate-300">Loading listening content…</p>
         )}

         {!loading && error && <p className="text-sm text-red-400">{error}</p>}

         {/* Podcast section */}
         {!loading && podcastTests.length > 0 && (
            <section className="space-y-3">
               <h2 className="text-lg font-semibold flex items-center gap-2">
                  <span>Podcasts</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/40">
                     Just listen &amp; read
                  </span>
               </h2>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

         {/* Graded listening by level */}
         {!loading && (
            <section className="space-y-6">
               {LEVELS.map((level) => {
                  const levelTests = testsByLevel[level];
                  if (levelTests.length === 0) return null;

                  return (
                     <div key={level} className="space-y-3">
                        <h2 className="text-lg font-semibold flex items-center gap-2">
                           <span>{level} Listening</span>
                           <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-600">
                              {levelTests.length} exercise
                              {levelTests.length > 1 ? "s" : ""}
                           </span>
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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

// ---- Card component ----
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

   // Card styles
   const premiumClasses =
      "rounded-xl border border-amber-400/70 bg-slate-900/70 hover:border-amber-300 hover:bg-slate-900 transition shadow-sm shadow-amber-900/40 p-4 space-y-2";
   const normalClasses =
      "rounded-xl border border-slate-700/70 bg-slate-900/70 hover:border-emerald-500/70 hover:bg-slate-900 transition shadow-sm shadow-slate-950/40 p-4 space-y-2";

   // PREMIUM EXERCISE (visible as premium for everyone)
   if (isPremiumExercise) {
      // locked → click goes to /premium
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

      // unlocked → click opens the test
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

   // NON-PREMIUM EXERCISE
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
               <p className="text-sm font-semibold text-slate-50 line-clamp-2">
                  {test.title}
               </p>
               <p className="text-xs text-slate-400 mt-1">
                  {test.is_podcast ? "Podcast mode" : "Graded listening test"}
               </p>
               {isLocked && (
                  <p className="text-[11px] text-slate-400 mt-2">
                     This listening exercise is available for Premium users.
                  </p>
               )}
            </div>

            <div className="flex flex-col items-end gap-1">
               {/* Level badge */}
               <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-600">
                  {test.level}
               </span>

               {/* Done badge (only when unlocked) */}
               {isCompleted && !isLocked && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/60">
                     Done
                  </span>
               )}

               {/* Premium badge (for all premium exercises, locked or not) */}
               {test.requires_premium && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-200 border border-amber-400/70">
                     Premium
                  </span>
               )}
            </div>
         </div>
      </>
   );
}
