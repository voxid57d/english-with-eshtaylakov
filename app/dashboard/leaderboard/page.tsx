"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiTrophyLight, PiFireLight } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";

type LeaderboardEntry = {
   userId: string;
   username: string;
   rawStreak: number;
   lastActiveDate: string | null;
   isActive: boolean;
};

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

   return (
      <div className="space-y-6">
         <header className="flex items-start justify-between gap-4 flex-wrap">
            <div>
               <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <PiTrophyLight className="text-amber-300" />
                  <span>Leaderboard</span>
               </h1>
               <p className="text-sm text-slate-400">
                  Current daily streak ranking by username.
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
               No active streaks yet.
            </div>
         )}

         {!loading && !error && entries.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
               <div className="grid grid-cols-[72px_1fr_120px] gap-3 border-b border-slate-800 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>Rank</span>
                  <span>User</span>
                  <span className="text-right">Streak</span>
               </div>

               {entries.map((entry, index) => {
                  const isCurrentUser = entry.userId === currentUserId;

                  return (
                     <div
                        key={entry.userId}
                        className={[
                           "grid grid-cols-[72px_1fr_120px] gap-3 px-4 py-4 border-b border-slate-800 last:border-b-0 items-center",
                           isCurrentUser
                              ? "bg-emerald-500/10"
                              : entry.isActive
                                ? "bg-transparent"
                                : "bg-slate-900/50",
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
                                 entry.isActive
                                    ? "text-slate-100"
                                    : "text-slate-400",
                              ].join(" ")}>
                              {entry.username}
                           </p>
                           {isCurrentUser && (
                              <p className="text-xs text-emerald-300">
                                 You
                              </p>
                           )}
                           {!entry.isActive && (
                              <p className="text-xs text-slate-500">
                                 Inactive
                              </p>
                           )}
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
                  );
               })}
            </div>
         )}
      </div>
   );
}
