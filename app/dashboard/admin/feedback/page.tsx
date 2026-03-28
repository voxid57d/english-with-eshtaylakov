"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AdminSectionNav from "@/components/AdminSectionNav";

type FeedbackEntry = {
   id: string;
   userId: string;
   username: string | null;
   message: string;
   status: "new" | "reviewed";
   reviewedAt: string | null;
   createdAt: string;
};

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function formatDate(value: string | null) {
   if (!value) return "Not reviewed yet";

   return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
   }).format(new Date(value));
}

export default function AdminFeedbackPage() {
   const router = useRouter();
   const [feedback, setFeedback] = useState<FeedbackEntry[]>([]);
   const [loading, setLoading] = useState(true);
   const [savingId, setSavingId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch("/api/admin/feedback", {
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

               throw new Error(payload.error || "Failed to load feedback.");
            }

            setFeedback((payload.feedback || []) as FeedbackEntry[]);
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load feedback."
            );
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [router]);

   const stats = useMemo(() => {
      const newCount = feedback.filter((item) => item.status === "new").length;
      return {
         total: feedback.length,
         newCount,
         reviewedCount: feedback.length - newCount,
      };
   }, [feedback]);

   const handleStatusChange = async (
      feedbackId: string,
      status: "new" | "reviewed"
   ) => {
      try {
         setSavingId(feedbackId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/feedback/${feedbackId}`, {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
         });
         const payload = await response.json();

         if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
               router.replace("/dashboard");
               return;
            }

            throw new Error(payload.error || "Failed to update feedback.");
         }

         setFeedback((current) =>
            current.map((entry) =>
               entry.id === feedbackId
                  ? {
                       ...entry,
                       status,
                       reviewedAt:
                          status === "reviewed" ? new Date().toISOString() : null,
                    }
                  : entry
            )
         );
         setSuccess(
            status === "reviewed"
               ? "Feedback marked as reviewed."
               : "Feedback moved back to new."
         );
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update feedback."
         );
      } finally {
         setSavingId(null);
      }
   };

   return (
      <div className="space-y-6">
         <div className="space-y-4">
            <AdminSectionNav />

            <div className="flex flex-wrap items-center justify-between gap-3">
               <div>
                  <h1 className="text-3xl font-semibold">Feedback inbox</h1>
                  <p className="mt-2 text-sm text-slate-400">
                     Read messages sent from the dashboard sidebar and keep track of what has been reviewed.
                  </p>
               </div>

               <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full border border-slate-700 px-4 py-2 text-slate-300">
                     {stats.total} total
                  </span>
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-amber-100">
                     {stats.newCount} new
                  </span>
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-emerald-200">
                     {stats.reviewedCount} reviewed
                  </span>
               </div>
            </div>
         </div>

         {error && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </p>
         )}

         {success && (
            <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
               {success}
            </p>
         )}

         {loading ? (
            <p className="text-sm text-slate-400">Loading feedback...</p>
         ) : feedback.length === 0 ? (
            <p className="rounded-3xl border border-slate-800 bg-slate-900/60 px-5 py-4 text-sm text-slate-500">
               No feedback has been submitted yet.
            </p>
         ) : (
            <div className="space-y-4">
               {feedback.map((entry) => (
                  <section
                     key={entry.id}
                     className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                     <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                           <div className="flex flex-wrap items-center gap-2">
                              <span
                                 className={[
                                    "rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]",
                                    entry.status === "new"
                                       ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                                       : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
                                 ].join(" ")}>
                                 {entry.status}
                              </span>
                              <span className="text-xs text-slate-500">
                                 Sent {formatDate(entry.createdAt)}
                              </span>
                           </div>

                           <h2 className="mt-3 text-lg font-semibold text-slate-100">
                              {entry.username || "Unknown user"}
                           </h2>
                           <p className="mt-1 break-all text-xs text-slate-500">
                              User ID: {entry.userId}
                           </p>
                        </div>

                        <button
                           type="button"
                           onClick={() =>
                              void handleStatusChange(
                                 entry.id,
                                 entry.status === "new" ? "reviewed" : "new"
                              )
                           }
                           disabled={savingId === entry.id}
                           className={[
                              "rounded-full px-4 py-2 text-sm transition disabled:opacity-60",
                              entry.status === "new"
                                 ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
                                 : "border border-slate-700 text-slate-300 hover:bg-slate-900",
                           ].join(" ")}>
                           {savingId === entry.id
                              ? "Saving..."
                              : entry.status === "new"
                                ? "Mark reviewed"
                                : "Mark as new"}
                        </button>
                     </div>

                     <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                           Message
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                           {entry.message}
                        </p>
                     </div>

                     <p className="mt-4 text-xs text-slate-500">
                        Reviewed: {formatDate(entry.reviewedAt)}
                     </p>
                  </section>
               ))}
            </div>
         )}
      </div>
   );
}
