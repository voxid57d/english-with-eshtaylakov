"use client";

import { useState } from "react";
import Link from "next/link";
import { FcGoogle } from "react-icons/fc";
import { supabase } from "@/lib/supabaseClient";
import BrandLogo from "@/components/BrandLogo";
import PageShellWithFooter from "@/components/PageShellWithFooter";

export default function Login() {
   const [loadingGoogle, setLoadingGoogle] = useState(false);
   const [error, setError] = useState<string | null>(null);

   const handleGoogleLogin = async () => {
      try {
         setError(null);
         setLoadingGoogle(true);

         const siteUrl =
            process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;

         const { error: signInError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
               redirectTo: `${siteUrl}/auth/callback`,
            },
         });

         if (signInError) {
            throw signInError;
         }
      } catch (requestError) {
         console.error(requestError);
         setError("Google login failed. Please try again.");
         setLoadingGoogle(false);
      }
   };

   return (
      <PageShellWithFooter>
         <main className="flex w-full items-center justify-center px-4 py-10">
            <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
               <BrandLogo className="justify-center" />

               <div className="mt-8 text-center">
                  <h1 className="text-3xl font-semibold text-white">Staff login</h1>
               </div>

               <div className="mt-8">
                  <button
                     type="button"
                     onClick={handleGoogleLogin}
                     disabled={loadingGoogle}
                     className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:border-emerald-500/40 hover:bg-slate-900 disabled:opacity-60">
                     <FcGoogle size={22} />
                     {loadingGoogle ? "Redirecting..." : "Continue with Google"}
                  </button>
               </div>

               {error && (
                  <p className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-sm text-red-200">
                     {error}
                  </p>
               )}

               <p className="mt-6 text-center text-xs text-slate-500">
                  <Link
                     href="/"
                     className="transition hover:text-emerald-300 hover:underline">
                     Back to home
                  </Link>
               </p>
            </section>
         </main>
      </PageShellWithFooter>
   );
}
