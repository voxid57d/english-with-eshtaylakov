"use client";

import type { User } from "@supabase/supabase-js";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PiArrowRightLight, PiBriefcaseLight, PiChartLineUpLight, PiTargetLight } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import BrandLogo from "@/components/BrandLogo";
import PageShellWithFooter from "@/components/PageShellWithFooter";

const highlights = [
   { label: "Tasks", icon: PiBriefcaseLight },
   { label: "KPI", icon: PiTargetLight },
   { label: "Metrics", icon: PiChartLineUpLight },
];

export default function HomePage() {
   const [user, setUser] = useState<User | null>(null);
   const [checkingAuth, setCheckingAuth] = useState(true);
   const router = useRouter();

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         const { data } = await supabase.auth.getUser();
         if (cancelled) return;
         setUser(data.user);
         setCheckingAuth(false);
      };
      void load();

      const {
         data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
         if (cancelled) return;
         setUser(session?.user ?? null);
         setCheckingAuth(false);
      });

      return () => {
         cancelled = true;
         subscription.unsubscribe();
      };
   }, []);

   useEffect(() => {
      if (!checkingAuth && user) {
         router.replace("/dashboard");
      }
   }, [checkingAuth, router, user]);

   if (checkingAuth || user) {
      return (
         <main className="flex min-h-screen items-center justify-center bg-slate-950">
            <div className="flex flex-col items-center gap-4">
               <BrandLogo className="animate-pulse" />
               <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            </div>
         </main>
      );
   }

   return (
      <PageShellWithFooter>
         <main className="flex w-full items-center px-4 py-12">
            <section className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
               <div className="space-y-6">
                  <BrandLogo />

                  <div>
                     <p className="text-sm font-medium uppercase tracking-[0.22em] text-emerald-300">
                        Internal administration
                     </p>
                  </div>

                  <Link
                     href="/login"
                     className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                     Staff login
                     <PiArrowRightLight size={18} />
                  </Link>
               </div>

               <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {highlights.map((item) => {
                     const Icon = item.icon;

                     return (
                        <div key={item.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
                           <div className="flex items-center gap-3">
                              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-200">
                                 <Icon size={23} />
                              </span>
                              <div>
                                 <p className="font-semibold text-white">{item.label}</p>
                              </div>
                           </div>
                        </div>
                     );
                  })}
               </div>
            </section>
         </main>
      </PageShellWithFooter>
   );
}
