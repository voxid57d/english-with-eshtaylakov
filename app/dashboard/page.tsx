"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiFireLight } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { syncDailyStreak } from "@/lib/userStats";

type Quote = {
   text: string;
   author: string;
};

type LeaderboardPreviewEntry = {
   userId: string;
   username: string;
   isPremium: boolean;
   rawStreak: number;
   curiosityPoints: number;
   isActive: boolean;
};

const STREAK_CURIOSITY_POINTS_PER_DAY = 50;

const QUOTES: Quote[] = [
   {
      text: "The limits of my language mean the limits of my world.",
      author: "Ludwig Wittgenstein",
   },
   {
      text: "Learning another language is not only learning different words, but learning another way to think.",
      author: "Flora Lewis",
   },
   {
      text: "A different language is a different vision of life.",
      author: "Federico Fellini",
   },
   {
      text: "Practice makes progress, not perfection.",
      author: "Unknown",
   },
   {
      text: "The more you read, the more things you will know. The more you learn, the more places you'll go.",
      author: "Dr. Seuss",
   },
   {
      text: "Great things are not done by impulse, but by a series of small things brought together.",
      author: "Vincent Van Gogh",
   },
   {
      text: "Success in IELTS is not about talent; it's about consistent practice.",
      author: "Unknown",
   },
   {
      text: "Motivation gets you started. Habit keeps you going.",
      author: "Jim Rohn",
   },
   {
      text: "Your vocabulary is your world. Grow it every day.",
      author: "Unknown",
   },
   {
      text: "Small daily improvements are the key to long-term results.",
      author: "Unknown",
   },
   {
      text: "Mistakes are proof that you're trying.",
      author: "Unknown",
   },
   {
      text: "The secret of getting ahead is getting started.",
      author: "Mark Twain",
   },
   {
      text: "To have another language is to possess a second soul.",
      author: "Charlemagne",
   },
   {
      text: "Exams test your memory; life tests your learning.",
      author: "Unknown",
   },
   {
      text: "Reading is to the mind what exercise is to the body.",
      author: "Richard Steele",
   },
];

function getQuoteOfToday(): Quote {
   const today = new Date();
   const dateString = today.toISOString().slice(0, 10);

   let hash = 0;
   for (let i = 0; i < dateString.length; i += 1) {
      hash = (hash * 31 + dateString.charCodeAt(i)) >>> 0;
   }

   return QUOTES[hash % QUOTES.length];
}

function getDisplayCuriosityPoints(entry: {
   curiosityPoints: number;
   rawStreak: number;
   isActive: boolean;
}) {
   return (
      entry.curiosityPoints +
      (entry.isActive ? entry.rawStreak * STREAK_CURIOSITY_POINTS_PER_DAY : 0)
   );
}

