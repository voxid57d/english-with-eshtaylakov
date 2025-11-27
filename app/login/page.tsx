"use client";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
   const handleLogIn = async () => {
      const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;

      await supabase.auth.signInWithOAuth({
         provider: "google",
         options: {
            redirectTo,
         },
      });
   };

   return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
         <section className="max-w-xl text-center space-y-6">
            <h1 className="text-4xl">Welcome back</h1>
            <button
               onClick={handleLogIn}
               className="px-6 py-3 rounded-full text-slate-100 bg-emerald-500 hover:bg-emerald-600 font-medium transition duration-200 ease-in-out shadow-lg">
               Continue with Google
            </button>
         </section>
      </main>
   );
}
