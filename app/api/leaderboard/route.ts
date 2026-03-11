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
   const { data: statsData, error: statsError } = await supabaseAdmin
      .from("user_stats")
      .select("user_id, streak, last_active_date");

   if (statsError) {
      console.error("Leaderboard stats error:", statsError);
      return NextResponse.json(
         { error: "Failed to load leaderboard." },
         { status: 500 },
      );
   }

   const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, is_premium");

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

   const entries = ((statsData || []) as UserStatRow[])
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
      });

   return NextResponse.json({ entries });
}
