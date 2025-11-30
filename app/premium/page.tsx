"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";

export default function PremiumPage() {
   const router = useRouter();
   const [user, setUser] = useState<any>(null);
   const [isPremium, setIsPremium] = useState(false);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      async function load() {
         const { data } = await supabase.auth.getUser();

         if (!data.user) {
            router.push("/login");
            return;
         }

         setUser(data.user);

         const premium = await getPremiumStatus(data.user.id);
         setIsPremium(premium);
         setLoading(false);
      }

      load();
   }, []);

   if (loading) {
      return (
         <main className="min-h-screen flex items-center justify-center text-white">
            Checking premium status…
         </main>
      );
   }

   if (isPremium) {
      return (
         <main className="min-h-screen flex flex-col items-center justify-center text-white">
            <h1 className="text-3xl mb-4">
               You are already a premium member 🎉
            </h1>
            <button
               onClick={() => router.push("/dashboard")}
               className="px-6 py-3 rounded-full bg-emerald-500 text-black">
               Go to dashboard
            </button>
         </main>
      );
   }

   const telegramLink = process.env.NEXT_PUBLIC_TELEGRAM_PAYMENT_URL;

   return (
      <main className="min-h-screen flex flex-col items-center justify-center text-white space-y-6">
         <h1 className="text-3xl font-bold">Upgrade to Premium</h1>

         <p className="text-slate-300 max-w-md text-center">
            Click the button below to be redirected to Telegram where you can
            make a payment. After payment, your account will be manually
            upgraded.
         </p>

         <a
            href={telegramLink}
            target="_blank"
            className="px-6 py-3 rounded-full bg-emerald-500 text-black">
            Pay in Telegram
         </a>

         <p className="text-slate-400 text-sm">
            After payment, admin will manually activate your premium account.
         </p>
      </main>
   );
}
