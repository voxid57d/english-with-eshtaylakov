"use client";

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
   PiImageLight,
   PiPlusBold,
   PiSpinnerGapLight,
   PiTrashLight,
   PiUploadSimpleLight,
} from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { WRITING_TASKS, type WritingTaskNumber } from "@/lib/writing";

type AdminPrompt = {
   id: string;
   task_number: WritingTaskNumber;
   title: string;
   prompt_text: string;
   image_url: string | null;
   sort_order: number | null;
   updated_at: string;
};

type PendingSubmission = {
   id: string;
   userId: string;
   promptId: string;
   taskNumber: WritingTaskNumber;
   answerText: string;
   submittedForFeedbackAt: string | null;
   createdAt: string;
   username: string | null;
};

type PromptDraft = {
   title: string;
   promptText: string;
   imageUrl: string;
   sortOrder: string;
};

type FeedbackDraft = {
   feedbackText: string;
   feedbackImages: string[];
};

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function formatDate(value: string | null) {
   if (!value) return "Just now";

   return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
   }).format(new Date(value));
}

function emptyPromptDraft(title = ""): PromptDraft {
   return {
      title,
      promptText: "",
      imageUrl: "",
      sortOrder: "",
   };
}

export default function AdminWritingPage() {
   const router = useRouter();
   const [loading, setLoading] = useState(true);
   const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
   const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
   const [newPromptDrafts, setNewPromptDrafts] = useState<Record<WritingTaskNumber, PromptDraft>>({
      1: emptyPromptDraft("Test 1"),
      2: emptyPromptDraft("Test 1"),
   });
   const [editingPromptDrafts, setEditingPromptDrafts] = useState<Record<string, PromptDraft>>(
      {}
   );
   const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>({});
   const [creatingTask, setCreatingTask] = useState<WritingTaskNumber | null>(null);
   const [savingPromptId, setSavingPromptId] = useState<string | null>(null);
   const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
   const [uploadingPromptTarget, setUploadingPromptTarget] = useState<string | null>(null);
   const [submittingFeedbackId, setSubmittingFeedbackId] = useState<string | null>(null);
   const [uploadingFeedbackId, setUploadingFeedbackId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);

            const token = await getAccessToken();
            const response = await fetch("/api/admin/writing", {
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

               throw new Error(payload.error || "Failed to load writing admin.");
            }

            const nextPrompts = (payload.prompts || []) as AdminPrompt[];
            setPrompts(nextPrompts);
            setPendingSubmissions(
               (payload.pendingSubmissions || []) as PendingSubmission[]
            );
            setEditingPromptDrafts(
               Object.fromEntries(
                  nextPrompts.map((prompt) => [
                     prompt.id,
                     {
                        title: prompt.title,
                        promptText: prompt.prompt_text,
                        imageUrl: prompt.image_url || "",
                        sortOrder:
                           typeof prompt.sort_order === "number"
                              ? String(prompt.sort_order)
                              : "",
                     },
                  ])
               )
            );
            setNewPromptDrafts({
               1: emptyPromptDraft(
                  `Test ${nextPrompts.filter((item) => item.task_number === 1).length + 1}`
               ),
               2: emptyPromptDraft(
                  `Test ${nextPrompts.filter((item) => item.task_number === 2).length + 1}`
               ),
            });
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load writing admin."
            );
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [router]);

   const promptsByTask = useMemo(() => {
      return {
         1: prompts.filter((prompt) => prompt.task_number === 1),
         2: prompts.filter((prompt) => prompt.task_number === 2),
      } as Record<WritingTaskNumber, AdminPrompt[]>;
   }, [prompts]);

   const pendingCountLabel = useMemo(() => {
      const count = pendingSubmissions.length;
      return `${count} pending submission${count === 1 ? "" : "s"}`;
   }, [pendingSubmissions.length]);

   const uploadImage = async (
      file: File,
      folder: "prompts" | "feedback"
   ): Promise<string> => {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", folder);

      const response = await fetch("/api/admin/writing/upload", {
         method: "POST",
         headers: {
            Authorization: `Bearer ${token}`,
         },
         body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
         throw new Error(payload.error || "Failed to upload image.");
      }

      return payload.url as string;
   };

   const handlePromptUpload = async (
      target: string,
      event: ChangeEvent<HTMLInputElement>,
      onDone: (url: string) => void
   ) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
         setUploadingPromptTarget(target);
         setError(null);
         const url = await uploadImage(file, "prompts");
         onDone(url);
         setSuccess("Prompt image uploaded.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to upload image."
         );
      } finally {
         setUploadingPromptTarget(null);
         event.target.value = "";
      }
   };

   const handleFeedbackUpload = async (
      submissionId: string,
      event: ChangeEvent<HTMLInputElement>
   ) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) {
         return;
      }

      try {
         setUploadingFeedbackId(submissionId);
         setError(null);
         const urls = await Promise.all(files.map((file) => uploadImage(file, "feedback")));

         setFeedbackDrafts((current) => ({
            ...current,
            [submissionId]: {
               feedbackText: current[submissionId]?.feedbackText || "",
               feedbackImages: [
                  ...(current[submissionId]?.feedbackImages || []),
                  ...urls,
               ],
            },
         }));
         setSuccess("Feedback images uploaded.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to upload feedback images."
         );
      } finally {
         setUploadingFeedbackId(null);
         event.target.value = "";
      }
   };

   const handleCreatePrompt = async (
      event: FormEvent,
      taskNumber: WritingTaskNumber
   ) => {
      event.preventDefault();

      try {
         setCreatingTask(taskNumber);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const draft = newPromptDrafts[taskNumber];
         const response = await fetch("/api/admin/writing", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               taskNumber,
               title: draft.title,
               promptText: draft.promptText,
               imageUrl: draft.imageUrl,
               sortOrder: draft.sortOrder ? Number(draft.sortOrder) : undefined,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to create writing prompt.");
         }

         const prompt = payload.prompt as AdminPrompt;
         const nextPrompts = [...prompts, prompt].sort((a, b) => {
            if (a.task_number !== b.task_number) {
               return a.task_number - b.task_number;
            }

            return (a.sort_order || 0) - (b.sort_order || 0);
         });
         setPrompts(nextPrompts);
         setEditingPromptDrafts((current) => ({
            ...current,
            [prompt.id]: {
               title: prompt.title,
               promptText: prompt.prompt_text,
               imageUrl: prompt.image_url || "",
               sortOrder:
                  typeof prompt.sort_order === "number" ? String(prompt.sort_order) : "",
            },
         }));
         const nextCount =
            nextPrompts.filter((item) => item.task_number === taskNumber).length + 1;
         setNewPromptDrafts((current) => ({
            ...current,
            [taskNumber]: emptyPromptDraft(`Test ${nextCount}`),
         }));
         setSuccess(`Created ${prompt.title}.`);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to create writing prompt."
         );
      } finally {
         setCreatingTask(null);
      }
   };

   const handleSavePrompt = async (
      event: FormEvent,
      promptId: string
   ) => {
      event.preventDefault();

      try {
         setSavingPromptId(promptId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const draft = editingPromptDrafts[promptId];
         const response = await fetch(`/api/admin/writing/prompts/${promptId}`, {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               title: draft.title,
               promptText: draft.promptText,
               imageUrl: draft.imageUrl,
               sortOrder: draft.sortOrder ? Number(draft.sortOrder) : 0,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update writing prompt.");
         }

         const prompt = payload.prompt as AdminPrompt;
         setPrompts((current) =>
            current
               .map((item) => (item.id === prompt.id ? prompt : item))
               .sort((a, b) => {
                  if (a.task_number !== b.task_number) {
                     return a.task_number - b.task_number;
                  }

                  return (a.sort_order || 0) - (b.sort_order || 0);
               })
         );
         setSuccess(`Saved ${prompt.title}.`);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update writing prompt."
         );
      } finally {
         setSavingPromptId(null);
      }
   };

   const handleDeletePrompt = async (promptId: string) => {
      const confirmed = window.confirm(
         "Delete this prompt? Any related saved drafts will also be removed."
      );
      if (!confirmed) return;

      try {
         setDeletingPromptId(promptId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/writing/prompts/${promptId}`, {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${token}`,
            },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete writing prompt.");
         }

         setPrompts((current) => current.filter((item) => item.id !== promptId));
         setEditingPromptDrafts((current) => {
            const next = { ...current };
            delete next[promptId];
            return next;
         });
         setSuccess("Prompt deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete writing prompt."
         );
      } finally {
         setDeletingPromptId(null);
      }
   };

   const handleFeedbackSubmit = async (
      event: FormEvent,
      submissionId: string
   ) => {
      event.preventDefault();

      try {
         setSubmittingFeedbackId(submissionId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const draft = feedbackDrafts[submissionId] || {
            feedbackText: "",
            feedbackImages: [],
         };
         const response = await fetch(
            `/api/admin/writing/submissions/${submissionId}`,
            {
               method: "PATCH",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify(draft),
            }
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save feedback.");
         }

         setPendingSubmissions((current) =>
            current.filter((submission) => submission.id !== submissionId)
         );
         setFeedbackDrafts((current) => {
            const next = { ...current };
            delete next[submissionId];
            return next;
         });
         setSuccess("Feedback saved and sent to the student.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save feedback."
         );
      } finally {
         setSubmittingFeedbackId(null);
      }
   };

   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
               <h1 className="text-3xl font-semibold">Writing admin</h1>
               <p className="mt-2 text-sm text-slate-400">
                  Create as many Task 1 and Task 2 prompts as you need, then review
                  the premium submissions waiting for feedback.
               </p>
            </div>

            <div className="flex items-center gap-3">
               <Link
                  href="/dashboard/writing"
                  className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                  View writing page
               </Link>
               <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-100">
                  {pendingCountLabel}
               </span>
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
            <div className="grid gap-4 xl:grid-cols-2">
               {Array.from({ length: 2 }).map((_, index) => (
                  <div
                     key={index}
                     className="h-80 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60"
                  />
               ))}
            </div>
         ) : (
            <>
               <div className="grid gap-6 xl:grid-cols-2">
                  {WRITING_TASKS.map((task) => (
                     <section
                        key={task.taskNumber}
                        className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                        <div className="mb-5">
                           <h2 className="text-xl font-semibold">
                              {task.instructionHeading}
                           </h2>
                           <p className="mt-1 text-sm text-slate-400">
                              {promptsByTask[task.taskNumber].length} prompt
                              {promptsByTask[task.taskNumber].length === 1 ? "" : "s"}
                           </p>
                        </div>

                        <form
                           onSubmit={(event) =>
                              void handleCreatePrompt(event, task.taskNumber)
                           }
                           className="space-y-3 rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                           <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                              <PiPlusBold />
                              <span>Create new prompt</span>
                           </div>

                           <input
                              value={newPromptDrafts[task.taskNumber].title}
                              onChange={(event) =>
                                 setNewPromptDrafts((current) => ({
                                    ...current,
                                    [task.taskNumber]: {
                                       ...current[task.taskNumber],
                                       title: event.target.value,
                                    },
                                 }))
                              }
                              placeholder="Prompt card title"
                              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                           />

                           <textarea
                              value={newPromptDrafts[task.taskNumber].promptText}
                              onChange={(event) =>
                                 setNewPromptDrafts((current) => ({
                                    ...current,
                                    [task.taskNumber]: {
                                       ...current[task.taskNumber],
                                       promptText: event.target.value,
                                    },
                                 }))
                              }
                              rows={6}
                              placeholder="Prompt text"
                              className="w-full resize-y rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                           />

                           <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                              <input
                                 value={newPromptDrafts[task.taskNumber].imageUrl}
                                 onChange={(event) =>
                                    setNewPromptDrafts((current) => ({
                                       ...current,
                                       [task.taskNumber]: {
                                          ...current[task.taskNumber],
                                          imageUrl: event.target.value,
                                       },
                                    }))
                                 }
                                 placeholder="Image URL"
                                 className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                              />

                              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-900">
                                 {uploadingPromptTarget === `new-${task.taskNumber}` ? (
                                    <PiSpinnerGapLight className="animate-spin" />
                                 ) : (
                                    <PiUploadSimpleLight />
                                 )}
                                 Upload
                                 <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(event) =>
                                       void handlePromptUpload(
                                          `new-${task.taskNumber}`,
                                          event,
                                          (url) =>
                                             setNewPromptDrafts((current) => ({
                                                ...current,
                                                [task.taskNumber]: {
                                                   ...current[task.taskNumber],
                                                   imageUrl: url,
                                                },
                                             }))
                                       )
                                    }
                                    className="hidden"
                                 />
                              </label>
                           </div>

                           <input
                              value={newPromptDrafts[task.taskNumber].sortOrder}
                              onChange={(event) =>
                                 setNewPromptDrafts((current) => ({
                                    ...current,
                                    [task.taskNumber]: {
                                       ...current[task.taskNumber],
                                       sortOrder: event.target.value,
                                    },
                                 }))
                              }
                              placeholder="Sort order (optional)"
                              className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                           />

                           <button
                              type="submit"
                              disabled={creatingTask === task.taskNumber}
                              className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                              {creatingTask === task.taskNumber
                                 ? "Creating..."
                                 : "Create prompt"}
                           </button>
                        </form>

                        <div className="mt-5 space-y-4">
                           {promptsByTask[task.taskNumber].length === 0 ? (
                              <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-500">
                                 No prompts yet for this task.
                              </p>
                           ) : (
                              promptsByTask[task.taskNumber].map((prompt) => {
                                 const draft = editingPromptDrafts[prompt.id];
                                 if (!draft) return null;

                                 return (
                                    <form
                                       key={prompt.id}
                                       onSubmit={(event) =>
                                          void handleSavePrompt(event, prompt.id)
                                       }
                                       className="space-y-3 rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
                                       <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div>
                                             <p className="font-semibold text-slate-100">
                                                {prompt.title}
                                             </p>
                                             <p className="text-xs text-slate-500">
                                                Updated {formatDate(prompt.updated_at)}
                                             </p>
                                          </div>

                                          <button
                                             type="button"
                                             onClick={() => void handleDeletePrompt(prompt.id)}
                                             disabled={deletingPromptId === prompt.id}
                                             className="inline-flex items-center gap-2 rounded-full border border-red-500/40 px-4 py-2 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-60">
                                             <PiTrashLight />
                                             {deletingPromptId === prompt.id
                                                ? "Deleting..."
                                                : "Delete"}
                                          </button>
                                       </div>

                                       <input
                                          value={draft.title}
                                          onChange={(event) =>
                                             setEditingPromptDrafts((current) => ({
                                                ...current,
                                                [prompt.id]: {
                                                   ...current[prompt.id],
                                                   title: event.target.value,
                                                },
                                             }))
                                          }
                                          placeholder="Prompt card title"
                                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                       />

                                       <textarea
                                          value={draft.promptText}
                                          onChange={(event) =>
                                             setEditingPromptDrafts((current) => ({
                                                ...current,
                                                [prompt.id]: {
                                                   ...current[prompt.id],
                                                   promptText: event.target.value,
                                                },
                                             }))
                                          }
                                          rows={6}
                                          placeholder="Prompt text"
                                          className="w-full resize-y rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                       />

                                       <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                          <input
                                             value={draft.imageUrl}
                                             onChange={(event) =>
                                                setEditingPromptDrafts((current) => ({
                                                   ...current,
                                                   [prompt.id]: {
                                                      ...current[prompt.id],
                                                      imageUrl: event.target.value,
                                                   },
                                                }))
                                             }
                                             placeholder="Image URL"
                                             className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                          />

                                          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-200 transition hover:bg-slate-900">
                                             {uploadingPromptTarget === prompt.id ? (
                                                <PiSpinnerGapLight className="animate-spin" />
                                             ) : (
                                                <PiUploadSimpleLight />
                                             )}
                                             Upload
                                             <input
                                                type="file"
                                                accept="image/*"
                                                onChange={(event) =>
                                                   void handlePromptUpload(
                                                      prompt.id,
                                                      event,
                                                      (url) =>
                                                         setEditingPromptDrafts((current) => ({
                                                            ...current,
                                                            [prompt.id]: {
                                                               ...current[prompt.id],
                                                               imageUrl: url,
                                                            },
                                                         }))
                                                   )
                                                }
                                                className="hidden"
                                             />
                                          </label>
                                       </div>

                                       <input
                                          value={draft.sortOrder}
                                          onChange={(event) =>
                                             setEditingPromptDrafts((current) => ({
                                                ...current,
                                                [prompt.id]: {
                                                   ...current[prompt.id],
                                                   sortOrder: event.target.value,
                                                },
                                             }))
                                          }
                                          placeholder="Sort order"
                                          className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                       />

                                       {draft.imageUrl && (
                                          <Image
                                             src={draft.imageUrl}
                                             alt={`${draft.title} preview`}
                                             width={1400}
                                             height={900}
                                             className="h-56 w-full rounded-2xl border border-slate-800 object-cover"
                                             unoptimized
                                          />
                                       )}

                                       <button
                                          type="submit"
                                          disabled={savingPromptId === prompt.id}
                                          className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                                          {savingPromptId === prompt.id
                                             ? "Saving..."
                                             : "Save prompt"}
                                       </button>
                                    </form>
                                 );
                              })
                           )}
                        </div>
                     </section>
                  ))}
               </div>

               <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                  <div className="mb-5 flex items-center justify-between gap-4">
                     <div>
                        <h2 className="text-xl font-semibold">
                           Pending for feedback
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                           Review premium submissions and send back text notes plus
                           image-based guidance.
                        </p>
                     </div>
                  </div>

                  {pendingSubmissions.length === 0 ? (
                     <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4 text-sm text-slate-500">
                        No writing submissions are waiting for feedback right now.
                     </p>
                  ) : (
                     <div className="space-y-5">
                        {pendingSubmissions.map((submission) => {
                           const prompt = prompts.find((item) => item.id === submission.promptId);
                           const draft = feedbackDrafts[submission.id] || {
                              feedbackText: "",
                              feedbackImages: [],
                           };

                           return (
                              <div
                                 key={submission.id}
                                 className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                                 <div className="flex flex-wrap items-start justify-between gap-4">
                                    <div>
                                       <p className="text-xs uppercase tracking-[0.2em] text-amber-300">
                                          Writing Task {submission.taskNumber}
                                       </p>
                                       <h3 className="mt-2 text-lg font-semibold text-slate-100">
                                          {submission.username || "Unknown user"} •{" "}
                                          {prompt?.title || "Prompt"}
                                       </h3>
                                       <p className="mt-1 text-sm text-slate-400">
                                          Submitted {formatDate(submission.submittedForFeedbackAt)}
                                       </p>
                                    </div>

                                    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                                       {
                                          submission.answerText
                                             .trim()
                                             .split(/\s+/)
                                             .filter(Boolean).length
                                       }{" "}
                                       words
                                    </span>
                                 </div>

                                 {prompt?.prompt_text && (
                                    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                                       <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                          Prompt
                                       </p>
                                       <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">
                                          {prompt.prompt_text}
                                       </p>
                                    </div>
                                 )}

                                 <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                       Student answer
                                    </p>
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-slate-100">
                                       {submission.answerText}
                                    </p>
                                 </div>

                                 <form
                                    onSubmit={(event) =>
                                       void handleFeedbackSubmit(event, submission.id)
                                    }
                                    className="mt-5 space-y-4">
                                    <textarea
                                       value={draft.feedbackText}
                                       onChange={(event) =>
                                          setFeedbackDrafts((current) => ({
                                             ...current,
                                             [submission.id]: {
                                                feedbackText: event.target.value,
                                                feedbackImages:
                                                   current[submission.id]?.feedbackImages || [],
                                             },
                                          }))
                                       }
                                       rows={6}
                                       placeholder="Write feedback for the student..."
                                       className="w-full resize-y rounded-3xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />

                                    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4">
                                       <div className="flex flex-wrap items-center justify-between gap-3">
                                          <div className="flex items-center gap-2 text-sm text-slate-300">
                                             <PiImageLight />
                                             <span>Feedback images</span>
                                          </div>

                                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-900">
                                             {uploadingFeedbackId === submission.id ? (
                                                <PiSpinnerGapLight className="animate-spin" />
                                             ) : (
                                                <PiUploadSimpleLight />
                                             )}
                                             Upload
                                             <input
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                onChange={(event) =>
                                                   void handleFeedbackUpload(
                                                      submission.id,
                                                      event
                                                   )
                                                }
                                                className="hidden"
                                             />
                                          </label>
                                       </div>

                                       {draft.feedbackImages.length > 0 && (
                                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                             {draft.feedbackImages.map((imageUrl) => (
                                                <div
                                                   key={imageUrl}
                                                   className="overflow-hidden rounded-2xl border border-slate-800">
                                                   <Image
                                                      src={imageUrl}
                                                      alt="Feedback attachment"
                                                      width={1200}
                                                      height={900}
                                                      className="h-40 w-full object-cover"
                                                      unoptimized
                                                   />
                                                   <button
                                                      type="button"
                                                      onClick={() =>
                                                         setFeedbackDrafts((current) => ({
                                                            ...current,
                                                            [submission.id]: {
                                                               feedbackText:
                                                                  current[submission.id]
                                                                     ?.feedbackText || "",
                                                               feedbackImages: (
                                                                  current[submission.id]
                                                                     ?.feedbackImages || []
                                                               ).filter(
                                                                  (value) => value !== imageUrl
                                                               ),
                                                            },
                                                         }))
                                                      }
                                                      className="w-full border-t border-slate-800 bg-slate-950/80 px-3 py-2 text-xs text-red-300 transition hover:bg-red-500/10">
                                                      Remove
                                                   </button>
                                                </div>
                                             ))}
                                          </div>
                                       )}
                                    </div>

                                    <button
                                       type="submit"
                                       disabled={submittingFeedbackId === submission.id}
                                       className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                                       {submittingFeedbackId === submission.id
                                          ? "Sending..."
                                          : "Send feedback"}
                                    </button>
                                 </form>
                              </div>
                           );
                        })}
                     </div>
                  )}
               </section>
            </>
         )}
      </div>
   );
}
