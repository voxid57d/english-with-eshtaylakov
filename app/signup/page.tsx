"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";
import PageShellWithFooter from "@/components/PageShellWithFooter";
import TelegramLoginButton from "@/components/TelegramLoginButton";

export default function SignupPage() {
   const router = useRouter();

   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);
   const [showPassword, setShowPassword] = useState(false);
   const [loadingGoogle, setLoadingGoogle] = useState(false);

   // NEW: toggle legacy signup methods
   const [showOtherSignup, setShowOtherSignup] = useState(false);

   // GOOGLE LOGIN ----------------------------------------
   const handleGoogleLogin = async () => {
      try {
         setError(null);
         setLoadingGoogle(true);

         const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;

         await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo },
         });
      } catch (err) {
         console.error(err);
         setError("Google login failed.");
         setLoadingGoogle(false);
      }
   };

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
               // keep your existing behavior
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
      <PageShellWithFooter>
         <main className="w-full flex items-center justify-center px-4 py-10">
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

               {/* TELEGRAM FIRST */}
               <div className="space-y-3">
                  <div className="flex justify-center">
                     <TelegramLoginButton />
                  </div>

                  <p className="text-[11px] text-center text-slate-400 leading-snug">
                     Create an account instantly with Telegram.{" "}
                     <span className="text-slate-500">
                        Different signup methods create separate accounts.
                     </span>
                  </p>

                  <div className="flex justify-center">
                     <button
                        type="button"
                        onClick={() => setShowOtherSignup((v) => !v)}
                        className="cursor-pointer text-xs text-emerald-400 hover:text-emerald-300 hover:underline">
                        Don’t have Telegram?
                     </button>
                  </div>
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

               {/* LEGACY SIGNUP METHODS (HIDDEN) */}
               {showOtherSignup && (
                  <>
                     <form onSubmit={handleSignup} className="space-y-4">
                        <div>
                           <label className="block text-sm mb-1">Email</label>
                           <input
                              type="email"
                              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required
                           />
                        </div>

                        <div>
                           <label className="block text-sm mb-1">
                              Password
                           </label>
                           <p className="text-xs text-slate-400 mb-1">
                              At least 8 characters. Use letters and numbers for
                              a stronger password.
                           </p>

                           <div className="relative">
                              <input
                                 type={showPassword ? "text" : "password"}
                                 className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                 value={password}
                                 onChange={(e) => setPassword(e.target.value)}
                                 minLength={8}
                                 required
                              />

                              <button
                                 type="button"
                                 onClick={() =>
                                    setShowPassword((prev) => !prev)
                                 }
                                 className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                                 <span>{showPassword ? "Hide" : "Show"}</span>
                                 {showPassword ? (
                                    <FiEyeOff className="w-4 h-4" />
                                 ) : (
                                    <FiEye className="w-4 h-4" />
                                 )}
                              </button>
                           </div>
                        </div>

                        <button
                           type="submit"
                           disabled={loading}
                           className="cursor-pointer w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition px-3 py-2 text-sm font-semibold">
                           {loading ? "Creating account…" : "Sign up"}
                        </button>
                     </form>

                     {/* DIVIDER */}
                     <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-slate-700"></div>
                        <span className="text-xs text-slate-400">OR</span>
                        <div className="flex-1 h-px bg-slate-700"></div>
                     </div>

                     {/* GOOGLE BUTTON */}
                     <div className="flex justify-center">
                        <button
                           onClick={handleGoogleLogin}
                           disabled={loadingGoogle}
                           className="flex items-center justify-center gap-3 px-6 py-3 rounded-full text-slate-100 bg-emerald-500 hover:bg-emerald-600 font-medium transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                           {loadingGoogle ? (
                              "Redirecting…"
                           ) : (
                              <>
                                 Continue with Google <FcGoogle size={22} />
                              </>
                           )}
                        </button>
                     </div>
                  </>
               )}

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
      </PageShellWithFooter>
   );
}
