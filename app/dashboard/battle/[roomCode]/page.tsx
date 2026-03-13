"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { BattleRoomSnapshot } from "@/lib/vocabularyBattle";

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

export default function BattleRoomPage() {
   const params = useParams();
   const router = useRouter();
   const roomCode = params.roomCode as string;

   const [snapshot, setSnapshot] = useState<BattleRoomSnapshot | null>(null);
   const [loading, setLoading] = useState(true);
   const [answerLoading, setAnswerLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [copied, setCopied] = useState(false);
   const [now, setNow] = useState(0);
   const [isPageHidden, setIsPageHidden] = useState(false);
   const latestQuestionKey = useRef<string>("");

   useEffect(() => {
      setNow(Date.now());
      const handleVisibilityChange = () => {
         setIsPageHidden(document.visibilityState !== "visible");
      };
      handleVisibilityChange();

      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
         document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
   }, []);

   const pollMs = useMemo(() => {
      if (!snapshot) return 1000;
      if (snapshot.status === "active") {
         return snapshot.viewerHasAnsweredCurrentQuestion ? 500 : 900;
      }

      return snapshot.status === "waiting" ? 1500 : 5000;
   }, [snapshot]);

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         try {
            const { data: userData } = await supabase.auth.getUser();
            if (!userData.user) {
               router.replace("/login");
               return;
            }

            const token = await getAccessToken();
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

            if (!cancelled) {
               setSnapshot(payload);
               setError(null);
               setLoading(false);
            }
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

      load();
      const intervalId = window.setInterval(() => {
         if (isPageHidden) return;
         void load();
      }, pollMs);

      return () => {
         cancelled = true;
         window.clearInterval(intervalId);
      };
   }, [isPageHidden, pollMs, roomCode, router]);

   useEffect(() => {
      const intervalId = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(intervalId);
   }, []);

   useEffect(() => {
      if (!snapshot) return;

      const questionKey = `${snapshot.currentQuestionIndex}:${snapshot.phaseStartedAt}`;
      if (latestQuestionKey.current !== questionKey) {
         latestQuestionKey.current = questionKey;
         setAnswerLoading(false);
      }
   }, [snapshot]);

   const msRemaining = useMemo(() => {
      if (!snapshot?.phaseStartedAt || snapshot.status !== "active") {
         return 0;
      }

      const phaseStartedAt = new Date(snapshot.phaseStartedAt).getTime();
      if (phaseStartedAt > now) {
         return 0;
      }

      const deadline = phaseStartedAt + snapshot.timeLimitSeconds * 1000;

      return Math.max(0, deadline - now);
   }, [now, snapshot]);

   const countdownMs = useMemo(() => {
      if (!snapshot?.phaseStartedAt || snapshot.status !== "active") {
         return 0;
      }

      return Math.max(0, new Date(snapshot.phaseStartedAt).getTime() - now);
   }, [now, snapshot]);

   const displayedQuestion =
      snapshot?.questionBank[snapshot.currentQuestionIndex] ||
      snapshot?.currentQuestion ||
      null;

   const sortedPlayers = useMemo(
      () =>
         [...(snapshot?.players || [])].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.joinedAt.localeCompare(b.joinedAt);
         }),
      [snapshot],
   );

   const handleCopy = async () => {
      await navigator.clipboard.writeText(snapshot?.roomCode || roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
   };

   const handleAnswer = async (selectedOptionIndex: number) => {
      if (!snapshot || snapshot.viewerHasAnsweredCurrentQuestion || answerLoading) {
         return;
      }

      try {
         setAnswerLoading(true);
         setError(null);

         const token = await getAccessToken();
         const response = await fetch("/api/vocabulary-battle/answer", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               roomCode: snapshot.roomCode,
               selectedOptionIndex,
            }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to submit answer.");
         }

         setSnapshot(payload);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to submit answer.",
         );
         setAnswerLoading(false);
      }
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
   const viewerPosition =
      sortedPlayers.findIndex((player) => player.userId === snapshot.viewerUserId) +
      1;

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
               <p className="text-sm text-slate-400">
                  Room <span className="font-semibold text-slate-200">{snapshot.roomCode}</span>
               </p>
            </div>

            <button
               type="button"
               onClick={handleCopy}
               className="cursor-pointer rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
               {copied ? "Code copied" : "Copy room code"}
            </button>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
               {snapshot.status === "waiting" && (
                  <div className="space-y-4">
                     <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
                        <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                           Waiting for opponent
                        </p>
                        <p className="mt-2 text-lg text-slate-100">
                           Share room code <span className="font-semibold">{snapshot.roomCode}</span> to start the match.
                        </p>
                     </div>
                     <p className="text-sm text-slate-400">
                        The battle begins as soon as the second player joins.
                     </p>
                  </div>
               )}

               {snapshot.status === "active" && displayedQuestion && (
                  <div className="space-y-6">
                     <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                           <p className="text-sm uppercase tracking-[0.2em] text-slate-400">
                              Question {snapshot.currentQuestionIndex + 1} of{" "}
                              {snapshot.questionCount}
                           </p>
                           <h2 className="mt-2 text-3xl font-semibold">
                              {displayedQuestion.prompt}
                           </h2>
                        </div>

                        <div className="rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200">
                           {countdownMs > 0
                              ? `Starts in ${Math.ceil(countdownMs / 1000)}s`
                              : `${Math.ceil(msRemaining / 1000)}s left`}
                        </div>
                     </div>

                     {countdownMs > 0 ? (
                        <div className="rounded-3xl border border-emerald-500/30 bg-emerald-500/10 px-6 py-10 text-center">
                           <p className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                              Battle starts soon
                           </p>
                           <p className="mt-3 text-6xl font-semibold text-slate-50">
                              {Math.ceil(countdownMs / 1000)}
                           </p>
                           <p className="mt-3 text-sm text-slate-300">
                              Questions are preloaded. The first round will open
                              automatically.
                           </p>
                        </div>
                     ) : (
                        <div className="grid gap-3">
                           {displayedQuestion.options.map((option, index) => {
                           const isSelected =
                              snapshot.viewerSelectedOptionIndex === index;
                           const isLocked =
                              snapshot.viewerHasAnsweredCurrentQuestion ||
                              answerLoading ||
                              msRemaining === 0;

                           return (
                              <button
                                 key={`${index}-${option}`}
                                 type="button"
                                 onClick={() => handleAnswer(index)}
                                 disabled={isLocked}
                                 className={`cursor-pointer rounded-2xl border px-4 py-4 text-left text-sm transition ${
                                    isSelected
                                       ? "border-emerald-400 bg-emerald-500/10 text-emerald-100"
                                       : "border-slate-800 bg-slate-950/70 text-slate-200 hover:border-slate-600 hover:bg-slate-900"
                                 } disabled:cursor-not-allowed disabled:opacity-75`}>
                                 {option}
                              </button>
                           );
                           })}
                        </div>
                     )}

                     <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3 text-sm text-slate-400">
                        {countdownMs > 0
                           ? "Get ready. The first timer has not started yet."
                           : snapshot.viewerHasAnsweredCurrentQuestion
                           ? "Answer locked in. Waiting for the next question."
                           : msRemaining === 0
                             ? "Time is up. Waiting for the room to advance."
                             : "Choose the correct meaning before the timer expires."}
                     </div>
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
                           {((viewer?.totalResponseMs || 0) / 1000).toFixed(1)}s ·
                           place #{viewerPosition}
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

                                 <div className="flex flex-wrap gap-3 text-xs text-slate-400">
                                    <span>
                                       Your answer:{" "}
                                       {viewerAnswer
                                          ? viewerAnswer.selectedOptionIndex !== null
                                             ? question.options[
                                                  viewerAnswer.selectedOptionIndex
                                               ]
                                             : "No answer"
                                          : "No answer"}
                                    </span>
                                    <span>
                                       Result:{" "}
                                       {viewerAnswer?.isCorrect ? "Correct" : "Incorrect"}
                                    </span>
                                    <span>
                                       Time:{" "}
                                       {viewerAnswer
                                          ? `${(viewerAnswer.responseMs / 1000).toFixed(1)}s`
                                          : "0.0s"}
                                    </span>
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
                  <h2 className="text-lg font-semibold">Scoreboard</h2>
                  <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                     Live
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
                           <div className="text-right">
                              <p className="text-2xl font-semibold text-slate-50">
                                 {player.score}
                              </p>
                              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                 correct
                              </p>
                            </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                           Total time {(player.totalResponseMs / 1000).toFixed(1)}s
                        </p>
                     </div>
                  ))}
               </div>
            </aside>
         </div>
      </div>
   );
}
