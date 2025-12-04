"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FiEye, FiEyeOff } from "react-icons/fi";

export default function ResetPasswordPage() {
   const router = useRouter();

   const [password, setPassword] = useState("");
   const [confirmPassword, setConfirmPassword] = useState("");
   const [showPassword, setShowPassword] = useState(false);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);

   async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setMessage(null);

      if (password !== confirmPassword) {
         setError("Passwords do not match.");
         return;
      }

      if (password.length < 8) {
         setError("Password must be at least 8 characters.");
         return;
      }

      setLoading(true);

      try {
         const { error } = await supabase.auth.updateUser({
            password,
         });

         if (error) {
            setError(error.message);
            return;
         }

         setMessage("Password updated. You can now log in.");
         setTimeout(() => router.push("/login"), 1500);
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
               Set a new password
            </h1>
            <p className="text-sm text-slate-400 text-center">
               Enter your new password below.
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
                  <label className="block text-sm mb-1">New password</label>
                  <div className="relative">
                     <input
                        type={showPassword ? "text" : "password"}
                        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 pr-16 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                     />

                     <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                        <span>{showPassword ? "Hide" : "Show"}</span>
                        {showPassword ? (
                           <FiEyeOff className="w-4 h-4" />
                        ) : (
                           <FiEye className="w-4 h-4" />
                        )}
                     </button>
                  </div>
               </div>

               <div>
                  <label className="block text-sm mb-1">
                     Confirm new password
                  </label>
                  <input
                     type={showPassword ? "text" : "password"}
                     className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                     value={confirmPassword}
                     onChange={(e) => setConfirmPassword(e.target.value)}
                     required
                  />
               </div>

               <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold">
                  {loading ? "Updating password…" : "Save new password"}
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
