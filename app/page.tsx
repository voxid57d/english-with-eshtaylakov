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

   useEffect(() => {
      const load = async () => {
         const { data } = await supabase.auth.getUser();
         setUser(data.user);
      };
      load();

      const interval = setInterval(() => {
         setTypedText((prev) => {
            if (prev.length >= fullText.length) {
               clearInterval(interval);
               return prev;
            }
            return fullText.slice(0, prev.length + 1);
         });
      }, 40);

      return () => clearInterval(interval);
   }, []);

   if (user) {
      return (
         <DashboardLayout>
            <DashboardPage />
         </DashboardLayout>
      );
   }

   return (
      <PageShellWithFooter>
         <main className="min-h-screen bg-slate-950 text-white px-4 flex items-center">
            <section className="max-w-5xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-12">
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
                     {/* Primary button – Sign up / Get started */}
                     <Link
                        href="/signup"
                        className="inline-block rounded-full px-6 py-3 bg-emerald-400 text-slate-900 font-semibold text-sm md:text-base hover:bg-emerald-300 transition">
                        Sign Up
                     </Link>

                     {/* Secondary button – Log in */}
                     <Link
                        href="/login"
                        className="inline-block rounded-full px-6 py-3 border border-emerald-400 text-emerald-300 text-sm md:text-base font-medium hover:bg-emerald-500/10 transition">
                        Log in
                     </Link>
                  </div>
               </div>
            </section>
         </main>
      </PageShellWithFooter>
   );
}
