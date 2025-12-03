// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ---- Types ----
type Quote = {
   text: string;
   author: string;
};

// ---- Quotes list (hardcoded) ----
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
      text: "The more you read, the more things you will know. The more you learn, the more places you’ll go.",
      author: "Dr. Seuss",
   },
   {
      text: "Great things are not done by impulse, but by a series of small things brought together.",
      author: "Vincent Van Gogh",
   },
   {
      text: "Success in IELTS is not about talent; it’s about consistent practice.",
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
      text: "Mistakes are proof that you’re trying.",
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

// ---- Helper: get quote of the day ----
function getQuoteOfToday(): Quote {
   const today = new Date();

   // "2025-12-02"
   const dateString = today.toISOString().slice(0, 10);

   // simple hash from the date string
   let hash = 0;
   for (let i = 0; i < dateString.length; i++) {
      hash = (hash * 31 + dateString.charCodeAt(i)) >>> 0;
   }

   const index = hash % QUOTES.length;
   return QUOTES[index];
}

// ---- Helper: update & get streak from Supabase ----
async function updateAndGetStreak(userId: string): Promise<number> {
   // Today string in "YYYY-MM-DD"
   const today = new Date();
   const todayStr = today.toISOString().slice(0, 10);

   // Yesterday string (for checking streak continuation)
   const yesterday = new Date();
   yesterday.setDate(today.getDate() - 1);
   const yesterdayStr = yesterday.toISOString().slice(0, 10);

   // 1) Try to fetch existing stats row
   const { data, error } = await supabase
      .from("user_stats")
      .select("streak, last_active_date")
      .eq("user_id", userId)
      .maybeSingle();

   if (error) {
      console.error("Error fetching user_stats:", error);
      // Fallback: treat as no row yet
   }

   // 2) If no row yet — create it with streak = 1
   if (!data) {
      const { error: insertError } = await supabase.from("user_stats").insert({
         user_id: userId,
         streak: 1,
         last_active_date: todayStr,
      });

      if (insertError) {
         console.error("Error inserting user_stats:", insertError);
      }

      return 1;
   }

   // We have a row
   const currentStreak = data.streak;
   const lastActive = data.last_active_date as string; // e.g. "2025-12-01"

   // 3) If already active today → streak stays the same
   if (lastActive === todayStr) {
      return currentStreak;
   }

   let newStreak: number;

   // 4) If last activity was yesterday → continue streak +1
   if (lastActive === yesterdayStr) {
      newStreak = currentStreak + 1;
   } else {
      // 5) If gap > 1 day → reset streak to 1
      newStreak = 1;
   }

   // 6) Save updated streak to DB
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

   return newStreak;
}

// ---- Dashboard component ----
export default function DashboardPage() {
   const router = useRouter();
   const [streak, setStreak] = useState<number | null>(null);
   const [loadingStreak, setLoadingStreak] = useState(true);

   const quote = getQuoteOfToday();

   useEffect(() => {
      async function load() {
         // 1) Get current user
         const { data, error } = await supabase.auth.getUser();

         if (error) {
            console.error("Error getting user:", error);
            return;
         }

         const user = data.user;

         // 2) If no user, redirect to login
         if (!user) {
            router.push("/login");
            return;
         }

         const userId = user.id;

         // 3) NEW: check if this user has a username; if not → /username
         const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", userId)
            .maybeSingle();

         if (profileError) {
            console.error("Error loading profile:", profileError);
         }

         if (!profile || !profile.username) {
            router.push("/username");
            return;
         }

         // 4) Update streak in DB and get current value
         const currentStreak = await updateAndGetStreak(user.id);
         setStreak(currentStreak);
         setLoadingStreak(false);
      }

      load();
   }, [router]);

   return (
      <div className="space-y-6">
         {/* Streak card */}
         <div className="rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">Current streak</p>

            {loadingStreak ? (
               <p className="mt-2 text-lg text-slate-500">
                  Checking your streak…
               </p>
            ) : (
               <>
                  <p className="mt-2 text-2xl font-semibold">
                     🔥 {streak}-day streak
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                     Keep it going! Do at least one activity today.
                  </p>
               </>
            )}
         </div>

         {/* Quote card */}
         <div className="rounded-xl border border-slate-800 p-4">
            <p className="text-sm text-slate-400">Quote of the day</p>
            <p className="mt-2 text-lg">"{quote.text}"</p>
            <p className="mt-1 text-sm text-slate-500">— {quote.author}</p>
         </div>
      </div>
   );
}
