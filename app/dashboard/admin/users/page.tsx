"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminSectionNav from "@/components/AdminSectionNav";
import { supabase } from "@/lib/supabaseClient";

type AdminUser = {
   id: string;
   email: string | null;
   username: string | null;
   isPremium: boolean;
   createdAt: string | null;
   lastSignInAt: string | null;
};

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function formatDate(value: string | null) {
   if (!value) return "Unknown";

   return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
   }).format(new Date(value));
}

export default function AdminUsersPage() {
   const router = useRouter();
   const [users, setUsers] = useState<AdminUser[]>([]);
   const [loading, setLoading] = useState(true);
   const [userSearch, setUserSearch] = useState("");
   const [userSavingId, setUserSavingId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch("/api/admin/users", {
               headers: {
                  Authorization: `Bearer ${token}`,
               },
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               if (response.status === 401 || response.status === 403) {
                  router.replace("/dashboard");
                  return;
               }

               throw new Error(payload.error || "Failed to load admin users.");
            }

            setUsers((payload.users || []) as AdminUser[]);
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load admin users."
            );
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [router]);

   const filteredUsers = useMemo(() => {
      const query = userSearch.trim().toLowerCase();
      if (!query) {
         return users;
      }

      return users.filter((user) =>
         [user.email, user.username, user.id].some((value) =>
            value?.toLowerCase().includes(query)
         )
      );
   }, [userSearch, users]);

   const premiumCount = useMemo(
      () => users.filter((user) => user.isPremium).length,
      [users]
   );

   const handleTogglePremium = async (user: AdminUser) => {
      try {
         setUserSavingId(user.id);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch("/api/admin/users", {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               userId: user.id,
               isPremium: !user.isPremium,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update premium status.");
         }

         const updatedUser = payload.user as {
            id: string;
            username: string | null;
            isPremium: boolean;
         };

         setUsers((current) =>
            current.map((entry) =>
               entry.id === updatedUser.id
                  ? {
                       ...entry,
                       username: updatedUser.username,
                       isPremium: updatedUser.isPremium,
                    }
                  : entry
            )
         );
         setSuccess(
            updatedUser.isPremium
               ? "User is now premium."
               : "Premium access removed."
         );
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update premium status."
         );
      } finally {
         setUserSavingId(null);
      }
   };

   return (
      <div className="space-y-6">
         <div className="space-y-4">
            <AdminSectionNav />

            <div className="flex flex-wrap items-center justify-between gap-3">
               <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                     Admin
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold">Users admin</h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-400">
                     Search users by email, username, or ID and manage premium access in one dedicated place.
                  </p>
               </div>

               <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full border border-slate-700 px-4 py-2 text-slate-300">
                     {users.length} total users
                  </span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-100">
                     {premiumCount} premium
                  </span>
               </div>
            </div>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         {success && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
               {success}
            </div>
         )}

         {loading ? (
            <p className="text-sm text-slate-400">Loading users...</p>
         ) : (
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
               <div className="mb-4 space-y-1">
                  <h2 className="text-xl font-semibold">Users</h2>
                  <p className="text-sm text-slate-400">
                     Toggle premium without leaving the user management section.
                  </p>
               </div>

               <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Search users"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
               />

               <div className="mt-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                     {filteredUsers.length} user{filteredUsers.length === 1 ? "" : "s"}
                  </p>

                  {filteredUsers.length === 0 ? (
                     <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-500">
                        No users matched your search.
                     </p>
                  ) : (
                     <div className="max-h-[42rem] space-y-3 overflow-y-auto pr-1">
                        {filteredUsers.map((user) => (
                           <div
                              key={user.id}
                              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                              <div className="flex items-start justify-between gap-3">
                                 <div className="min-w-0">
                                    <p className="truncate font-semibold text-slate-100">
                                       {user.email || "No email"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-400">
                                       Username: {user.username || "Not set"}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                       Premium: {user.isPremium ? "Yes" : "No"}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                       Created: {formatDate(user.createdAt)}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-500">
                                       Last sign in: {formatDate(user.lastSignInAt)}
                                    </p>
                                    <p className="mt-1 break-all text-[11px] text-slate-600">
                                       ID: {user.id}
                                    </p>
                                 </div>
                                 <button
                                    type="button"
                                    onClick={() => void handleTogglePremium(user)}
                                    disabled={userSavingId === user.id}
                                    className={`rounded-full px-4 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                       user.isPremium
                                          ? "border border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                                          : "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                                    }`}>
                                    {userSavingId === user.id
                                       ? "Saving..."
                                       : user.isPremium
                                         ? "Remove premium"
                                         : "Make premium"}
                                 </button>
                              </div>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            </section>
         )}
      </div>
   );
}
