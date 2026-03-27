"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
   PiArrowLeftLight,
   PiNotePencilLight,
   PiSealCheckFill,
} from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import {
   getWritingTaskMeta,
   type WritingTaskNumber,
   type WritingTaskPayload,
} from "@/lib/writing";

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function normalizeTaskNumber(value: string | string[] | undefined): WritingTaskNumber | null {
   const normalized = Array.isArray(value) ? value[0] : value;
   if (normalized === "1") return 1;
   if (normalized === "2") return 2;
   return null;
}

function getStatusLabel(status: WritingTaskPayload["prompts"][number]["submission"] | null) {
   if (!status) return "New";
   if (status.status === "pending_feedback") return "Pending feedback";
   if (status.status === "feedback_ready") return "Feedback ready";
   return "Saved draft";
}

export default function WritingTaskPromptsPage() {
   const params = useParams();
   const router = useRouter();
   const taskNumber = normalizeTaskNumber(params.taskNumber);
   const [loading, setLoading] = useState(true);
   const [prompts, setPrompts] = useState<WritingTaskPayload["prompts"]>([]);
   const [error, setError] = useState<string | null>(null);

   const taskMeta = useMemo(
      () => (taskNumber ? getWritingTaskMeta(taskNumber) : null),
      [taskNumber]
   );

   useEffect(() => {
      if (!taskNumber) {
         router.replace("/dashboard/writing");
         return;
      }

      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch(
               `/api/writing?taskNumber=${encodeURIComponent(String(taskNumber))}`,
               {
                  headers: {
                     Authorization: `Bearer ${token}`,
                  },
                  cache: "no-store",
               }
            );
            const payload = await response.json();

            if (!response.ok) {
               throw new Error(payload.error || "Failed to load writing prompts.");
            }

            const task = (payload.tasks || [])[0] as WritingTaskPayload | undefined;
            setPrompts(task?.prompts || []);
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load writing prompts."
            );
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [router, taskNumber]);

   if (!taskNumber || !taskMeta) {
      return null;
   }

   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
               <Link
                  href="/dashboard/writing"
                  className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200">
                  <PiArrowLeftLight />
                  Back to writing
               </Link>
               <h1 className="mt-3 flex items-center gap-2 text-3xl font-semibold">
                  <PiNotePencilLight className="text-emerald-400" />
                  <span>{taskMeta.title} Prompts</span>
               </h1>
               <p className="mt-2 max-w-2xl text-sm text-slate-400">
                  Pick a prompt card to open the writing workspace.
               </p>
            </div>
         </div>

         {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
               {Array.from({ length: 3 }).map((_, index) => (
                  <div
                     key={index}
                     className="h-56 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60"
                  />
               ))}
            </div>
         ) : error ? (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </p>
         ) : prompts.length === 0 ? (
            <p className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-400">
               No prompts yet for this task. Add them from the admin panel.
            </p>
         ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
               {prompts.map(({ prompt, submission }) => (
                  <Link
                     key={prompt.id}
                     href={`/dashboard/writing/${taskNumber}/${prompt.id}`}
                     className="group overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 transition hover:-translate-y-1 hover:border-emerald-500/40">
                     <div className="bg-[linear-gradient(135deg,rgba(16,185,129,0.16),rgba(15,23,42,0.08),rgba(251,191,36,0.08))] p-6">
                        <div className="flex items-start justify-between gap-3">
                           <div>
                              <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">
                                 {taskMeta.title}
                              </p>
                              <h2 className="mt-2 text-2xl font-semibold text-white">
                                 {prompt.title}
                              </h2>
                           </div>

                           {submission?.status === "feedback_ready" && (
                              <PiSealCheckFill className="text-emerald-300" size={22} />
                           )}
                        </div>
                     </div>

                     <div className="space-y-4 p-6">
                        <p className="line-clamp-4 text-sm leading-6 text-slate-400">
                           {prompt.promptText}
                        </p>
                        <div className="flex items-center justify-between text-sm text-slate-500">
                           <span>{getStatusLabel(submission)}</span>
                           <span className="text-emerald-300 transition group-hover:text-emerald-200">
                              Open prompt
                           </span>
                        </div>
                     </div>
                  </Link>
               ))}
            </div>
         )}
      </div>
   );
}
