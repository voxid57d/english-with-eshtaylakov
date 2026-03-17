"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiTrophyLight, PiFireLight } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";

type LeaderboardEntry = {
   userId: string;
   username: string;
   isPremium: boolean;
   rawStreak: number;
   curiosityPoints: number;
   lastActiveDate: string | null;
   isActive: boolean;
};

const STREAK_CURIOSITY_POINTS_PER_DAY = 50;

export default function LeaderboardPage() {
   const router = useRouter();
   const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
   const [currentUserId, setCurrentUserId] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;

      async function load() {
         try {
            setLoading(true);
            setError(null);

            const {
               data: { user },
               error: userError,
            } = await supabase.auth.getUser();

            if (userError) {
               throw userError;
            }

            if (!user) {
               router.replace("/login");
               return;
            }

            if (!cancelled) {
               setCurrentUserId(user.id);
            }

            const response = await fetch("/api/leaderboard", {
               cache: "no-store",
            });

            const payload = await response.json();

            if (!response.ok) {
               throw new Error(payload?.error || "Failed to load leaderboard.");
            }

            const leaderboard = (payload?.entries || []) as LeaderboardEntry[];

            if (!cancelled) {
               setEntries(leaderboard);
            }
         } catch (err) {
            console.error("Error loading leaderboard:", err);
            if (!cancelled) {
               setError("Failed to load leaderboard.");
            }
         } finally {
            if (!cancelled) {
               setLoading(false);
            }
         }
      }

      load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   const rankedEntries = entries
      .map((entry) => {
         const streakBonus = entry.isActive
            ? entry.rawStreak * STREAK_CURIOSITY_POINTS_PER_DAY
            : 0;

         return {
            ...entry,
            streakBonus,
            displayCuriosityPoints: entry.curiosityPoints + streakBonus,
         };
      })
      .sort((a, b) => {
         if (b.displayCuriosityPoints !== a.displayCuriosityPoints) {
            return b.displayCuriosityPoints - a.displayCuriosityPoints;
         }

         if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
         }

         if (b.rawStreak !== a.rawStreak) {
            return b.rawStreak - a.rawStreak;
         }

         return a.username.localeCompare(b.username);
      })
      .slice(0, 15);

   return (
      <div className="space-y-6">
         <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
               <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <PiTrophyLight className="text-amber-300" />
                  <span>Leaderboard</span>
               </h1>
               <p className="text-sm text-slate-400">
                  Top 15 users ranked by Curiosity Points
               </p>
            </div>
         </header>

         {loading && (
            <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
               Loading leaderboard...
            </div>
         )}

         {!loading && error && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-400">
               {error}
            </div>
         )}

         {!loading && !error && entries.length === 0 && (
            <div className="rounded-xl border border-slate-800 p-4 text-sm text-slate-400">
               No leaderboard data yet.
            </div>
         )}

         {!loading && !error && entries.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
               <div className="hidden border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400 sm:grid sm:grid-cols-[72px_minmax(0,1fr)_140px_120px] sm:gap-3">
                  <span>Rank</span>
                  <span>User</span>
                  <span className="text-right">Curiosity</span>
                  <span className="text-right">Streak</span>
               </div>

               {rankedEntries.map((entry, index) => {
                  const isCurrentUser = entry.userId === currentUserId;
                  const mobileRowTone = isCurrentUser
                     ? entry.isPremium
                        ? "border-amber-400/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.18),rgba(16,185,129,0.14))]"
                        : "border-emerald-500/35 bg-emerald-500/10"
                     : entry.isPremium
                       ? "border-amber-400/35 bg-amber-500/10"
                       : entry.isActive
                         ? "border-slate-800 bg-transparent"
                         : "border-slate-800 bg-slate-900/50";
                  const desktopRowTone = isCurrentUser
                     ? "bg-emerald-500/10"
                     : entry.isPremium
                       ? "bg-[linear-gradient(90deg,rgba(251,191,36,0.22),rgba(245,158,11,0.12),rgba(15,23,42,0.02))]"
                       : entry.isActive
                         ? "bg-transparent"
                         : "bg-slate-900/50";
                  const usernameTone = entry.isPremium
                     ? "text-amber-100"
                     : entry.isActive
                       ? "text-slate-100"
                       : "text-slate-400";

                  return (
                     <div key={entry.userId}>
                        <div
                           className={[
                              "mx-3 mb-3 rounded-2xl border p-4 first:mt-3 sm:hidden",
                              mobileRowTone,
                           ].join(" ")}>
                           <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                 <p
                                    className={[
                                       "text-sm font-semibold",
                                       entry.isActive
                                          ? "text-slate-200"
                                          : "text-slate-500",
                                    ].join(" ")}>
                                    #{index + 1}
                                 </p>
                                 <p
                                    className={[
                                       "mt-1 truncate text-lg font-semibold",
                                       usernameTone,
                                    ].join(" ")}>
                                    {entry.username}
                                 </p>
                                 {isCurrentUser && (
                                    <p className="mt-1 text-xs font-medium text-emerald-300">
                                       You
                                    </p>
                                 )}
                                 {!entry.isActive && (
                                    <p className="mt-1 text-xs text-slate-500">
                                       Inactive
                                    </p>
                                 )}
                              </div>

                              <div className="text-right">
                                 <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                    Curiosity
                                 </p>
                                 <p
                                    className={[
                                       "mt-1 flex items-center justify-end gap-1.5 text-lg font-semibold",
                                       entry.isActive
                                          ? "text-slate-100"
                                          : "text-slate-400",
                                    ].join(" ")}>
                                    <Image
                                       src="/cp-icon.svg"
                                       alt=""
                                       aria-hidden="true"
                                       width={16}
                                       height={16}
                                       className="h-4 w-4 shrink-0"
                                    />
                                    {entry.displayCuriosityPoints}
                                 </p>
                              </div>
                           </div>

                           <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/35 px-3 py-2">
                              <span className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                 Streak
                              </span>
                              <div
                                 className={[
                                    "flex items-center gap-2",
                                    entry.isActive
                                       ? "text-amber-300"
                                       : "text-slate-500",
                                 ].join(" ")}>
                                 <PiFireLight className="shrink-0" />
                                 <span
                                    className={[
                                       "font-semibold",
                                       entry.isActive
                                          ? "text-slate-100"
                                          : "text-slate-400",
                                    ].join(" ")}>
                                    {entry.rawStreak} day
                                    {entry.rawStreak === 1 ? "" : "s"}
                                 </span>
                              </div>
                           </div>
                        </div>

                        <div
                           className={[
                              "hidden border-b border-slate-700/80 px-4 py-4 last:border-b-0 items-center shadow-[inset_0_-1px_0_rgba(51,65,85,0.38)] sm:grid sm:grid-cols-[72px_minmax(0,1fr)_140px_120px] sm:gap-3",
                              entry.isPremium
                                 ? "border-l border-l-amber-300/30"
                                 : "",
                              desktopRowTone,
                           ].join(" ")}>
                           <div
                              className={[
                                 "text-sm font-semibold",
                                 entry.isActive
                                    ? "text-slate-200"
                                    : "text-slate-500",
                              ].join(" ")}>
                              #{index + 1}
                           </div>

                           <div className="min-w-0">
                              <p
                                 className={[
                                    "truncate font-medium",
                                    usernameTone,
                                 ].join(" ")}>
                                 {entry.username}
                              </p>
                              {isCurrentUser && (
                                 <p className="text-xs text-emerald-300">You</p>
                              )}
                              {!entry.isActive && (
                                 <p className="text-xs text-slate-500">Inactive</p>
                              )}
                           </div>

                           <div className="text-right">
                              <p
                                 className={[
                                    "flex items-center justify-end gap-1.5 font-semibold",
                                    entry.isActive
                                       ? "text-slate-100"
                                       : "text-slate-400",
                                 ].join(" ")}>
                                 <Image
                                    src="/cp-icon.svg"
                                    alt=""
                                    aria-hidden="true"
                                    width={16}
                                    height={16}
                                    className="h-4 w-4 shrink-0"
                                 />
                                 {entry.displayCuriosityPoints}
                              </p>
                           </div>

                           <div
                              className={[
                                 "flex items-center justify-end gap-2",
                                 entry.isActive
                                    ? "text-amber-300"
                                    : "text-slate-500",
                              ].join(" ")}>
                              <PiFireLight className="shrink-0" />
                              <span
                                 className={[
                                    "font-semibold",
                                    entry.isActive
                                       ? "text-slate-100"
                                       : "text-slate-400",
                                 ].join(" ")}>
                                 {entry.rawStreak} day
                                 {entry.rawStreak === 1 ? "" : "s"}
                              </span>
                           </div>
                        </div>
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   );
}
