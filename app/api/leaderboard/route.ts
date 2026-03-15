import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type UserStatRow = {
   user_id: string;
   streak: number | null;
   last_active_date: string | null;
};

type ProfileRow = {
   id: string;
   username: string | null;
   is_premium: boolean | null;
};

function isStreakActive(lastActiveDate: string | null) {
   if (!lastActiveDate) return false;

   const today = new Date().toISOString().slice(0, 10);
   const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

   return lastActiveDate === today || lastActiveDate === yesterday;
}

export async function GET() {
   const today = new Date().toISOString().slice(0, 10);
   const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

   const { data: activeStatsData, error: activeStatsError } = await supabaseAdmin
      .from("user_stats")
      .select("user_id, streak, last_active_date")
      .in("last_active_date", [today, yesterday])
      .gt("streak", 0)
      .order("streak", { ascending: false })
      .order("last_active_date", { ascending: false })
      .limit(15);

   if (activeStatsError) {
      console.error("Leaderboard stats error:", activeStatsError);
      return NextResponse.json(
         { error: "Failed to load leaderboard." },
         { status: 500 },
      );
   }

   const activeStats = (activeStatsData || []) as UserStatRow[];
   const remainingSlots = Math.max(0, 15 - activeStats.length);

   let inactiveStats: UserStatRow[] = [];

   if (remainingSlots > 0) {
      const { data: inactiveStatsData, error: inactiveStatsError } =
         await supabaseAdmin
            .from("user_stats")
            .select("user_id, streak, last_active_date")
            .gt("streak", 0)
            .lt("last_active_date", yesterday)
            .order("streak", { ascending: false })
            .order("last_active_date", { ascending: false })
            .limit(remainingSlots);

      if (inactiveStatsError) {
         console.error("Leaderboard stats error:", inactiveStatsError);
         return NextResponse.json(
            { error: "Failed to load leaderboard." },
            { status: 500 },
         );
      }

      inactiveStats = (inactiveStatsData || []) as UserStatRow[];

      const nullDateSlots = Math.max(0, remainingSlots - inactiveStats.length);
      if (nullDateSlots > 0) {
         const { data: nullDateStatsData, error: nullDateStatsError } =
            await supabaseAdmin
               .from("user_stats")
               .select("user_id, streak, last_active_date")
               .gt("streak", 0)
               .is("last_active_date", null)
               .order("streak", { ascending: false })
               .limit(nullDateSlots);

         if (nullDateStatsError) {
            console.error("Leaderboard stats error:", nullDateStatsError);
            return NextResponse.json(
               { error: "Failed to load leaderboard." },
               { status: 500 },
            );
         }

         inactiveStats = [
            ...inactiveStats,
            ...((nullDateStatsData || []) as UserStatRow[]),
         ];
      }
   }

   const statsData = [...activeStats, ...inactiveStats];
   const userIds = statsData.map((row) => row.user_id);

   if (userIds.length === 0) {
      return NextResponse.json({ entries: [] });
   }

   const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, is_premium")
      .in("id", userIds);

   if (profilesError) {
      console.error("Leaderboard profiles error:", profilesError);
      return NextResponse.json(
         { error: "Failed to load leaderboard." },
         { status: 500 },
      );
   }

   const profileMap = new Map(
      ((profilesData || []) as ProfileRow[]).map((profile) => [
         profile.id,
         {
            username: profile.username?.trim() || null,
            isPremium: profile.is_premium === true,
         },
      ]),
   );

   const entries = (statsData as UserStatRow[])
      .map((row) => ({
         userId: row.user_id,
         username: profileMap.get(row.user_id)?.username || "Unknown user",
         isPremium: profileMap.get(row.user_id)?.isPremium === true,
         rawStreak: row.streak ?? 0,
         lastActiveDate: row.last_active_date,
         isActive: isStreakActive(row.last_active_date),
      }))
      .filter((entry) => entry.username && entry.rawStreak > 0)
      .sort((a, b) => {
         if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
         }

         if (b.rawStreak !== a.rawStreak) {
            return b.rawStreak - a.rawStreak;
         }

         return (b.lastActiveDate || "").localeCompare(a.lastActiveDate || "");
      })
      .slice(0, 15);

   return NextResponse.json({ entries });
}
