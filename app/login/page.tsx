"use client";

import { useState } from "react";
import Image from "next/image";
import { FcGoogle } from "react-icons/fc";
import { FiEye, FiEyeOff } from "react-icons/fi";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import PageShellWithFooter from "@/components/PageShellWithFooter";

export default function Login() {
   const router = useRouter();

   const [email, setEmail] = useState("");
   const [password, setPassword] = useState("");
   const [loadingEmail, setLoadingEmail] = useState(false);
   const [loadingGoogle, setLoadingGoogle] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [showPassword, setShowPassword] = useState(false);

   // EMAIL + PASSWORD LOGIN ------------------------------
   const handleEmailLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoadingEmail(true);

      try {
         const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
         });

         if (signInError) {
            setError(signInError.message);
            return;
         }

         router.push("/dashboard");
      } catch (err) {
         console.error(err);
         setError("Something went wrong. Try again.");
      } finally {
         setLoadingEmail(false);
      }
   };

   // GOOGLE LOGIN ----------------------------------------
   const handleGoogleLogin = async () => {
      try {
         setError(null);
         setLoadingGoogle(true);

         const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;

         await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
               redirectTo,
            },
         });
      } catch (err) {
         console.error(err);
         setError("Google login failed.");
         setLoadingGoogle(false);
      }
   };

   return (
      <PageShellWithFooter>
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
            <div className="w-full max-w-md space-y-8 p-8 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
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

               {/* TITLE */}
               <h1 className="text-3xl font-semibold text-center">
                  Welcome back!
               </h1>

               {/* ERROR MESSAGE */}
               {error && (
                  <p className="text-sm text-red-400 text-center bg-red-950/30 border border-red-900/50 rounded-lg py-2 px-3">
                     {error}
                  </p>
               )}

               {/* EMAIL LOGIN FORM */}
               <form onSubmit={handleEmailLogin} className="space-y-4">
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
                     <label className="block text-sm mb-1">Password</label>

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
                           className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
                           <span>{showPassword ? "Hide" : "Show"}</span>
                           {showPassword ? (
                              <FiEyeOff className="w-4 h-4" />
                           ) : (
                              <FiEye className="w-4 h-4" />
                           )}
                        </button>
                     </div>
                     {/* Forgot password link */}
                     <div className="flex justify-end">
                        <button
                           type="button"
                           onClick={() => router.push("/forgot-password")}
                           className="cursor-pointer text-xs text-emerald-400 hover:text-emerald-300 hover:underline">
                           Forgot your password?
                        </button>
                     </div>
                  </div>

                  <button
                     type="submit"
                     disabled={loadingEmail}
                     className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed px-3 py-2 text-sm font-semibold">
                     {loadingEmail ? "Logging in…" : "Log in"}
                  </button>
               </form>

               {/* DIVIDER */}
               <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-700"></div>
                  <span className="text-xs text-slate-400">OR</span>
                  <div className="flex-1 h-px bg-slate-700"></div>
               </div>

               {/* GOOGLE BUTTON (your original style) */}
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

               {/* SIGNUP LINK */}
               <p className="text-xs text-center text-slate-400">
                  Don't have an account?{" "}
                  <a
                     href="/signup"
                     className="text-emerald-400 hover:underline hover:text-emerald-300">
                     Sign up
                  </a>
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
