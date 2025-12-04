"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

export default function ForgotPasswordPage() {
   const [email, setEmail] = useState("");
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);

   async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setMessage(null);
      setLoading(true);

      try {
         const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`;

         const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo,
         });

         if (error) {
            setError(error.message);
            return;
         }

         setMessage("Check your email for a link to reset your password.");
      } catch (err) {
         console.error(err);
         setError("Something went wrong. Please try again.");
      } finally {
         setLoading(false);
      }
   }

   return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
         <div className="w-full max-w-md space-y-6 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            {/* Logo */}
            <div className="flex justify-center">
               <Image
                  src="/logo-text-white.png"
                  width={140}
                  height={40}
                  alt="TalkTime Logo"
                  className="opacity-90"
               />
            </div>

            <h1 className="text-2xl font-semibold text-center">
               Forgot your password?
            </h1>
            <p className="text-sm text-slate-400 text-center">
               Enter the email you used for TalkTime and we&apos;ll send you a
               reset link.
            </p>

            {error && (
               <p className="text-sm text-red-400 text-center bg-red-950/30 border border-red-900/50 rounded-lg py-2 px-3">
                  {error}
               </p>
            )}

            {message && (
               <p className="text-sm text-emerald-400 text-center bg-emerald-950/30 border border-emerald-900/50 rounded-lg py-2 px-3">
                  {message}
               </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
               <div>
                  <label className="block text-sm mb-1">Email</label>
                  <input
                     type="email"
                     className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="yourname@gmail.com"
                     required
                  />
               </div>

               <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold">
                  {loading ? "Sending link…" : "Send reset link"}
               </button>
            </form>

            <p className="text-xs text-center text-slate-500 mt-2">
               <a
                  href="/login"
                  className="hover:text-emerald-400 hover:underline transition">
                  ← Back to login
               </a>
            </p>
         </div>
      </main>
   );
}
