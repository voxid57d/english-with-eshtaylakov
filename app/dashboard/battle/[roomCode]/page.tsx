"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import type {
   BattleRoomSnapshot,
   BattleSubmissionAnswer,
} from "@/lib/vocabularyBattle";

type LocalBattleState = {
   startKey: string;
   currentIndex: number;
   questionStartedAt: number;
   answers: BattleSubmissionAnswer[];
   submitted: boolean;
   pendingSubmission: boolean;
};

function createInitialLocalState(startKey: string): LocalBattleState {
   return {
      startKey,
      currentIndex: 0,
      questionStartedAt: Date.now(),
      answers: [],
      submitted: false,
      pendingSubmission: false,
   };
}

function getBattleStorageKey(roomCode: string, startKey: string) {
   return `battle-progress:${roomCode}:${startKey}`;
}

function formatSeconds(ms: number) {
   return `${(ms / 1000).toFixed(1)}s`;
}

function getPremiumNameClass(isPremium: boolean) {
   return isPremium ? "text-amber-100" : "text-slate-100";
}

function getCuriosityPointReward(index: number) {
   if (index === 0) return 10;
   if (index === 1) return 5;
   return 0;
}

function getSubmitErrorMessage(error: unknown) {
   const message =
      error instanceof Error ? error.message : "Failed to submit battle.";

   if (
      message === "Load failed" ||
      message === "Failed to fetch" ||
      message === "NetworkError when attempting to fetch resource."
   ) {
      return "Your connection dropped before the answers were saved. Keep this page open and retry submission.";
   }

   return message;
}