export default function DashboardPage() {
   const router = useRouter();
   const [streak, setStreak] = useState<number | null>(null);
   const [curiosityPoints, setCuriosityPoints] = useState<number | null>(null);
   const [displayCuriosityPoints, setDisplayCuriosityPoints] = useState<number | null>(null);
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [loadingStats, setLoadingStats] = useState(true);
   const [topEntries, setTopEntries] = useState<LeaderboardPreviewEntry[]>([]);
   const [loadingTopEntries, setLoadingTopEntries] = useState(false);

   const quote = getQuoteOfToday();

   useEffect(() => {
      let cancelled = false;

      async function load() {
         const { data, error } = await supabase.auth.getUser();
         if (error) {
            console.error("Error getting user:", error);
            router.replace("/login");
            return;
         }

         const user = data.user;
         if (!user) {
            router.replace("/login");
            return;
         }

         const userId = user.id;
         if (!cancelled) {
            setCurrentUserId(userId);
         }

         const stats = await syncDailyStreak(userId);
         if (!cancelled) {
            setStreak(stats.streak);
            setCuriosityPoints(stats.curiosityPoints);
            setDisplayCuriosityPoints(
               stats.curiosityPoints +
                  (stats.isActive
                     ? stats.streak * STREAK_CURIOSITY_POINTS_PER_DAY
                     : 0),
            );
            setLoadingStats(false);
         }

         const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .single();

         if (profileError) {
            console.error("Error loading profile:", profileError);
            router.replace("/username");
            return;
         }

         if (!profile.username) {
            router.replace("/username");
            return;
         }
      }

      void load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   useEffect(() => {
      if (!currentUserId) {
         return;
      }

      let cancelled = false;
      let timeoutId: number | null = null;

      const loadLeaderboardPreview = async () => {
         try {
            if (!cancelled) {
               setLoadingTopEntries(true);
            }

            const response = await fetch("/api/leaderboard", {
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               throw new Error(payload?.error || "Failed to load leaderboard.");
            }

            const previewEntries = ((payload?.entries || []) as LeaderboardPreviewEntry[])
               .sort((a, b) => {
                  const curiosityDiff =
                     getDisplayCuriosityPoints(b) - getDisplayCuriosityPoints(a);
                  if (curiosityDiff !== 0) {
                     return curiosityDiff;
                  }

                  if (a.isActive !== b.isActive) {
                     return a.isActive ? -1 : 1;
                  }

                  if (b.rawStreak !== a.rawStreak) {
                     return b.rawStreak - a.rawStreak;
                  }

                  return a.username.localeCompare(b.username);
               })
               .slice(0, 5);

            if (!cancelled) {
               setTopEntries(previewEntries);
            }
         } catch (error) {
            console.error("Error loading dashboard leaderboard preview:", error);
         } finally {
            if (!cancelled) {
               setLoadingTopEntries(false);
            }
         }
      };

      // Defer this fetch so the dashboard content renders before leaderboard preview work begins.
      timeoutId = window.setTimeout(() => {
         void loadLeaderboardPreview();
      }, 250);

      return () => {
         cancelled = true;
         if (timeoutId !== null) {
            window.clearTimeout(timeoutId);
         }
      };
   }, [currentUserId]);

   return (
      <div className="space-y-6">
         <div className="rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">Current streak</p>

            {loadingStats ? (
               <p className="mt-2 text-lg text-slate-500">
                  Checking your streak...
               </p>
            ) : (
               <>
                  <div className="mt-2 flex flex-wrap items-center gap-4">
                     <p className="flex items-center gap-2 text-2xl font-semibold">
                        <PiFireLight className="text-amber-300" />
                        <span>{streak}-day streak</span>
                     </p>
                     <div className="flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1.5">
                        <Image
                           src="/cp-icon.svg"
                           alt=""
                           aria-hidden="true"
                           width={18}
                           height={18}
                           className="h-[18px] w-[18px] shrink-0"
                        />
                        <span className="text-sm font-semibold text-amber-100">
                           {displayCuriosityPoints ?? curiosityPoints ?? 0} Curiosity
                        </span>
                     </div>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                     Keep it going! Do at least one activity today.
                  </p>
               </>
            )}
         </div>

         <div className="rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">Quote of the day</p>
            <p className="mt-2 text-lg">
               &quot;{quote.text}&quot;
            </p>
            <p className="mt-1 text-sm text-slate-500">- {quote.author}</p>
         </div>

         <div className="rounded-xl border border-slate-800 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
               <div>
                  <p className="text-sm text-slate-400">Leaderboard preview</p>
                  <p className="mt-1 text-sm text-slate-500">
                     Top 5 users by Curiosity
                  </p>
               </div>
               <Link
                  href="/dashboard/leaderboard"
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800"
               >
                  Open leaderboard
               </Link>
            </div>

            {loadingTopEntries ? (
               <div className="mt-4 space-y-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                     <div
                        key={index}
                        className="h-14 animate-pulse rounded-2xl border border-slate-800 bg-slate-900/60"
                     />
                  ))}
               </div>
            ) : topEntries.length > 0 ? (
               <div className="mt-4 space-y-3">
                  {topEntries.map((entry, index) => {
                     const isCurrentUser = entry.userId === currentUserId;

                     return (
                        <div
                           key={entry.userId}
                           className={[
                              "flex items-center justify-between gap-3 rounded-2xl border px-4 py-3",
                              isCurrentUser
                                 ? "border-emerald-500/35 bg-emerald-500/10"
                                 : entry.isPremium
                                   ? "border-amber-400/25 bg-[linear-gradient(90deg,rgba(251,191,36,0.16),rgba(245,158,11,0.06),rgba(15,23,42,0.02))]"
                                   : "border-slate-800 bg-slate-900/50",
                           ].join(" ")}
                        >
                           <div className="min-w-0">
                              <div className="flex items-center gap-3">
                                 <span className="text-sm font-semibold text-slate-400">
                                    #{index + 1}
                                 </span>
                                 <p
                                    className={[
                                       "truncate font-medium",
                                       entry.isPremium
                                          ? "text-amber-100"
                                          : "text-slate-100",
                                    ].join(" ")}
                                 >
                                    {entry.username}
                                 </p>
                              </div>
                              {isCurrentUser && (
                                 <p className="mt-1 text-xs text-emerald-300">
                                    You
                                 </p>
                              )}
                           </div>

                           <div className="flex items-center gap-2 text-slate-100">
                              <Image
                                 src="/cp-icon.svg"
                                 alt=""
                                 aria-hidden="true"
                                 width={16}
                                 height={16}
                                 className="h-4 w-4 shrink-0"
                              />
                              <span className="font-semibold">
                                 {getDisplayCuriosityPoints(entry)}
                              </span>
                           </div>
                        </div>
                     );
                  })}
               </div>
            ) : (
               <p className="mt-4 text-sm text-slate-500">
                  Leaderboard preview will appear here once users start earning Curiosity.
               </p>
            )}
         </div>
      </div>
   );
}
