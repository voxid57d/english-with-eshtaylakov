"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function UsernamePage() {
   const router = useRouter();

   const [userId, setUserId] = useState<string | null>(null);
   const [username, setUsername] = useState("");
   const [initialUsername, setInitialUsername] = useState<string | null>(null);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [message, setMessage] = useState<string | null>(null);

   // 1) Load current user + existing username (if any)
   useEffect(() => {
      async function load() {
         setLoading(true);
         setError(null);

         const { data: authData, error: authError } =
            await supabase.auth.getUser();

         if (authError || !authData.user) {
            // Not logged in → send to login
            router.push("/login");
            return;
         }

         const uid = authData.user.id;
         setUserId(uid);

         // Load current profile
         const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", uid)
            .maybeSingle();

         if (profileError) {
            console.error(profileError);
            setError("Failed to load profile.");
         } else if (profile?.username) {
            setUsername(profile.username);
            setInitialUsername(profile.username);
         }

         setLoading(false);
      }

      load();
   }, [router]);

   // 2) Save / update username
   async function handleSave(e: React.FormEvent<HTMLFormElement>) {
      e.preventDefault();
      if (!userId) return;

      setError(null);
      setMessage(null);

      const trimmed = username.trim();

      if (trimmed.length < 3) {
         setError("Username must be at least 3 characters.");
         return;
      }

      if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
         setError("Only letters, numbers and underscores are allowed.");
         return;
      }

      setSaving(true);

      try {
         const { error: upsertError } = await supabase.from("profiles").upsert(
            {
               id: userId,
               username: trimmed,
            },
            { onConflict: "id" }
         );

         if (upsertError) {
            if (
               upsertError.message &&
               upsertError.message.toLowerCase().includes("unique")
            ) {
               setError("This username is already taken. Try another one.");
            } else {
               setError("Failed to save username.");
            }
            return;
         }

         setInitialUsername(trimmed);
         setMessage("Username saved!");

         // NEW: Redirect after saving
         setTimeout(() => {
            router.push("/dashboard");
         }, 500);
      } catch (err) {
         console.error(err);
         setError("Something went wrong. Please try again.");
      } finally {
         setSaving(false);
      }
   }

   if (loading) {
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <p>Loading profile…</p>
         </main>
      );
   }

   return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white px-4">
         <div className="w-full max-w-md space-y-6 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
            <h1 className="text-2xl font-semibold text-center">
               Choose a username
            </h1>
            <p className="text-sm text-slate-400 text-center">
               This name will be shown on leaderboards and in your profile.
            </p>

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

            <form onSubmit={handleSave} className="space-y-4">
               <div>
                  <label className="block text-sm mb-1">Username</label>
                  <p className="text-xs text-slate-400 mb-1">
                     3–20 characters. Only letters, numbers, and underscores.
                  </p>
                  <input
                     type="text"
                     className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                     value={username}
                     onChange={(e) => setUsername(e.target.value)}
                     maxLength={20}
                     required
                  />
               </div>

               <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed transition px-3 py-2 text-sm font-semibold">
                  {saving
                     ? "Saving…"
                     : initialUsername
                     ? "Update username"
                     : "Save username"}
               </button>
            </form>

            <p className="text-xs text-center text-slate-400">
               You can change this later, but other students will see this name.
            </p>
         </div>
      </main>
   );
}