export default function BattleRoomPage() {
   const params = useParams();
   const router = useRouter();
   const roomCode = params.roomCode as string;

   const [snapshot, setSnapshot] = useState<BattleRoomSnapshot | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [copied, setCopied] = useState(false);
   const [readyLoading, setReadyLoading] = useState(false);
   const [submitLoading, setSubmitLoading] = useState(false);
   const [now, setNow] = useState(0);
   const [localBattle, setLocalBattle] = useState<LocalBattleState | null>(
      null,
   );
   const questionTimerRef = useRef<number | null>(null);

   useEffect(() => {
      setNow(Date.now());
      const intervalId = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(intervalId);
   }, []);

   const loadSnapshot = useCallback(async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
         router.replace("/login");
         return;
      }

      const token = await getSupabaseAccessToken();
      const response = await fetch(
         `/api/vocabulary-battle/rooms/${encodeURIComponent(roomCode)}`,
         {
            headers: {
               Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
         },
      );

      const payload = await response.json();
      if (!response.ok) {
         throw new Error(payload.error || "Failed to load battle room.");
      }

      setSnapshot(payload);
      setError(null);
      setLoading(false);
   }, [roomCode, router]);

   const shouldPoll = useMemo(() => {
      if (!snapshot) return true;
      if (snapshot.status === "waiting") return true;
      if (snapshot.status === "active" && !snapshot.battleStartsAt) return true;
      if (snapshot.status === "active" && snapshot.viewerSubmitted) return true;
      return false;
   }, [snapshot]);

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         try {
            await loadSnapshot();
         } catch (requestError) {
            if (!cancelled) {
               setError(
                  requestError instanceof Error
                     ? requestError.message
                     : "Failed to load battle room.",
               );
               setLoading(false);
            }
         }
      };

      void load();

      if (!shouldPoll) {
         return () => {
            cancelled = true;
         };
      }

      const intervalId = window.setInterval(() => {
         void load();
      }, 1000);

      return () => {
         cancelled = true;
         window.clearInterval(intervalId);
      };
   }, [loadSnapshot, shouldPoll]);

   useEffect(() => {
      if (!snapshot?.battleStartsAt || snapshot.viewerSubmitted) {
         return;
      }

      const startAt = new Date(snapshot.battleStartsAt).getTime();
      if (startAt > now) {
         return;
      }

      const startKey = snapshot.battleStartsAt;
      const storageKey = getBattleStorageKey(snapshot.roomCode, startKey);

      setLocalBattle((current) => {
         if (current?.startKey === startKey) {
            return current;
         }

         try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved) {
               const parsed = JSON.parse(saved) as LocalBattleState;
               if (
                  parsed.startKey === startKey &&
                  parsed.currentIndex >= 0 &&
                  parsed.currentIndex <= snapshot.questionBank.length
               ) {
                  const normalizedAnswers = Array.isArray(parsed.answers)
                     ? parsed.answers
                     : [];
                  const reachedEnd =
                     parsed.currentIndex >= snapshot.questionBank.length;

                  return {
                     startKey,
                     currentIndex: parsed.currentIndex,
                     questionStartedAt:
                        typeof parsed.questionStartedAt === "number"
                           ? parsed.questionStartedAt
                           : Date.now(),
                     answers: normalizedAnswers,
                     // Recover older saved attempts that were marked submitted
                     // before the server actually confirmed the save.
                     submitted: parsed.submitted === true && !reachedEnd,
                     pendingSubmission:
                        parsed.pendingSubmission === true ||
                        (parsed.submitted === true && reachedEnd),
                  };
               }
            }
         } catch {
            window.localStorage.removeItem(storageKey);
         }

         return createInitialLocalState(startKey);
      });
   }, [now, snapshot]);

   useEffect(() => {
      if (!snapshot?.battleStartsAt) {
         return;
      }

      const storageKey = getBattleStorageKey(
         snapshot.roomCode,
         snapshot.battleStartsAt,
      );
      if (snapshot.status === "finished" || snapshot.viewerSubmitted) {
         window.localStorage.removeItem(storageKey);
         return;
      }

      if (!localBattle || localBattle.startKey !== snapshot.battleStartsAt) {
         return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(localBattle));
   }, [localBattle, snapshot]);

   const clearQuestionTimer = useCallback(() => {
      if (questionTimerRef.current) {
         window.clearTimeout(questionTimerRef.current);
         questionTimerRef.current = null;
      }
   }, []);

   const submitBattle = useCallback(
      async (answers: BattleSubmissionAnswer[]) => {
         if (!snapshot || submitLoading) return;

         try {
            clearQuestionTimer();
            setSubmitLoading(true);
            const totalResponseMs = answers.reduce(
               (sum, answer) => sum + answer.responseMs,
               0,
            );

            const token = await getSupabaseAccessToken();
            const response = await fetch("/api/vocabulary-battle/submit", {
               method: "POST",
               headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
               },
               body: JSON.stringify({
                  roomCode: snapshot.roomCode,
                  answers,
                  totalResponseMs,
               }),
            });

            const payload = await response.json();
            if (!response.ok) {
               throw new Error(payload.error || "Failed to submit battle.");
            }

            setSnapshot(payload);
            setLocalBattle((current) => {
               if (!current) return current;

               return {
                  ...current,
                  submitted: true,
                  pendingSubmission: false,
               };
            });
            setError(null);
         } catch (requestError) {
            setLocalBattle((current) =>
               current
                  ? {
                       ...current,
                       pendingSubmission: true,
                       submitted: false,
                    }
                  : current,
            );
            setError(getSubmitErrorMessage(requestError));
         } finally {
            setSubmitLoading(false);
         }
      },
      [clearQuestionTimer, snapshot, submitLoading],
   );

   const advanceBattle = useCallback(
      (selectedOptionIndex: number | null, responseMs: number) => {
         setLocalBattle((current) => {
            if (!current || !snapshot) return current;

            const nextAnswers = [
               ...current.answers,
               {
                  questionIndex: current.currentIndex,
                  selectedOptionIndex,
                  responseMs,
               },
            ];

            if (current.currentIndex + 1 >= snapshot.questionBank.length) {
               return {
                  ...current,
                  answers: nextAnswers,
                  currentIndex: current.currentIndex + 1,
                  submitted: false,
                  pendingSubmission: true,
               };
            }

            return {
               ...current,
               answers: nextAnswers,
               currentIndex: current.currentIndex + 1,
               questionStartedAt: Date.now(),
            };
         });
      },
      [snapshot],
   );

   useEffect(() => {
      if (
         !snapshot ||
         snapshot.viewerSubmitted ||
         !localBattle?.pendingSubmission ||
         submitLoading
      ) {
         return;
      }

      void submitBattle(localBattle.answers);
   }, [localBattle, snapshot, submitBattle, submitLoading]);

   const activeQuestion = useMemo(() => {
      if (!snapshot || !localBattle) return null;
      return snapshot.questionBank[localBattle.currentIndex] || null;
   }, [localBattle, snapshot]);

   const localTimeRemaining = useMemo(() => {
      if (!snapshot || !localBattle || !activeQuestion) {
         return snapshot?.timeLimitSeconds
            ? snapshot.timeLimitSeconds * 1000
            : 0;
      }

      const elapsed = now - localBattle.questionStartedAt;
      return Math.max(0, snapshot.timeLimitSeconds * 1000 - elapsed);
   }, [activeQuestion, localBattle, now, snapshot]);

   useEffect(() => {
      if (
         !snapshot ||
         snapshot.viewerSubmitted ||
         snapshot.status !== "active" ||
         !localBattle ||
         localBattle.pendingSubmission ||
         localBattle.currentIndex >= snapshot.questionBank.length ||
         !activeQuestion
      ) {
         clearQuestionTimer();
         return;
      }

      clearQuestionTimer();
      questionTimerRef.current = window.setTimeout(
         () => {
            advanceBattle(null, snapshot.timeLimitSeconds * 1000);
         },
         Math.max(localTimeRemaining, 0),
      );

      return () => {
         clearQuestionTimer();
      };
   }, [
      activeQuestion,
      advanceBattle,
      clearQuestionTimer,
      localBattle,
      localTimeRemaining,
      snapshot,
   ]);

   const countdownMs = useMemo(() => {
      if (!snapshot?.battleStartsAt) return 0;
      return Math.max(0, new Date(snapshot.battleStartsAt).getTime() - now);
   }, [now, snapshot]);

   const sortedPlayers = useMemo(
      () =>
         [...(snapshot?.players || [])].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.totalResponseMs - b.totalResponseMs;
         }),
      [snapshot],
   );

   const completionPercent = useMemo(() => {
      if (!snapshot || !localBattle || snapshot.questionBank.length === 0) {
         return 0;
      }

      return Math.min(
         100,
         (localBattle.answers.length / snapshot.questionBank.length) * 100,
      );
   }, [localBattle, snapshot]);

   const handleCopy = async () => {
      await navigator.clipboard.writeText(snapshot?.roomCode || roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
   };

   const handleReady = async () => {
      if (!snapshot || readyLoading || snapshot.viewerReady) return;

      try {
         setReadyLoading(true);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/ready", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ roomCode: snapshot.roomCode }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to mark ready.");
         }

         setSnapshot(payload);
         setError(null);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to mark ready.",
         );
      } finally {
         setReadyLoading(false);
      }
   };

   const handleSelectAnswer = (selectedOptionIndex: number) => {
      if (!snapshot || !localBattle || !activeQuestion || submitLoading) return;

      const responseMs = Math.min(
         Math.max(Date.now() - localBattle.questionStartedAt, 0),
         snapshot.timeLimitSeconds * 1000,
      );
      advanceBattle(selectedOptionIndex, responseMs);
   };

   const handleRetrySubmission = () => {
      if (!localBattle?.pendingSubmission || submitLoading) {
         return;
      }

      void submitBattle(localBattle.answers);
   };

   const showActiveQuestionOverlay =
      snapshot?.status === "active" &&
      countdownMs <= 0 &&
      !snapshot.viewerSubmitted &&
      Boolean(activeQuestion);

   useEffect(() => {
      if (!showActiveQuestionOverlay) {
         return;
      }

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      return () => {
         document.body.style.overflow = previousOverflow;
      };
   }, [showActiveQuestionOverlay]);

   if (loading) {
      return (
         <div className="text-sm text-slate-400">Loading battle room...</div>
      );
   }

   if (error && !snapshot) {
      return (
         <div className="space-y-4">
            <p className="text-sm text-red-300">{error}</p>
            <Link
               href="/dashboard/battle"
               className="inline-flex rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
               Back to battle lobby
            </Link>
         </div>
      );
   }

   if (!snapshot) {
      return null;
   }

   const viewer = snapshot.players.find(
      (player) => player.userId === snapshot.viewerUserId,
   );
   const winner = snapshot.players.find(
      (player) => player.userId === snapshot.winnerUserId,
   );
   const hasMinimumPlayers = snapshot.players.length >= 2;
   const everyoneReady =
      hasMinimumPlayers && snapshot.players.every((player) => player.isReady);
   const awardedPlayers =
      snapshot.status === "finished" && winner
         ? sortedPlayers
              .map((player, index) => ({
                 ...player,
                 curiosityPointReward: getCuriosityPointReward(index),
              }))
              .filter((player) => player.curiosityPointReward > 0)
         : [];

   return (
      <div className="space-y-6">
         {showActiveQuestionOverlay && (
            <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/96 backdrop-blur-sm">
               <div className="flex min-h-full items-start justify-center p-4 sm:p-6 lg:p-8">
                  <div className="w-full max-w-5xl rounded-[2rem] border border-emerald-500/25 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.16),_rgba(2,6,23,0.98)_42%)] shadow-[0_30px_100px_rgba(2,6,23,0.65)]">
                     <div className="border-b border-slate-800/80 px-5 py-4 sm:px-8 sm:py-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                           <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                                 Vocabulary battle
                              </p>
                              <p className="mt-2 text-sm text-slate-300">
                                 Question {(localBattle?.currentIndex ?? 0) + 1} of{" "}
                                 {snapshot.questionCount}
                              </p>
                           </div>
                           <div className="rounded-full border border-amber-500/35 bg-amber-500/10 px-5 py-3 text-right">
                              <p className="text-[11px] uppercase tracking-[0.28em] text-amber-200">
                                 Time left
                              </p>
                              <p className="mt-1 text-2xl font-semibold text-amber-100 sm:text-3xl">
                                 {Math.ceil(localTimeRemaining / 1000)}s
                              </p>
                           </div>
                        </div>

                        <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
                           <div
                              className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                              style={{ width: `${completionPercent}%` }}
                           />
                        </div>
                     </div>

                     <div className="space-y-8 px-5 py-6 sm:px-8 sm:py-8">
                        <div className="space-y-3">
                           <p className="text-xs uppercase tracking-[0.3em] text-sky-200/80">
                              Translate this word
                           </p>
                           <div className="rounded-[2rem] border border-sky-400/25 bg-sky-400/10 px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:px-8 sm:py-10">
                              <p className="text-center text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                                 {activeQuestion?.prompt}
                              </p>
                           </div>
                        </div>

                        <div className="space-y-4">
                           <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                              Choose the correct meaning
                           </p>
                           <div className="grid gap-3 sm:gap-4">
                              {activeQuestion?.options.map((option, index) => (
                                 <button
                                    key={`${activeQuestion.questionIndex}-${index}`}
                                    type="button"
                                    onClick={() => handleSelectAnswer(index)}
                                    disabled={submitLoading}
                                    className="cursor-pointer rounded-[1.75rem] border border-slate-700 bg-slate-900/85 px-5 py-5 text-left text-base text-slate-100 shadow-[0_10px_30px_rgba(2,6,23,0.22)] transition hover:border-emerald-500/60 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:py-6 sm:text-lg">
                                    {option}
                                 </button>
                              ))}
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
         )}

         <div className="rounded-[2rem] border border-slate-800 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_rgba(2,6,23,0.92)_45%)] p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
               <div className="space-y-2">
                  <Link
                     href="/dashboard/battle"
                     className="inline-flex text-sm text-slate-400 transition hover:text-slate-200">
                     &larr; Back to battle lobby
                  </Link>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                     Vocabulary battle
                  </p>
                  <h1 className="text-3xl font-semibold text-slate-50 sm:text-4xl">
                     {snapshot.deckTitle}
                  </h1>
               </div>

               <button
                  type="button"
                  onClick={handleCopy}
                  className="cursor-pointer rounded-full border border-slate-700 bg-slate-950/40 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
                  {copied ? "Code copied" : "Copy room code"}
               </button>
            </div>

            <div className="mt-6 flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-emerald-500/30 bg-slate-950/35 px-5 py-5">
               <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                     Room code
                  </p>
                  <p className="mt-2 text-4xl font-semibold tracking-[0.45em] text-slate-50 sm:text-5xl">
                     {snapshot.roomCode}
                  </p>
               </div>
               <p className="max-w-md text-sm text-slate-300">
                  Share this code with your students. Everyone in the room will use the
                  same {snapshot.questionCount} questions.
               </p>
            </div>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_360px]">
            <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 sm:p-8">
               {snapshot.status === "waiting" && (
                  <div className="space-y-6">
                     <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                           Ready room
                        </p>
                        <h2 className="text-2xl font-semibold text-slate-50">
                           Downloaded and waiting for players
                        </h2>
                        <p className="text-sm text-slate-400">
                           Questions are prepared. Once at least two players have
                           joined and everyone presses ready, the shared countdown starts.
                        </p>
                     </div>

                     <div className="grid gap-4 md:grid-cols-2">
                        {snapshot.players.map((player) => (
                           <div
                              key={player.userId}
                              className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                              <div className="flex flex-wrap items-center gap-2">
                                 <p
                                    className={`text-lg font-semibold ${getPremiumNameClass(
                                       player.isPremium,
                                    )}`}>
                                    {player.username}
                                 </p>
                                 {player.isPremium && (
                                    <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                                       Premium
                                    </span>
                                 )}
                              </div>
                              <p className="mt-2 text-sm text-slate-400">
                                 {player.isReady
                                    ? "Ready to start"
                                    : "Not ready yet"}
                              </p>
                           </div>
                        ))}
                        {!hasMinimumPlayers && (
                           <div className="rounded-3xl border border-dashed border-slate-700 bg-slate-950/30 p-5 text-sm text-slate-500">
                              Waiting for more players to join. At least 2 are needed to start.
                           </div>
                        )}
                     </div>

                     {hasMinimumPlayers && !snapshot.viewerReady && (
                        <button
                           type="button"
                           onClick={handleReady}
                           disabled={readyLoading}
                           className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                           {readyLoading ? "Loading..." : "I'm ready"}
                        </button>
                     )}

                     {snapshot.viewerReady && !everyoneReady && (
                        <p className="text-sm text-slate-300">
                           You are ready. Waiting for the remaining players.
                        </p>
                     )}
                  </div>
               )}

               {snapshot.status === "active" && countdownMs > 0 && (
                  <div className="space-y-6 text-center">
                     <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                        Countdown
                     </p>
                     <p className="text-7xl font-semibold text-slate-50">
                        {Math.ceil(countdownMs / 1000)}
                     </p>
                     <p className="mx-auto max-w-lg text-sm text-slate-300">
                        Everyone is ready. The battle opens when the
                        countdown reaches zero.
                     </p>
                  </div>
               )}

               {snapshot.status === "active" &&
                  countdownMs <= 0 &&
                  !snapshot.viewerSubmitted &&
                  activeQuestion && (
                     <div className="space-y-6">
                        <div className="space-y-4">
                           <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                                 Question {(localBattle?.currentIndex ?? 0) + 1}{" "}
                                 of {snapshot.questionCount}
                              </p>
                              <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200">
                                 {Math.ceil(localTimeRemaining / 1000)}s left
                              </div>
                           </div>

                           <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                 className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                                 style={{ width: `${completionPercent}%` }}
                              />
                           </div>
                        </div>

                        <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                           <p className="text-3xl font-semibold leading-tight text-slate-50 sm:text-4xl">
                              {activeQuestion.prompt}
                           </p>
                        </div>

                        <div className="grid gap-3">
                           {activeQuestion.options.map((option, index) => (
                              <button
                                 key={`${activeQuestion.questionIndex}-${index}`}
                                 type="button"
                                 onClick={() => handleSelectAnswer(index)}
                                 disabled={submitLoading}
                                 className="cursor-pointer rounded-3xl border border-slate-800 bg-slate-950/70 px-5 py-5 text-left text-base text-slate-100 transition hover:border-emerald-500/50 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                                 {option}
                              </button>
                           ))}
                        </div>
                     </div>
                  )}

               {snapshot.status === "active" &&
                  (snapshot.viewerSubmitted ||
                     submitLoading ||
                     localBattle?.pendingSubmission) && (
                     <div className="space-y-5">
                        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                           <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                              {snapshot.viewerSubmitted
                                 ? "Results sent"
                                 : submitLoading
                                   ? "Submitting answers"
                                   : "Submission pending"}
                           </p>
                           <p className="mt-3 text-2xl font-semibold text-slate-50">
                              {snapshot.viewerSubmitted
                                 ? "Your battle is complete."
                                 : "Your answers are ready to send."}
                           </p>
                           <p className="mt-2 text-sm text-slate-300">
                              {snapshot.viewerSubmitted
                                 ? "Waiting for the remaining players to finish so we can compare the final scores."
                                 : "We will keep trying until the server confirms your submission."}
                           </p>
                           {!snapshot.viewerSubmitted && !submitLoading && (
                              <button
                                 type="button"
                                 onClick={handleRetrySubmission}
                                 className="mt-4 cursor-pointer rounded-full border border-emerald-400/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10">
                                 Retry submission
                              </button>
                           )}
                        </div>
                     </div>
                  )}

               {snapshot.status === "finished" && (
                  <div className="space-y-6">
                     <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 p-6">
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                           Match finished
                        </p>
                        <p className="mt-3 text-3xl font-semibold text-slate-50">
                           {winner
                              ? `${winner.username} wins`
                              : "The battle ended in a tie"}
                        </p>
                        {winner?.isPremium && (
                           <p className="mt-2 text-sm text-amber-100/80">
                              Premium player
                           </p>
                        )}
                        <p className="mt-2 text-sm text-slate-300">
                           You scored {viewer?.score ?? 0} out of{" "}
                           {snapshot.questionCount}.
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                           Total answer time{" "}
                           {formatSeconds(viewer?.totalResponseMs || 0)}
                        </p>
                     </div>

                     <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-6">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                           Curiosity Points
                        </p>
                        {awardedPlayers.length > 0 ? (
                           <div className="mt-4 space-y-3">
                              {awardedPlayers.map((player, index) => (
                                 <div
                                    key={player.userId}
                                    className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                                    <div className="min-w-0">
                                       <p className="text-sm text-slate-500">
                                          {index === 0 ? "1st place" : "2nd place"}
                                       </p>
                                       <p
                                          className={`truncate text-base font-semibold ${getPremiumNameClass(
                                             player.isPremium,
                                          )}`}>
                                          {player.username}
                                       </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-emerald-200">
                                       <Image
                                          src="/cp-icon.svg"
                                          alt=""
                                          aria-hidden="true"
                                          width={18}
                                          height={18}
                                          className="h-[18px] w-[18px] shrink-0"
                                       />
                                       <span className="text-sm font-semibold">
                                          +{player.curiosityPointReward} CP
                                       </span>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        ) : (
                           <p className="mt-3 text-sm text-slate-300">
                              This battle ended in a tie, so no Curiosity Points were awarded.
                           </p>
                        )}
                     </div>

                     <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-slate-50">
                           Match review
                        </h3>
                        {snapshot.completedQuestions.map((question) => {
                           const viewerAnswer = question.answers.find(
                              (answer) =>
                                 answer.userId === snapshot.viewerUserId,
                           );

                           return (
                              <div
                                 key={question.questionIndex}
                                 className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 space-y-4">
                                 <div>
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                       Question {question.questionIndex + 1}
                                    </p>
                                    <p className="mt-2 text-lg font-semibold text-slate-50">
                                       {question.prompt}
                                    </p>
                                 </div>

                                 <div className="grid gap-2">
                                    {question.options.map((option, index) => {
                                       const isCorrect =
                                          index === question.correctOptionIndex;
                                       const isViewerChoice =
                                          viewerAnswer?.selectedOptionIndex ===
                                          index;

                                       return (
                                          <div
                                             key={`${question.questionIndex}-${index}`}
                                             className={`rounded-2xl border px-4 py-3 text-sm ${
                                                isCorrect
                                                   ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                                                   : isViewerChoice
                                                     ? "border-red-500/40 bg-red-500/10 text-red-100"
                                                     : "border-slate-800 bg-slate-900/40 text-slate-300"
                                             }`}>
                                             {option}
                                          </div>
                                       );
                                    })}
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  </div>
               )}
            </section>

            <aside className="space-y-6">
               <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                  <div className="flex items-center justify-between">
                     <h2 className="text-lg font-semibold text-slate-50">
                        Players
                     </h2>
                     <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        Room
                     </span>
                  </div>

                  <div className="mt-4 space-y-3">
                     {sortedPlayers.map((player, index) => (
                        <div
                           key={player.userId}
                           className={`rounded-3xl border px-4 py-4 ${
                              player.userId === snapshot.viewerUserId
                                 ? "border-emerald-500/40 bg-emerald-500/10"
                                 : "border-slate-800 bg-slate-950/70"
                           }`}>
                           <div className="flex items-center justify-between gap-3">
                              <div>
                                 <p className="text-sm text-slate-500">
                                    #{index + 1}
                                 </p>
                                 <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <p
                                       className={`text-base font-semibold ${getPremiumNameClass(
                                          player.isPremium,
                                       )}`}>
                                       {player.username}
                                    </p>
                                    {player.isPremium && (
                                       <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
                                          Premium
                                       </span>
                                    )}
                                 </div>
                              </div>
                              <div className="text-right text-xs text-slate-400">
                                 {player.submittedAt
                                    ? "Finished"
                                    : player.isReady
                                      ? "Ready"
                                      : "Not ready"}
                              </div>
                           </div>

                           {snapshot.status === "finished" && (
                              <div className="mt-3 space-y-2">
                                 <div className="text-sm text-slate-300">
                                    {player.score} correct -{" "}
                                    {formatSeconds(player.totalResponseMs)}
                                 </div>
                                 {winner && getCuriosityPointReward(index) > 0 && (
                                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                                       <Image
                                          src="/cp-icon.svg"
                                          alt=""
                                          aria-hidden="true"
                                          width={14}
                                          height={14}
                                          className="h-3.5 w-3.5 shrink-0"
                                       />
                                       <span>
                                          +{getCuriosityPointReward(index)} CP
                                       </span>
                                    </div>
                                 )}
                              </div>
                           )}
                        </div>
                     ))}
                  </div>
               </div>

               <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                     Match rules
                  </p>
                  <div className="mt-3 space-y-2">
                     <p>{snapshot.questionCount} questions</p>
                     <p>{snapshot.timeLimitSeconds} seconds per question</p>
                     <p>Higher score wins</p>
                     <p>Faster total time breaks ties</p>
                  </div>
               </div>
            </aside>
         </div>
      </div>
   );
}
