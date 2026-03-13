"use client";

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
};

function createInitialLocalState(startKey: string): LocalBattleState {
   return {
      startKey,
      currentIndex: 0,
      questionStartedAt: 0,
      answers: [],
      submitted: false,
   };
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
   const [localBattle, setLocalBattle] = useState<LocalBattleState | null>(null);
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
      const startKey = snapshot.battleStartsAt;

      if (startAt > now) {
         return;
      }

      setLocalBattle((current) => {
         if (current?.startKey === startKey) {
            return current;
         }

         return {
            ...createInitialLocalState(startKey),
            questionStartedAt: Date.now(),
         };
      });
   }, [now, snapshot]);

   const clearQuestionTimer = useCallback(() => {
      if (questionTimerRef.current) {
         window.clearTimeout(questionTimerRef.current);
         questionTimerRef.current = null;
      }
   }, []);

   const submitBattle = useCallback(async (answers: BattleSubmissionAnswer[]) => {
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
         setLocalBattle((current) =>
            current ? { ...current, submitted: true } : current,
         );
         setError(null);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to submit battle.",
         );
      } finally {
         setSubmitLoading(false);
      }
   }, [clearQuestionTimer, snapshot, submitLoading]);

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
               void submitBattle(nextAnswers);
               return {
                  ...current,
                  answers: nextAnswers,
                  currentIndex: current.currentIndex + 1,
                  submitted: true,
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
      [snapshot, submitBattle],
   );

   useEffect(() => {
      if (
         !snapshot ||
         snapshot.viewerSubmitted ||
         snapshot.status !== "active" ||
         !localBattle ||
         localBattle.submitted ||
         localBattle.currentIndex >= snapshot.questionBank.length
      ) {
         clearQuestionTimer();
         return;
      }

      clearQuestionTimer();
      questionTimerRef.current = window.setTimeout(() => {
         advanceBattle(null, snapshot.timeLimitSeconds * 1000);
      }, snapshot.timeLimitSeconds * 1000);

      return () => {
         clearQuestionTimer();
      };
   }, [advanceBattle, clearQuestionTimer, localBattle, snapshot]);

   const activeQuestion = useMemo(() => {
      if (!snapshot || !localBattle) return null;
      return snapshot.questionBank[localBattle.currentIndex] || null;
   }, [localBattle, snapshot]);

   const localTimeRemaining = useMemo(() => {
      if (!snapshot || !localBattle || !activeQuestion) {
         return snapshot?.timeLimitSeconds ? snapshot.timeLimitSeconds * 1000 : 0;
      }

      const elapsed = now - localBattle.questionStartedAt;
      return Math.max(0, snapshot.timeLimitSeconds * 1000 - elapsed);
   }, [activeQuestion, localBattle, now, snapshot]);

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

   if (loading) {
      return <div className="text-sm text-slate-400">Loading battle room...</div>;
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
   const bothPlayersJoined = snapshot.players.length === 2;
   const everyoneReady =
      bothPlayersJoined && snapshot.players.every((player) => player.isReady);

   return (
      <div className="space-y-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
               <Link
                  href="/dashboard/battle"
                  className="inline-flex text-sm text-slate-400 transition hover:text-slate-200">
                  ← Back to battle lobby
               </Link>
               <h1 className="text-3xl font-semibold">{snapshot.deckTitle}</h1>
            </div>

            <button
               type="button"
               onClick={handleCopy}
               className="cursor-pointer rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
               {copied ? "Code copied" : "Copy room code"}
            </button>
         </div>

         <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-5">
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
               Room code
            </p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
               <p className="text-4xl font-semibold tracking-[0.45em] text-slate-50 sm:text-5xl">
                  {snapshot.roomCode}
               </p>
               <p className="text-sm text-slate-300">
                  Share this code so your student can join the battle.
               </p>
            </div>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
               {snapshot.status === "waiting" && (
                  <div className="space-y-5">
                     <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                           Ready room
                        </p>
                        <p className="mt-2 text-lg text-slate-100">
                           Both players download the same questions now. Press ready
                           when you want to start.
                        </p>
                        <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-slate-950/40 px-5 py-4">
                           <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                              Share this room code
                           </p>
                           <p className="mt-2 text-3xl font-semibold tracking-[0.4em] text-slate-50 sm:text-4xl">
                              {snapshot.roomCode}
                           </p>
                        </div>
                     </div>

                     {!bothPlayersJoined && (
                        <p className="text-sm text-slate-400">
                           Waiting for the second player to join this room.
                        </p>
                     )}

                     {bothPlayersJoined && !snapshot.viewerReady && (
                        <button
                           type="button"
                           onClick={handleReady}
                           disabled={readyLoading}
                           className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                           {readyLoading ? "Saving..." : "I'm ready"}
                        </button>
                     )}

                     {snapshot.viewerReady && !everyoneReady && (
                        <p className="text-sm text-slate-300">
                           You are ready. Waiting for the other player.
                        </p>
                     )}
                  </div>
               )}

               {snapshot.status === "active" && countdownMs > 0 && (
                  <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-12 text-center">
                     <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                        Countdown
                     </p>
                     <p className="mt-4 text-7xl font-semibold text-slate-50">
                        {Math.ceil(countdownMs / 1000)}
                     </p>
                     <p className="mt-4 text-sm text-slate-300">
                        The battle starts as soon as the countdown ends.
                     </p>
                  </div>
               )}

               {snapshot.status === "active" &&
                  countdownMs <= 0 &&
                  !snapshot.viewerSubmitted &&
                  activeQuestion && (
                     <div className="space-y-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                           <div>
                              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                                 Question {(localBattle?.currentIndex ?? 0) + 1} of{" "}
                                 {snapshot.questionCount}
                              </p>
                              <h2 className="mt-2 text-3xl font-semibold">
                                 {activeQuestion.prompt}
                              </h2>
                           </div>

                           <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200">
                              {Math.ceil(localTimeRemaining / 1000)}s left
                           </div>
                        </div>

                        <div className="grid gap-3">
                           {activeQuestion.options.map((option, index) => (
                              <button
                                 key={`${activeQuestion.questionIndex}-${index}`}
                                 type="button"
                                 onClick={() => handleSelectAnswer(index)}
                                 disabled={submitLoading}
                                 className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 text-left text-sm text-slate-200 transition hover:border-slate-600 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                                 {option}
                              </button>
                           ))}
                        </div>
                     </div>
                  )}

               {snapshot.status === "active" &&
                  (snapshot.viewerSubmitted || submitLoading) && (
                     <div className="space-y-4">
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                           <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                              Results sent
                           </p>
                           <p className="mt-2 text-lg text-slate-100">
                              Your battle is complete. Waiting for the other player to
                              finish.
                           </p>
                        </div>
                        <p className="text-sm text-slate-400">
                           You can stay on this page. Final results will appear
                           automatically.
                        </p>
                     </div>
                  )}

               {snapshot.status === "finished" && (
                  <div className="space-y-5">
                     <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                           Match finished
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-slate-100">
                           {winner
                              ? `${winner.username} wins`
                              : "The battle ended in a tie"}
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                           You scored {viewer?.score ?? 0} out of{" "}
                           {snapshot.questionCount}.
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                           Total answer time{" "}
                           {((viewer?.totalResponseMs || 0) / 1000).toFixed(1)}s
                        </p>
                     </div>

                     <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-slate-100">
                           Match review
                        </h3>

                        {snapshot.completedQuestions.map((question) => {
                           const viewerAnswer = question.answers.find(
                              (answer) => answer.userId === snapshot.viewerUserId,
                           );

                           return (
                              <div
                                 key={question.questionIndex}
                                 className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-4">
                                 <div className="space-y-1">
                                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                       Question {question.questionIndex + 1}
                                    </p>
                                    <p className="text-lg font-semibold text-slate-100">
                                       {question.prompt}
                                    </p>
                                 </div>

                                 <div className="grid gap-2">
                                    {question.options.map((option, index) => {
                                       const isCorrect =
                                          index === question.correctOptionIndex;
                                       const isViewerChoice =
                                          viewerAnswer?.selectedOptionIndex === index;

                                       return (
                                          <div
                                             key={`${question.questionIndex}-${index}`}
                                             className={`rounded-xl border px-3 py-3 text-sm ${
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

                     <Link
                        href="/dashboard/battle"
                        className="inline-flex rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                        Start another battle
                     </Link>
                  </div>
               )}
            </section>

            <aside className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
               <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Players</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                     Room
                  </span>
               </div>

               <div className="space-y-3">
                  {sortedPlayers.map((player, index) => (
                     <div
                        key={player.userId}
                        className={`rounded-2xl border px-4 py-4 ${
                           player.userId === snapshot.viewerUserId
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : "border-slate-800 bg-slate-950/70"
                        }`}>
                        <div className="flex items-center justify-between gap-3">
                           <div>
                              <p className="text-sm text-slate-500">#{index + 1}</p>
                              <p className="text-base font-semibold text-slate-100">
                                 {player.username}
                              </p>
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
                           <div className="mt-3 text-sm text-slate-300">
                              {player.score} correct ·{" "}
                              {(player.totalResponseMs / 1000).toFixed(1)}s
                           </div>
                        )}
                     </div>
                  ))}
               </div>
            </aside>
         </div>
      </div>
   );
}
