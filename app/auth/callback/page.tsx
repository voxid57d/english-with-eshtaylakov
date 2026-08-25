"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallbackPage() {
   const router = useRouter();
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      let isActive = true;

      async function finishSignIn() {
         try {
            const url = new URL(window.location.href);
            const code = url.searchParams.get("code");

            if (code) {
               const { error: exchangeError } =
                  await supabase.auth.exchangeCodeForSession(code);

               if (exchangeError) {
                  throw exchangeError;
               }
            } else {
               const { data, error: sessionError } = await supabase.auth.getSession();

               if (sessionError) {
                  throw sessionError;
               }

               if (!data.session) {
                  throw new Error("No Google session was returned.");
               }
            }

            if (isActive) {
               router.replace("/dashboard");
            }
         } catch (callbackError) {
            console.error(callbackError);
            if (isActive) {
               setError("Google sign-in could not be completed. Please try again.");
            }
         }
      }

      void finishSignIn();

      return () => {
         isActive = false;
      };
   }, [router]);

   return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
         <section className="flex w-full max-w-sm flex-col items-center gap-5 rounded-lg border border-slate-800 bg-slate-900 p-8 text-center">
            <BrandLogo className="justify-center" />
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            <p className="text-sm text-slate-400">Completing Google sign-in...</p>
            {error && (
               <div className="w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                  <button
                     type="button"
                     onClick={() => router.replace("/login")}
                     className="mt-3 block w-full rounded-lg border border-red-400/30 px-3 py-2 font-semibold text-red-100 transition hover:bg-red-500/10">
                     Back to login
                  </button>
               </div>
            )}
         </section>
      </main>
   );
}
