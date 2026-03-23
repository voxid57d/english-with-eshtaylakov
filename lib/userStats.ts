"use client";

import { supabase } from "@/lib/supabaseClient";
import { getUzbekistanRecentDateStrings } from "@/lib/streakDate";

export type DashboardStats = {
   streak: number;
   curiosityPoints: number;
   isActive: boolean;
};

export async function syncDailyStreak(userId: string): Promise<DashboardStats> {
   const { today: todayStr, yesterday: yesterdayStr } =
      getUzbekistanRecentDateStrings();

   const { data, error } = await supabase
      .from("user_stats")
      .select("streak, last_active_date, curiosity_points")
      .eq("user_id", userId)
      .maybeSingle();

   if (error) {
      console.error("Error fetching user_stats:", error);
   }

   if (!data) {
      const { error: insertError } = await supabase.from("user_stats").insert({
         user_id: userId,
         streak: 1,
         last_active_date: todayStr,
         curiosity_points: 0,
      });

      if (insertError) {
         console.error("Error inserting user_stats:", insertError);
      }

      return {
         streak: 1,
         curiosityPoints: 0,
         isActive: true,
      };
   }

   const currentStreak = data.streak ?? 0;
   const curiosityPoints = data.curiosity_points ?? 0;
   const lastActive = data.last_active_date as string | null;

   if (lastActive === todayStr) {
      return {
         streak: currentStreak,
         curiosityPoints,
         isActive: true,
      };
   }

   const newStreak = lastActive === yesterdayStr ? currentStreak + 1 : 1;

   const { error: updateError } = await supabase
      .from("user_stats")
      .update({
         streak: newStreak,
         last_active_date: todayStr,
      })
      .eq("user_id", userId);

   if (updateError) {
      console.error("Error updating user_stats:", updateError);
   }

   return {
      streak: newStreak,
      curiosityPoints,
      isActive: true,
   };
}
