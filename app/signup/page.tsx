"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
   const router = useRouter();

   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);

   async function handleSignup(e: React.FormEvent) {
      e.preventDefault();

      if (password.length < 8) {
         setError("Password must be at least 8 characters long.");
         return;
      }

      setError(null);
      setMessage(null);
      setLoading(true);

      try {
         const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
               emailRedirectTo: `${window.location.origin}/dashboard`,
            },
         });

         if (error) {
            setError(error.message);
            return;
         }

         setMessage(
            "Account created! Check your inbox and confirm your email to finish signup."
         );
         setEmail("");
         setPassword("");
      } catch (err) {
         setError("Something went wrong. Please try again.");
      } finally {
         setLoading(false);
      }
   }

   return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
         <div className="w-full max-w-md space-y-6 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            {/* LOGO */}
            <div className="flex justify-center">
               <Image
                  src="/logo-text-white.png"
                  width={140}
                  height={40}
                  alt="TalkTime Logo"
                  className="opacity-90"
               />
            </div>

            {/* TITLE + SUBTITLE */}
            <div className="space-y-2 text-center">
               <h1 className="text-2xl font-semibold">
                  Create your NEW account
               </h1>
               <p className="text-sm text-slate-400">
                  One account for vocabulary, reading, listening and more.
               </p>
            </div>

            {error && (
               <p className="text-sm text-red-400 text-center bg-red-950/40 border border-red-800/60 rounded-md px-3 py-2">
                  {error}
               </p>
            )}

            {message && (
               <p className="text-sm text-emerald-400 text-center bg-emerald-950/30 border border-emerald-700/60 rounded-md px-3 py-2">
                  {message}
               </p>
            )}

            <form onSubmit={handleSignup} className="space-y-4">
               <div>
                  <label className="block text-sm mb-1">Email</label>
                  <input
                     type="email"
                     className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="you@example.com"
                     required
                  />
               </div>

               <div>
                  <label className="block text-sm mb-1">Password</label>
                  <p className="text-xs text-slate-400 mb-1">
                     At least 8 characters. Use letters and numbers for a
                     stronger password.
                  </p>
                  <input
                     type="password"
                     className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                     value={password}
                     onChange={(e) => setPassword(e.target.value)}
                     minLength={8}
                     required
                  />
               </div>

               <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition px-3 py-2 text-sm font-semibold">
                  {loading ? "Creating account…" : "Sign up"}
               </button>
            </form>

            <p className="text-xs text-center text-slate-400">
               Already have an account?{" "}
               <a
                  href="/login"
                  className="text-emerald-400 hover:text-emerald-300 hover:underline">
                  Log in
               </a>
            </p>

            <p className="text-[11px] text-center text-slate-500 mt-1">
               Tip: don&apos;t reuse passwords from other important accounts.
            </p>

            <p className="text-xs text-center text-slate-500 mt-2">
               <a
                  href="/"
                  className="hover:text-emerald-400 hover:underline transition">
                  ← Back to Home
               </a>
            </p>
         </div>
      </main>
   );
}
