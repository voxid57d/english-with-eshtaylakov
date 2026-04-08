"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
   PiArrowClockwiseBold,
   PiArrowLeftLight,
   PiClockCountdownLight,
   PiCrownSimpleFill,
   PiFloppyDiskLight,
   PiLampLight,
   PiMoonStarsLight,
   PiSealCheckFill,
   PiSpinnerGapLight,
   PiSunDimLight,
} from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import {
   countWords,
   getWritingTaskMeta,
   WRITING_DISPLAY_MODES,
   type WritingDisplayMode,
   type WritingSubmission,
   type WritingTaskNumber,
} from "@/lib/writing";

type PromptEntry = {
   prompt: {
      id: string;
      taskNumber: WritingTaskNumber;
      title: string;
      promptText: string;
      imageUrl: string | null;
      sortOrder: number;
      updatedAt: string;
   };
   submission: WritingSubmission | null;
};

type ToastState = {
   kind: "success" | "error";
   message: string;
} | null;

const WRITING_MODE_STORAGE_KEY = "writing-display-mode";
const WRITING_AUTOSAVE_INTERVAL_MS = 60_000;

function getDraftStorageKey(promptId: string) {
   return `writing-draft:${promptId}`;
}

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function normalizeTaskNumber(
   value: string | string[] | undefined
): WritingTaskNumber | null {
   const normalized = Array.isArray(value) ? value[0] : value;
   if (normalized === "1") return 1;
   if (normalized === "2") return 2;
   return null;
}

function normalizePromptId(value: string | string[] | undefined) {
   const normalized = Array.isArray(value) ? value[0] : value;
   return normalized || null;
}

function formatTimer(totalSeconds: number) {
   const safeSeconds = Math.max(0, totalSeconds);
   const minutes = Math.floor(safeSeconds / 60)
      .toString()
      .padStart(2, "0");
   const seconds = Math.floor(safeSeconds % 60)
      .toString()
      .padStart(2, "0");

   return `${minutes}:${seconds}`;
}

function formatDate(value: string | null) {
   if (!value) return null;

   return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
   }).format(new Date(value));
}

function getStatusLabel(submission: WritingSubmission | null) {
   if (!submission) return null;
   if (submission.status === "pending_feedback") return "Pending feedback";
   if (submission.status === "feedback_ready") return "Feedback ready";
   return "Saved draft";
}

