"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import DashboardLayout from "./dashboard/layout";
import DashboardPage from "./dashboard/page";
import PageShellWithFooter from "@/components/PageShellWithFooter";

export default function HomePage() {
   const fullText = "Learn English with Eshtaylakov";
   const [typedText, setTypedText] = useState("");
   const [user, setUser] = useState<any>(null);
   const [checkingAuth, setCheckingAuth] = useState(true);

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         const { data } = await supabase.auth.getUser();
         if (cancelled) return;
         setUser(data.user);
         setCheckingAuth(false);
      };
      load();

      const {
         data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
         if (cancelled) return;
         setUser(session?.user ?? null);
         setCheckingAuth(false);
      });

      const interval = setInterval(() => {
         setTypedText((prev) => {
            if (prev.length >= fullText.length) {
               clearInterval(interval);
               return prev;
            }
            return fullText.slice(0, prev.length + 1);
         });
      }, 40);

      return () => {
         cancelled = true;
         subscription.unsubscribe();
         clearInterval(interval);
      };
   }, []);

   if (checkingAuth) {
      return (
         <main className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
               <Image
                  src="/logo-text-white.png"
                  alt="TalkTime logo"
                  width={140}
                  height={46}
                  className="w-auto h-10 opacity-90 animate-pulse"
               />
               <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
            </div>
         </main>
      );
   }

   if (user) {
      return (
         <DashboardLayout>
            <DashboardPage />
         </DashboardLayout>
      );
   }

   return (
      <PageShellWithFooter>
         <div className="w-full flex items-center px-4 py-10">
            <section className="max-w-6xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-12">
               <div className="space-y-6">
                  <Image
                     src="/logo-text-white.png"
                     alt="TalkTime logo"
                     width={200}
                     height={60}
                     className="w-auto h-12"
                  />

                  <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                     {typedText || fullText}
                     <span className="border-r-2 border-emerald-400 ml-1 animate-pulse" />
                  </h1>

                  <p className="text-lg text-slate-300 max-w-md">
                     Personalized exercises, vocabulary practice, and daily
                     progress—all in one place.
                  </p>

                  <div className="mt-8 flex flex-wrap gap-4">
                     <Link
                        href="/login"
                        className="inline-flex items-center gap-2 rounded-full px-7 py-3
      bg-emerald-400 text-slate-900 font-semibold text-sm md:text-base
      hover:bg-emerald-300 transition">
                        Continue
                        <span aria-hidden className="text-lg leading-none">
                           →
                        </span>
                     </Link>
                  </div>
               </div>
            </section>
         </div>
      </PageShellWithFooter>
   );
}
