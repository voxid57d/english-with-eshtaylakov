"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import BrandLogo from "@/components/BrandLogo";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { supabase } from "@/lib/supabaseClient";

type StaffProfilePayload = {
   user_id: string;
   full_name: string;
   role: string;
   telegram_username: string | null;
   phone: string | null;
};

export default function UsernamePage() {
   const router = useRouter();
   const [fullName, setFullName] = useState("");
   const [telegramUsername, setTelegramUsername] = useState("");
   const [phone, setPhone] = useState("");
   const [role, setRole] = useState("");
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);

   useEffect(() => {
      let isActive = true;

      async function load() {
         setLoading(true);
         setError(null);

         const { data: authData, error: authError } = await supabase.auth.getUser();

         if (authError || !authData.user) {
            router.push("/login");
            return;
         }

         try {
            const token = await getSupabaseAccessToken();
            const response = await fetch("/api/erp/profile", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               throw new Error(payload.error || "Failed to load profile.");
            }

            if (!isActive) return;

            const profile = payload.profile as StaffProfilePayload;
            setFullName(profile.full_name || "");
            setTelegramUsername(profile.telegram_username || "");
            setPhone(profile.phone || "");
            setRole(profile.role || "");
         } catch (profileError) {
            if (!isActive) return;
            setError(
               profileError instanceof Error
                  ? profileError.message
                  : "Failed to load profile.",
            );
         } finally {
            if (isActive) setLoading(false);
         }
      }

      void load();

      return () => {
         isActive = false;
      };
   }, [router]);

   async function handleSave(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      setError(null);
      setMessage(null);

      if (fullName.trim().length < 2) {
         setError("Full name must be at least 2 characters.");
         return;
      }

      setSaving(true);

      try {
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/profile", {
            method: "PATCH",
            headers: {
               Authorization: `Bearer ${token}`,
               "Content-Type": "application/json",
            },
            body: JSON.stringify({
               fullName,
               phone,
               telegramUsername,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update profile.");
         }

         const profile = payload.profile as StaffProfilePayload;
         setFullName(profile.full_name || "");
         setTelegramUsername(profile.telegram_username || "");
         setPhone(profile.phone || "");
         setMessage("Profile updated.");
      } catch (saveError) {
         setError(
            saveError instanceof Error ? saveError.message : "Failed to update profile.",
         );
      } finally {
         setSaving(false);
      }
   }

   if (loading) {
      return (
         <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
            <div className="flex flex-col items-center gap-4">
               <BrandLogo className="animate-pulse" />
               <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400" />
            </div>
         </main>
      );
   }

   return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-white">
         <section className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
            <div className="mb-6 flex justify-center">
               <BrandLogo />
            </div>

            <div className="mb-6">
               <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                  Staff profile
               </p>
               <h1 className="mt-2 text-2xl font-semibold">Your Amir Temur account</h1>
               <p className="mt-2 text-sm leading-6 text-slate-400">
                  Keep your staff contact details current for branch operations.
               </p>
            </div>

            {error && (
               <p className="mb-4 rounded-lg border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">
                  {error}
               </p>
            )}

            {message && (
               <p className="mb-4 rounded-lg border border-emerald-700/60 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
                  {message}
               </p>
            )}

            <form onSubmit={handleSave} className="space-y-4">
               <div>
                  <label className="mb-1 block text-sm text-slate-300">Full name</label>
                  <input
                     type="text"
                     className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                     value={fullName}
                     onChange={(e) => setFullName(e.target.value)}
                     required
                  />
               </div>

               <div>
                  <label className="mb-1 block text-sm text-slate-300">Role</label>
                  <input
                     type="text"
                     className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm capitalize text-slate-400"
                     value={role.replaceAll("_", " ")}
                     readOnly
                  />
               </div>

               <div>
                  <label className="mb-1 block text-sm text-slate-300">Telegram username</label>
                  <input
                     type="text"
                     className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                     value={telegramUsername}
                     onChange={(e) => setTelegramUsername(e.target.value)}
                     placeholder="username"
                  />
               </div>

               <div>
                  <label className="mb-1 block text-sm text-slate-300">Phone</label>
                  <input
                     type="tel"
                     className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30"
                     value={phone}
                     onChange={(e) => setPhone(e.target.value)}
                     placeholder="+998"
                  />
               </div>

               <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? "Saving..." : "Save profile"}
               </button>
            </form>

            <Link
               href="/dashboard"
               className="mt-5 block text-center text-xs text-slate-500 transition hover:text-emerald-300">
               Back to dashboard
            </Link>
         </section>
      </main>
   );
}