export default function WritingPromptPage() {
   const params = useParams();
   const router = useRouter();
   const taskNumber = normalizeTaskNumber(params.taskNumber);
   const promptId = normalizePromptId(params.promptId);
   const [loading, setLoading] = useState(true);
   const [isPremium, setIsPremium] = useState(false);
   const [entry, setEntry] = useState<PromptEntry | null>(null);
   const [draftText, setDraftText] = useState("");
   const [timerNow, setTimerNow] = useState(Date.now());
   const [startedAt, setStartedAt] = useState<number | null>(null);
   const [saving, setSaving] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const [showFeedback, setShowFeedback] = useState(false);
   const [toast, setToast] = useState<ToastState>(null);
   const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
   const [displayMode, setDisplayMode] = useState<WritingDisplayMode>("dark");
   const [leftPaneWidth, setLeftPaneWidth] = useState(42);
   const [isResizing, setIsResizing] = useState(false);
   const splitContainerRef = useRef<HTMLDivElement | null>(null);
   const lastSavedTextRef = useRef("");

   const taskMeta = useMemo(
      () => (taskNumber ? getWritingTaskMeta(taskNumber) : null),
      [taskNumber]
   );

   useEffect(() => {
      const savedMode = window.localStorage.getItem(WRITING_MODE_STORAGE_KEY);
      if (
         savedMode === "dark" ||
         savedMode === "light" ||
         savedMode === "yellow_black"
      ) {
         setDisplayMode(savedMode);
      }
   }, []);

   useEffect(() => {
      window.localStorage.setItem(WRITING_MODE_STORAGE_KEY, displayMode);
   }, [displayMode]);

   useEffect(() => {
      if (!taskNumber || !promptId) {
         router.replace("/dashboard/writing");
         return;
      }

      const load = async () => {
         try {
            setLoading(true);
            setToast(null);

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError) {
               throw userError;
            }

            if (!userData.user) {
               router.replace("/login");
               return;
            }

            const [premium, token] = await Promise.all([
               getPremiumStatus(userData.user.id),
               getAccessToken(),
            ]);

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
               throw new Error(payload.error || "Failed to load writing prompt.");
            }

            const task = (payload.tasks || [])[0] as
               | { prompts: PromptEntry[] }
               | undefined;
            const matchedEntry =
               task?.prompts.find((item) => item.prompt.id === promptId) || null;

            if (!matchedEntry) {
               router.replace(`/dashboard/writing/${taskNumber}`);
               return;
            }

            const localDraft = window.localStorage.getItem(
               getDraftStorageKey(matchedEntry.prompt.id)
            );

            setIsPremium(premium);
            setEntry(matchedEntry);
            const initialDraft = localDraft ?? matchedEntry.submission?.answerText ?? "";
            setDraftText(initialDraft);
            lastSavedTextRef.current = matchedEntry.submission?.answerText ?? "";
            setLastSavedAt(matchedEntry.submission?.updatedAt ?? null);
            setStartedAt(Date.now());
            setTimerNow(Date.now());
         } catch (requestError) {
            setToast({
               kind: "error",
               message:
                  requestError instanceof Error
                     ? requestError.message
                     : "Failed to load writing prompt.",
            });
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [promptId, router, taskNumber]);

   useEffect(() => {
      if (!startedAt) {
         return;
      }

      const interval = window.setInterval(() => {
         setTimerNow(Date.now());
      }, 1000);

      return () => window.clearInterval(interval);
   }, [startedAt]);

   useEffect(() => {
      if (!entry?.prompt.id) {
         return;
      }

      window.localStorage.setItem(getDraftStorageKey(entry.prompt.id), draftText);
   }, [draftText, entry?.prompt.id]);

   useEffect(() => {
      if (!entry || !draftText.trim()) {
         return;
      }

      if (draftText === lastSavedTextRef.current) {
         return;
      }

      if (saving || isAutoSaving || submitting) {
         return;
      }

      const timeoutId = window.setTimeout(() => {
         const runAutoSave = async () => {
            try {
               setIsAutoSaving(true);
               const token = await getAccessToken();
               const response = await fetch("/api/writing", {
                  method: "PUT",
                  headers: {
                     "Content-Type": "application/json",
                     Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                     promptId: entry.prompt.id,
                     answerText: draftText,
                  }),
               });
               const payload = await response.json();

               if (!response.ok) {
                  throw new Error(payload.error || "Failed to save your writing.");
               }

               const submission = payload.submission as WritingSubmission;
               updateSubmission(submission);
               lastSavedTextRef.current = draftText;
               setLastSavedAt(submission.updatedAt);
               window.localStorage.setItem(
                  getDraftStorageKey(entry.prompt.id),
                  draftText
               );
            } catch {
               // Silent autosave failures should not interrupt writing.
            } finally {
               setIsAutoSaving(false);
            }
         };

         void runAutoSave();
      }, WRITING_AUTOSAVE_INTERVAL_MS);

      return () => window.clearTimeout(timeoutId);
   }, [draftText, entry, isAutoSaving, saving, submitting]);

   useEffect(() => {
      if (!isResizing) {
         return;
      }

      const handlePointerMove = (event: PointerEvent) => {
         const container = splitContainerRef.current;
         if (!container) {
            return;
         }

         const rect = container.getBoundingClientRect();
         const containerWidth = rect.width || 1;
         const relativeX = event.clientX - rect.left;
         const nextWidth = (relativeX / containerWidth) * 100;
         setLeftPaneWidth(Math.max(28, Math.min(60, nextWidth)));
      };

      const stopResizing = () => {
         setIsResizing(false);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizing);

      return () => {
         window.removeEventListener("pointermove", handlePointerMove);
         window.removeEventListener("pointerup", stopResizing);
      };
   }, [isResizing]);

   const wordCount = useMemo(() => countWords(draftText), [draftText]);
   const elapsedSeconds =
      startedAt && timerNow >= startedAt
         ? Math.floor((timerNow - startedAt) / 1000)
         : 0;
   const recommendedSeconds = taskMeta ? taskMeta.recommendedMinutes * 60 : 0;
   const remainingSeconds = Math.max(0, recommendedSeconds - elapsedSeconds);
   const modeConfig =
      WRITING_DISPLAY_MODES.find((mode) => mode.id === displayMode) ||
      WRITING_DISPLAY_MODES[0];
   const statusLabel = getStatusLabel(entry?.submission || null);
   const canOpenFeedback = entry?.submission?.status === "feedback_ready";

   const updateSubmission = (submission: WritingSubmission) => {
      setEntry((current) => (current ? { ...current, submission } : current));
   };

   const saveDraft = async (silent = false) => {
      if (!entry) return;

      if (draftText === lastSavedTextRef.current) {
         return;
      }

      try {
         if (silent) {
            setIsAutoSaving(true);
         } else {
            setSaving(true);
            setToast(null);
         }

         const token = await getAccessToken();
         const response = await fetch("/api/writing", {
            method: "PUT",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               promptId: entry.prompt.id,
               answerText: draftText,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save your writing.");
         }

         const submission = payload.submission as WritingSubmission;
         updateSubmission(submission);
         lastSavedTextRef.current = draftText;
         setLastSavedAt(submission.updatedAt);
         window.localStorage.setItem(getDraftStorageKey(entry.prompt.id), draftText);

         if (!silent) {
            setToast({ kind: "success", message: "Draft saved." });
         }
      } catch (error) {
         if (!silent) {
            setToast({
               kind: "error",
               message:
                  error instanceof Error
                     ? error.message
                     : "Failed to save your writing.",
            });
         }
      } finally {
         if (silent) {
            setIsAutoSaving(false);
         } else {
            setSaving(false);
         }
      }
   };

   const handleSave = async () => {
      await saveDraft(false);
   };

   const handleSubmitForFeedback = async () => {
      if (!entry) return;

      if (!isPremium) {
         router.push("/premium");
         return;
      }

      try {
         setSubmitting(true);
         setToast(null);
         const token = await getAccessToken();
         const response = await fetch("/api/writing", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               promptId: entry.prompt.id,
               answerText: draftText,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to send writing for feedback.");
         }

         updateSubmission(payload.submission as WritingSubmission);
         lastSavedTextRef.current = draftText;
         setLastSavedAt((payload.submission as WritingSubmission).updatedAt);
         window.localStorage.setItem(getDraftStorageKey(entry.prompt.id), draftText);
         setToast({
            kind: "success",
            message: "Your writing was sent to the admin for feedback.",
         });
      } catch (error) {
         setToast({
            kind: "error",
            message:
               error instanceof Error
                  ? error.message
                  : "Failed to send writing for feedback.",
         });
      } finally {
         setSubmitting(false);
      }
   };

   if (!taskNumber || !promptId || !taskMeta) {
      return null;
   }

   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
               <Link
                  href={`/dashboard/writing/${taskNumber}`}
                  className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200">
                  <PiArrowLeftLight />
                  Back to prompts
               </Link>
               <h1 className="mt-3 text-3xl font-semibold">
                  {loading ? "Loading..." : entry?.prompt.title || "Prompt"}
               </h1>
               <p className="mt-2 text-sm text-slate-400">
                  {taskMeta.instructionHeading}
               </p>
            </div>
         </div>

         {toast && (
            <p
               className={`rounded-2xl border px-4 py-3 text-sm ${
                  toast.kind === "success"
                     ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                     : "border-red-500/30 bg-red-500/10 text-red-200"
               }`}>
               {toast.message}
            </p>
         )}

         {loading || !entry ? (
            <div className="h-96 animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
         ) : (
            <div
               ref={splitContainerRef}
               className="flex flex-col gap-3 lg:flex-row lg:items-stretch"
               style={{ cursor: isResizing ? "col-resize" : "default" }}>
               <section
                  className={[
                     "space-y-5 rounded-3xl border p-6",
                     modeConfig.border,
                     modeConfig.panel,
                  ].join(" ")}
                  style={{ flexBasis: `${leftPaneWidth}%` }}>
                  <div className="space-y-2">
                     <p className={`text-sm ${modeConfig.mutedText}`}>
                        You should spend about {taskMeta.recommendedMinutes} minutes on
                        this task.
                     </p>
                     {taskMeta.promptIntro && (
                        <p className={`text-sm font-medium ${modeConfig.text}`}>
                           {taskMeta.promptIntro}
                        </p>
                     )}
                  </div>

                  <div
                     className={[
                        "rounded-3xl border p-5",
                        modeConfig.border,
                        modeConfig.subtlePanel,
                     ].join(" ")}>
                     <p
                        className={[
                           "whitespace-pre-wrap text-base leading-7",
                           modeConfig.text,
                        ].join(" ")}>
                        {entry.prompt.promptText}
                     </p>
                  </div>

                  {entry.prompt.imageUrl && (
                     <div
                        className={[
                           "overflow-hidden rounded-3xl border",
                           modeConfig.border,
                           modeConfig.subtlePanel,
                        ].join(" ")}>
                        <Image
                           src={entry.prompt.imageUrl}
                           alt={`${entry.prompt.title} visual prompt`}
                           width={1400}
                           height={900}
                           className="h-auto w-full object-cover"
                           unoptimized
                        />
                     </div>
                  )}

                  <p className={`text-sm leading-6 ${modeConfig.text}`}>
                     {taskMeta.promptOutro}
                  </p>

                  <p className={`text-sm font-medium ${modeConfig.text}`}>
                     Write at least {taskMeta.minimumWords} words.
                  </p>

               </section>

               <div className="hidden lg:flex items-stretch">
                  <button
                     type="button"
                     aria-label="Resize panels"
                     onPointerDown={() => setIsResizing(true)}
                     className="group flex w-2.5 cursor-col-resize items-center justify-center">
                     <span className="h-20 w-[2px] rounded-full bg-slate-600/80 transition group-hover:bg-emerald-400" />
                  </button>
               </div>

               <section
                  className={[
                     "space-y-5 rounded-3xl border p-6",
                     modeConfig.border,
                     modeConfig.panel,
                  ].join(" ")}
                  style={{ flexBasis: `${100 - leftPaneWidth}%` }}>
                  <div className="grid gap-3 md:grid-cols-4">
                     <div
                        className={[
                           "flex min-h-[74px] flex-col justify-center rounded-2xl border px-4 py-2.5",
                           modeConfig.border,
                           modeConfig.subtlePanel,
                        ].join(" ")}>
                        <p className={`text-2xl font-semibold leading-none ${modeConfig.text}`}>
                           {wordCount}
                        </p>
                     </div>

                     <div
                        className={[
                           "flex min-h-[74px] items-center justify-center rounded-2xl border px-3 py-2.5",
                           modeConfig.border,
                           modeConfig.subtlePanel,
                        ].join(" ")}>
                        <div className="rounded-full border border-slate-800 bg-slate-950/80 p-1">
                           <div className="flex items-center gap-1">
                              {WRITING_DISPLAY_MODES.map((mode) => {
                                 const isActive = displayMode === mode.id;
                                 const Icon =
                                    mode.id === "dark"
                                       ? PiMoonStarsLight
                                       : mode.id === "yellow_black"
                                         ? PiLampLight
                                         : PiSunDimLight;

                                 return (
                                    <button
                                       key={mode.id}
                                       type="button"
                                       onClick={() => setDisplayMode(mode.id)}
                                       aria-label={mode.label}
                                       title={mode.label}
                                       className={[
                                          "inline-flex items-center justify-center rounded-full p-2 transition",
                                          isActive
                                             ? "bg-slate-800 text-white shadow-sm"
                                             : "text-slate-300 hover:bg-slate-900/80 hover:text-white",
                                       ].join(" ")}>
                                       <Icon size={15} />
                                    </button>
                                 );
                              })}
                           </div>
                        </div>
                     </div>

                     <div className="group relative">
                        <button
                           type="button"
                           onClick={() => {
                              setStartedAt(Date.now());
                              setTimerNow(Date.now());
                           }}
                           className={[
                              "flex min-h-[74px] w-full items-center rounded-3xl border px-4 py-2.5 text-left transition hover:opacity-90",
                              modeConfig.border,
                              modeConfig.subtlePanel,
                           ].join(" ")}>
                           <div className="flex items-center gap-2 pr-2">
                              <PiClockCountdownLight className={modeConfig.mutedText} />
                              <p
                                 className={`min-w-[5ch] text-3xl font-semibold leading-none tabular-nums ${modeConfig.text}`}>
                                 {formatTimer(remainingSeconds)}
                              </p>
                           </div>
                        </button>
                        <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded-full border border-slate-700 bg-slate-950/95 px-3 py-1 text-xs text-slate-200 opacity-0 shadow-lg transition group-hover:opacity-100">
                           Restart timer
                        </div>
                     </div>

                     {statusLabel && (
                        <button
                           type="button"
                           onClick={() => {
                              if (canOpenFeedback) {
                                 setShowFeedback((current) => !current);
                              }
                           }}
                           className={[
                              "flex min-h-[74px] flex-col justify-center rounded-2xl border px-4 py-2.5 text-left transition",
                              modeConfig.border,
                              modeConfig.subtlePanel,
                              canOpenFeedback ? "cursor-pointer" : "cursor-default",
                           ].join(" ")}>
                           <p className={`text-xs uppercase tracking-[0.18em] ${modeConfig.mutedText}`}>
                              Status
                           </p>
                           <div className={`mt-1 inline-flex items-center gap-2 text-sm font-medium ${modeConfig.text}`}>
                              {canOpenFeedback && <PiSealCheckFill />}
                              <span>
                                 {canOpenFeedback
                                    ? showFeedback
                                       ? "Hide feedback"
                                       : "Feedback ready"
                                    : statusLabel}
                              </span>
                           </div>
                        </button>
                     )}
                  </div>

                  <textarea
                     value={draftText}
                     onChange={(event) => setDraftText(event.target.value)}
                     placeholder="Write your IELTS answer here..."
                     className={[
                        "min-h-[28rem] w-full resize-y rounded-3xl border px-5 py-4 text-sm leading-7 outline-none transition",
                        modeConfig.textarea,
                     ].join(" ")}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                     <p className={`text-sm ${modeConfig.mutedText}`}>
                        {isAutoSaving
                           ? "Autosaving..."
                           : lastSavedAt
                             ? `Saved ${formatDate(lastSavedAt)}`
                             : "Saving keeps your current draft under this prompt."}
                     </p>

                     <div className="flex flex-wrap items-center gap-3">
                        <button
                           type="button"
                           onClick={handleSave}
                           disabled={saving}
                           className={[
                              "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition disabled:opacity-60",
                              modeConfig.buttonIdle,
                           ].join(" ")}>
                           {saving ? (
                              <PiSpinnerGapLight className="animate-spin" />
                           ) : (
                              <PiFloppyDiskLight />
                           )}
                           Save
                        </button>

                        <button
                           type="button"
                           onClick={handleSubmitForFeedback}
                           disabled={
                              submitting || entry.submission?.status === "pending_feedback"
                           }
                           className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition disabled:opacity-60 ${
                              isPremium
                                 ? "bg-amber-400 text-slate-950 hover:bg-amber-300"
                                 : "border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15"
                           }`}>
                           {submitting ? (
                              <PiSpinnerGapLight className="animate-spin" />
                           ) : entry.submission?.status === "feedback_ready" ? (
                              <PiArrowClockwiseBold />
                           ) : (
                              <PiCrownSimpleFill />
                           )}
                           {isPremium
                              ? entry.submission?.status === "pending_feedback"
                                 ? "Pending feedback"
                                 : entry.submission?.status === "feedback_ready"
                                   ? "Resubmit for feedback"
                                   : "Send for feedback"
                              : "Go premium for feedback"}
                        </button>
                     </div>
                  </div>
               </section>
            </div>
         )}

         {showFeedback && canOpenFeedback && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
               <div
                  className={[
                     "max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border p-6 shadow-2xl",
                     modeConfig.border,
                     modeConfig.panel,
                  ].join(" ")}>
                  <div className="flex items-start justify-between gap-4">
                     <div>
                        <p
                           className={`text-xs uppercase tracking-[0.2em] ${modeConfig.mutedText}`}>
                           Admin feedback
                        </p>
                        {entry?.submission?.feedbackGivenAt && (
                           <p className={`mt-2 text-sm ${modeConfig.mutedText}`}>
                              Added {formatDate(entry.submission.feedbackGivenAt)}
                           </p>
                        )}
                     </div>

                     <button
                        type="button"
                        onClick={() => setShowFeedback(false)}
                        className={[
                           "rounded-full border px-4 py-2 text-sm font-medium transition",
                           modeConfig.buttonIdle,
                        ].join(" ")}>
                        Close
                     </button>
                  </div>

                  {entry?.submission?.feedbackText && (
                     <p
                        className={`mt-5 whitespace-pre-wrap text-sm leading-7 ${modeConfig.text}`}>
                        {entry.submission.feedbackText}
                     </p>
                  )}

                  {(entry?.submission?.feedbackImages || []).length > 0 && (
                     <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        {entry?.submission?.feedbackImages.map((imageUrl) => (
                           <Image
                              key={imageUrl}
                              src={imageUrl}
                              alt="Writing feedback attachment"
                              width={1200}
                              height={900}
                              className="h-56 w-full rounded-2xl object-cover"
                              unoptimized
                           />
                        ))}
                     </div>
                  )}
               </div>
            </div>
         )}
      </div>
   );
}
