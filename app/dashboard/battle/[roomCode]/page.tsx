"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PiCaretDownBold, PiCrownSimpleFill } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import {
   FOLDER_THEME_MAP,
   type FolderTheme,
} from "@/lib/vocabularyFolderThemes";
import type {
   BattleHistoryEntry,
   BattleRoomSnapshot,
   BattleSubmissionAnswer,
} from "@/lib/vocabularyBattle";

type PublicDeck = {
   id: string;
   title: string;
   description: string | null;
   folder_id: string | null;
   folder: {
      title: string;
      slug: string;
      folder_theme: FolderTheme;
   } | null;
};

type DeckFolderRelation =
   | {
        title: string;
        slug: string;
        folder_theme: FolderTheme;
        is_available_for_battle?: boolean;
      }
   | {
        title: string;
        slug: string;
        folder_theme: FolderTheme;
        is_available_for_battle?: boolean;
      }[]
   | null
   | undefined;

const NATURAL_SORT = new Intl.Collator(undefined, {
   numeric: true,
   sensitivity: "base",
});

type LocalBattleState = {
   roundId: string;
   currentIndex: number;
   questionStartedAt: number;
   answers: BattleSubmissionAnswer[];
   submitted: boolean;
   pendingSubmission: boolean;
};

function createInitialLocalState(roundId: string): LocalBattleState {
   return {
      roundId,
      currentIndex: 0,
      questionStartedAt: Date.now(),
      answers: [],
      submitted: false,
      pendingSubmission: false,
   };
}

function getBattleStorageKey(roomCode: string, roundId: string) {
   return `battle-progress:${roomCode}:${roundId}`;
}

function formatSeconds(ms: number) {
   return `${(ms / 1000).toFixed(1)}s`;
}

function getPremiumNameClass(isPremium: boolean) {
   return isPremium ? "text-amber-100" : "text-slate-100";
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

function RoundHistoryCard({ entry }: { entry: BattleHistoryEntry }) {
   const placements = entry.rewards
      .map((reward) => {
         const player = entry.players.find(
            (roundPlayer) => roundPlayer.userId === reward.userId,
         );

         if (!player) {
            return null;
         }

         return {
            place: reward.place,
            username: player.username,
            curiosityPoints: reward.curiosityPoints,
            isPremium: player.isPremium,
         };
      })
      .filter(
         (
            placement,
         ): placement is {
            place: number;
            username: string;
            curiosityPoints: number;
            isPremium: boolean;
         } => placement !== null,
      );

   return (
      <div className="rounded-3xl border border-slate-800 bg-slate-950/60 p-4">
         <div className="flex items-start justify-between gap-3">
            <div>
               <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Round {entry.roundNumber}
               </p>
               <p className="mt-1 text-sm font-semibold text-slate-100">
                  {entry.deckTitle}
               </p>
               <p className="mt-1 text-xs text-slate-400">
                  {entry.questionCount} questions
               </p>
            </div>
            <p className="text-xs text-slate-400">
               {entry.finishedAt
                  ? new Date(entry.finishedAt).toLocaleString()
                  : "In progress"}
            </p>
         </div>

         {placements.length > 0 ? (
            <div className="mt-4 space-y-2">
               {placements.map((placement) => (
                  <div
                     key={`${entry.roundId}-${placement.place}`}
                     className="flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-3 py-2">
                     <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                           {placement.place === 1 ? "1st place" : "2nd place"}
                        </p>
                        <p
                           className={`truncate text-sm font-semibold ${getPremiumNameClass(
                              placement.isPremium,
                           )}`}>
                           {placement.username}
                        </p>
                     </div>
                     <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                        <Image
                           src="/cp-icon.svg"
                           alt=""
                           aria-hidden="true"
                           width={16}
                           height={16}
                           className="h-4 w-4 shrink-0"
                        />
                        <span>+{placement.curiosityPoints}</span>
                     </div>
                  </div>
               ))}
            </div>
         ) : entry.status === "finished" ? (
            <p className="mt-4 text-xs text-slate-500">
               No winners recorded for this round.
            </p>
         ) : null}
      </div>
   );
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
   const [nextRoundLoading, setNextRoundLoading] = useState(false);
   const [now, setNow] = useState(0);
   const [localBattle, setLocalBattle] = useState<LocalBattleState | null>(null);
   const [availableDecks, setAvailableDecks] = useState<PublicDeck[]>([]);
   const [loadingDecks, setLoadingDecks] = useState(true);
   const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
   const [openFolderSlug, setOpenFolderSlug] = useState<string | null>(null);
   const [isRoundReviewOpen, setIsRoundReviewOpen] = useState(false);
   const [isRoomRulesOpen, setIsRoomRulesOpen] = useState(false);
   const questionTimerRef = useRef<number | null>(null);

   const currentRound = snapshot?.currentRound ?? null;

   useEffect(() => {
      setNow(Date.now());
      const intervalId = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(intervalId);
   }, []);

   useEffect(() => {
      let cancelled = false;

      const loadDecks = async () => {
         const decksResult = await supabase
            .from("vocabulary_decks")
            .select(
               "id, title, description, folder_id, folder:vocabulary_folders(title, slug, folder_theme, is_available_for_battle)",
            )
            .eq("is_public", true)
            .not("folder_id", "is", null)
            .order("title", { ascending: true });

         if (cancelled) return;

         if (decksResult.error) {
            setLoadingDecks(false);
            return;
         }

         const deckRows = ((decksResult.data || []) as (PublicDeck & {
            folder?: DeckFolderRelation;
         })[])
            .map((deck) => {
               const folderRelation = Array.isArray(deck.folder)
                  ? deck.folder[0]
                  : deck.folder;

               return {
                  id: deck.id,
                  title: deck.title,
                  description: deck.description,
                  folder_id: deck.folder_id,
                  folder:
                     folderRelation?.is_available_for_battle === true
                        ? {
                             title: folderRelation.title,
                             slug: folderRelation.slug,
                             folder_theme: folderRelation.folder_theme,
                           }
                         : null,
               };
            })
            .filter((deck) => deck.folder !== null);

         setAvailableDecks(deckRows);
         setLoadingDecks(false);
      };

      void loadDecks();

      return () => {
         cancelled = true;
      };
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
      if (snapshot.roomStatus === "expired" && currentRound?.status === "finished") {
         return false;
      }
      if (!currentRound) return true;
      if (currentRound.status === "waiting") return true;
      if (currentRound.status === "active" && !currentRound.battleStartsAt) return true;
      if (currentRound.status === "active" && currentRound.viewerSubmitted) return true;
      if (snapshot.roomStatus === "open" && currentRound.status === "finished") return true;
      return false;
   }, [currentRound, snapshot]);

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
      if (!snapshot?.deckIds?.length) {
         return;
      }

      setSelectedDeckIds(snapshot.deckIds);
   }, [currentRound?.roundId]);

   useEffect(() => {
      if (
         !snapshot ||
         !currentRound ||
         currentRound.status !== "active" ||
         !currentRound.battleStartsAt ||
         currentRound.viewerSubmitted ||
         !currentRound.viewerIsParticipant
      ) {
         return;
      }

      const startAt = new Date(currentRound.battleStartsAt).getTime();
      if (startAt > now) {
         return;
      }

      const storageKey = getBattleStorageKey(snapshot.roomCode, currentRound.roundId);

      setLocalBattle((current) => {
         if (current?.roundId === currentRound.roundId) {
            return current;
         }

         try {
            const saved = window.localStorage.getItem(storageKey);
            if (saved) {
               const parsed = JSON.parse(saved) as LocalBattleState;
               if (
                  parsed.roundId === currentRound.roundId &&
                  parsed.currentIndex >= 0 &&
                  parsed.currentIndex <= currentRound.questionBank.length
               ) {
                  const normalizedAnswers = Array.isArray(parsed.answers)
                     ? parsed.answers
                     : [];
                  const reachedEnd =
                     parsed.currentIndex >= currentRound.questionBank.length;

                  return {
                     roundId: currentRound.roundId,
                     currentIndex: parsed.currentIndex,
                     questionStartedAt:
                        typeof parsed.questionStartedAt === "number"
                           ? parsed.questionStartedAt
                           : Date.now(),
                     answers: normalizedAnswers,
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

         return createInitialLocalState(currentRound.roundId);
      });
   }, [currentRound, now, snapshot]);

   useEffect(() => {
      if (!snapshot || !currentRound) {
         return;
      }

      const storageKey = getBattleStorageKey(snapshot.roomCode, currentRound.roundId);
      if (
         currentRound.status === "finished" ||
         currentRound.viewerSubmitted ||
         !currentRound.viewerIsParticipant
      ) {
         window.localStorage.removeItem(storageKey);
         return;
      }

      if (!localBattle || localBattle.roundId !== currentRound.roundId) {
         return;
      }

      window.localStorage.setItem(storageKey, JSON.stringify(localBattle));
   }, [currentRound, localBattle, snapshot]);

   const clearQuestionTimer = useCallback(() => {
      if (questionTimerRef.current) {
         window.clearTimeout(questionTimerRef.current);
         questionTimerRef.current = null;
      }
   }, []);

   const submitBattle = useCallback(
      async (answers: BattleSubmissionAnswer[]) => {
         if (!snapshot || !currentRound || submitLoading) return;

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
      [clearQuestionTimer, currentRound, snapshot, submitLoading],
   );

   const advanceBattle = useCallback(
      (selectedOptionIndex: number | null, responseMs: number) => {
         setLocalBattle((current) => {
            if (!current || !currentRound) return current;

            const nextAnswers = [
               ...current.answers,
               {
                  questionIndex: current.currentIndex,
                  selectedOptionIndex,
                  responseMs,
               },
            ];

            if (current.currentIndex + 1 >= currentRound.questionBank.length) {
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
      [currentRound],
   );

   useEffect(() => {
      if (
         !currentRound ||
         currentRound.status !== "active" ||
         currentRound.viewerSubmitted ||
         !localBattle?.pendingSubmission ||
         submitLoading
      ) {
         return;
      }

      void submitBattle(localBattle.answers);
   }, [currentRound, localBattle, submitBattle, submitLoading]);

   const activeQuestion = useMemo(() => {
      if (!currentRound || !localBattle) return null;
      return currentRound.questionBank[localBattle.currentIndex] || null;
   }, [currentRound, localBattle]);

   const localTimeRemaining = useMemo(() => {
      if (!currentRound || !localBattle || !activeQuestion) {
         return currentRound?.timeLimitSeconds
            ? currentRound.timeLimitSeconds * 1000
            : 0;
      }

      const elapsed = now - localBattle.questionStartedAt;
      return Math.max(0, currentRound.timeLimitSeconds * 1000 - elapsed);
   }, [activeQuestion, currentRound, localBattle, now]);

   useEffect(() => {
      if (
         !currentRound ||
         currentRound.status !== "active" ||
         currentRound.viewerSubmitted ||
         !currentRound.viewerIsParticipant ||
         !localBattle ||
         localBattle.pendingSubmission ||
         localBattle.currentIndex >= currentRound.questionBank.length ||
         !activeQuestion
      ) {
         clearQuestionTimer();
         return;
      }

      clearQuestionTimer();
      questionTimerRef.current = window.setTimeout(
         () => {
            advanceBattle(null, currentRound.timeLimitSeconds * 1000);
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
      currentRound,
      localBattle,
      localTimeRemaining,
   ]);

   const countdownMs = useMemo(() => {
      if (!currentRound?.battleStartsAt) return 0;
      return Math.max(0, new Date(currentRound.battleStartsAt).getTime() - now);
   }, [currentRound, now]);

   const completionPercent = useMemo(() => {
      if (!currentRound || !localBattle || currentRound.questionBank.length === 0) {
         return 0;
      }

      return Math.min(
         100,
         (localBattle.answers.length / currentRound.questionBank.length) * 100,
      );
   }, [currentRound, localBattle]);

   const deckGroups = useMemo(() => {
      const groups = new Map<
         string,
         {
            slug: string;
            title: string;
            folder_theme: FolderTheme;
            decks: PublicDeck[];
         }
       >();

      availableDecks.forEach((deck) => {
         if (!deck.folder) return;
         const existing = groups.get(deck.folder.slug);
         if (existing) {
            existing.decks.push(deck);
            return;
         }

         groups.set(deck.folder.slug, {
            slug: deck.folder.slug,
            title: deck.folder.title,
            folder_theme: deck.folder.folder_theme,
            decks: [deck],
         });
      });

      return Array.from(groups.values())
         .sort((a, b) => NATURAL_SORT.compare(a.title, b.title))
         .map((group) => ({
            ...group,
            decks: [...group.decks].sort((a, b) =>
               NATURAL_SORT.compare(a.title, b.title),
            ),
         }));
   }, [availableDecks]);

   const selectedDecks = useMemo(
      () => availableDecks.filter((deck) => selectedDeckIds.includes(deck.id)),
      [availableDecks, selectedDeckIds],
   );

   const handleCopy = async () => {
      await navigator.clipboard.writeText(snapshot?.roomCode || roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
   };

    const toggleDeck = (deckId: string) => {
      setSelectedDeckIds((current) =>
         current.includes(deckId)
            ? current.filter((id) => id !== deckId)
            : [...current, deckId],
      );
   };

   const toggleFolder = (folderSlug: string) => {
      setOpenFolderSlug((current) =>
         current === folderSlug ? null : folderSlug,
      );
   };

   const handleReady = async () => {
      if (!snapshot || !currentRound || readyLoading || currentRound.viewerReady) return;

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
      if (!currentRound || !localBattle || !activeQuestion || submitLoading) return;

      const responseMs = Math.min(
         Math.max(Date.now() - localBattle.questionStartedAt, 0),
         currentRound.timeLimitSeconds * 1000,
      );
      advanceBattle(selectedOptionIndex, responseMs);
   };

   const handleRetrySubmission = () => {
      if (!localBattle?.pendingSubmission || submitLoading) {
         return;
      }

      void submitBattle(localBattle.answers);
   };

   const handleStartNextRound = async () => {
      if (!snapshot || nextRoundLoading) return;

      try {
         setNextRoundLoading(true);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/next-round", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               roomCode: snapshot.roomCode,
               deckIds: selectedDeckIds,
            }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to start the next round.");
         }

         setSnapshot(payload);
         setLocalBattle(null);
         setError(null);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to start the next round.",
         );
      } finally {
         setNextRoundLoading(false);
      }
   };

   const showActiveQuestionOverlay =
      currentRound?.status === "active" &&
      countdownMs <= 0 &&
      !currentRound.viewerSubmitted &&
      currentRound.viewerIsParticipant &&
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

   const hasMinimumPlayers =
      currentRound?.players.length ? currentRound.players.length >= 2 : snapshot.players.length >= 2;
   const everyoneReady =
      currentRound?.status === "waiting"
         ? currentRound.players.length >= 2 &&
           currentRound.players.every((player) => player.isReady)
         : false;
   const winner = currentRound?.players.find(
      (player) => player.userId === currentRound.winnerUserId,
   );

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
                                 Round {currentRound?.roundNumber} • Question{" "}
                                 {(localBattle?.currentIndex ?? 0) + 1} of{" "}
                                 {currentRound?.questionCount}
                              </p>
                           </div>
                           <div className="rounded-full border border-amber-500/35 bg-amber-500/10 px-5 py-3 text-right">
                              <p className="text-2xl font-semibold text-amber-100 sm:text-3xl">
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
                           <div className="rounded-[2rem] border border-sky-400/25 bg-sky-400/10 px-6 py-8 sm:px-8 sm:py-10">
                              <p className="text-center text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                                 {activeQuestion?.prompt}
                              </p>
                           </div>
                        </div>

                        <div className="grid gap-3">
                           {activeQuestion?.options.map((option, index) => (
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
                  </div>
               </div>
            </div>
         )}

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         {snapshot.roomStatus === "expired" && (
            <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 px-5 py-4">
               <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
                  Room expired
               </p>
               <p className="mt-2 text-sm text-amber-100">
                  {snapshot.expirationReason ||
                     "This room has expired. Upgrade to Premium or create a new room to continue playing."}
               </p>
               <div className="mt-4 flex flex-wrap gap-3">
                  <Link
                     href="/premium"
                     className="rounded-full bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-300">
                     View Premium
                  </Link>
                  <Link
                     href="/dashboard/battle"
                     className="rounded-full border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/10">
                     Create new room
                  </Link>
               </div>
            </div>
         )}

         <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
            <section className="space-y-6">
               <div className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_42%),radial-gradient(circle_at_right,_rgba(56,189,248,0.12),_transparent_32%)]" />
                  <div className="relative flex flex-wrap items-start justify-between gap-4">
                     <div>
                        <Link
                           href="/dashboard/battle"
                           className="text-sm text-slate-400 transition hover:text-slate-200">
                           &larr; Back to battle lobby
                        </Link>
                        <p className="mt-4 text-xs uppercase tracking-[0.28em] text-emerald-300/90">
                           Battle room code
                        </p>
                        <h1 className="mt-2 bg-gradient-to-r from-white via-emerald-100 to-cyan-200 bg-clip-text text-3xl font-semibold text-transparent">
                           {snapshot.roomCode}
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm text-slate-400">
                           {snapshot.deckTitle} • {snapshot.questionCount} questions •{" "}
                           {snapshot.timeLimitSeconds}s per question • {snapshot.completedRoundCount} round
                           {snapshot.completedRoundCount === 1 ? "" : "s"} completed
                        </p>
                     </div>

                     <button
                        type="button"
                        onClick={handleCopy}
                        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
                        {copied ? "Copied" : "Copy room code"}
                     </button>
                  </div>
               </div>

               {currentRound?.status === "waiting" && (
                  <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                     <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                           Round {currentRound.roundNumber}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                           Waiting room
                        </h2>
                        <p className="mt-2 text-sm text-slate-300">
                           Players stay in the same room and can keep battling here. Once at least 2 players are
                           ready, the next countdown begins.
                        </p>
                     </div>

                     <div className="grid gap-4 md:grid-cols-2">
                        {currentRound.players.map((player) => (
                           <div
                              key={player.userId}
                              className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
                              <div className="flex items-center gap-2">
                                 <p
                                    className={`text-lg font-semibold ${getPremiumNameClass(
                                       player.isPremium,
                                    )}`}>
                                    {player.username}
                                 </p>
                                 {player.isPremium && (
                                    <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100/80">
                                       Premium
                                    </span>
                                 )}
                              </div>
                              <p className="mt-2 text-sm text-slate-400">
                                 {player.isReady ? "Ready to start" : "Not ready yet"}
                              </p>
                           </div>
                        ))}
                     </div>

                     {!hasMinimumPlayers && (
                        <p className="text-sm text-slate-400">
                           Waiting for more players to join. At least 2 players are needed to start a round.
                        </p>
                     )}

                     {currentRound.viewerIsParticipant ? (
                        <>
                           {hasMinimumPlayers && !currentRound.viewerReady && (
                              <button
                                 type="button"
                                 onClick={handleReady}
                                 disabled={readyLoading}
                                 className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                                 {readyLoading ? "Loading..." : "I'm ready"}
                              </button>
                           )}

                           {currentRound.viewerReady && !everyoneReady && (
                              <p className="text-sm text-slate-300">
                                 You are ready. Waiting for the remaining players.
                              </p>
                           )}
                        </>
                     ) : (
                        <p className="text-sm text-slate-300">
                           You joined the room after this round setup began. Wait here and you will be included in the next round.
                        </p>
                     )}
                  </div>
               )}

               {currentRound?.status === "active" && countdownMs > 0 && (
                  <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 text-center">
                     <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                        Round {currentRound.roundNumber} countdown
                     </p>
                     <p className="mt-4 text-7xl font-semibold text-slate-50">
                        {Math.ceil(countdownMs / 1000)}
                     </p>
                     <p className="mx-auto mt-3 max-w-lg text-sm text-slate-300">
                        Everyone is ready. The battle opens when the countdown reaches zero.
                     </p>
                  </div>
               )}

               {currentRound?.status === "active" &&
                  (currentRound.viewerSubmitted ||
                     submitLoading ||
                     localBattle?.pendingSubmission) && (
                     <div className="rounded-[2rem] border border-emerald-500/30 bg-emerald-500/10 p-6">
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                           {currentRound.viewerSubmitted
                              ? "Results sent"
                              : submitLoading
                                ? "Submitting answers"
                                : "Submission pending"}
                        </p>
                        <p className="mt-3 text-2xl font-semibold text-slate-50">
                           {currentRound.viewerSubmitted
                              ? "Your round is complete."
                              : "Your answers are ready to send."}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                           {currentRound.viewerSubmitted
                              ? "Waiting for the remaining players so we can calculate round results and Curiosity Points."
                              : "We will keep trying until the server confirms your submission."}
                        </p>
                        {!currentRound.viewerSubmitted && !submitLoading && (
                           <button
                              type="button"
                              onClick={handleRetrySubmission}
                              className="mt-4 cursor-pointer rounded-full border border-emerald-400/40 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/10">
                              Retry submission
                           </button>
                        )}
                     </div>
                  )}

               {currentRound?.status === "active" &&
                  !currentRound.viewerIsParticipant &&
                  !currentRound.viewerSubmitted && (
                     <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
                           Round in progress
                        </p>
                        <p className="mt-3 text-xl font-semibold text-slate-50">
                           You are in the room, but this round already started before you joined.
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                           Stay in the room and you will be included automatically when the next round starts.
                        </p>
                     </div>
                  )}

               {currentRound?.status === "finished" && (
                  <div className="space-y-6">
                     <div className="relative overflow-hidden rounded-[2rem] border border-emerald-500/30 bg-emerald-500/10 p-6">
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                           <span className="absolute left-[10%] top-5 h-2 w-2 rotate-12 rounded-sm bg-amber-300/70" />
                           <span className="absolute left-[24%] top-10 h-3 w-1 rounded-full bg-emerald-300/60" />
                           <span className="absolute right-[14%] top-8 h-2 w-2 -rotate-12 rounded-sm bg-cyan-300/70" />
                           <span className="absolute right-[28%] top-5 h-1.5 w-1.5 rounded-full bg-fuchsia-300/70" />
                           <span className="absolute left-[18%] bottom-10 h-1.5 w-4 rotate-[32deg] rounded-full bg-amber-200/55" />
                           <span className="absolute right-[22%] bottom-12 h-1.5 w-4 -rotate-[28deg] rounded-full bg-emerald-200/55" />
                           <span className="absolute bottom-4 left-1/2 h-2 w-2 rounded-sm bg-sky-300/55" />
                        </div>

                        <div className="relative">
                           <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                              Round {currentRound.roundNumber} finished
                           </p>
                           {!winner && (
                              <p className="mt-3 text-3xl font-semibold text-slate-50">
                                 This round ended in a tie
                              </p>
                           )}
                        </div>
                        <div className="mt-5 grid gap-3">
                           {currentRound.players.map((player, index) => {
                              const reward = currentRound.rewards.find(
                                 (entry) => entry.userId === player.userId,
                              );
                              const placeLabel = `${index + 1}${
                                 index === 0
                                    ? "st"
                                    : index === 1
                                      ? "nd"
                                      : index === 2
                                        ? "rd"
                                        : "th"
                              } place`;

                              return (
                                 <div
                                    key={player.userId}
                                    className={`rounded-2xl border p-4 ${
                                       player.isPremium
                                          ? "border-amber-400/30 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(251,191,36,0.06),rgba(15,23,42,0.84))]"
                                          : "border-slate-800 bg-slate-900/70"
                                    }`}>
                                    <div className="flex items-start justify-between gap-3">
                                       <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                             {index === 0 && winner && (
                                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-400/35 bg-amber-400/15 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.16)]">
                                                   <PiCrownSimpleFill size={16} />
                                                </span>
                                             )}
                                             <p className="text-sm text-slate-500">
                                                {placeLabel}
                                             </p>
                                          </div>
                                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                                             <p
                                                className={`truncate text-lg font-semibold ${getPremiumNameClass(
                                                   player.isPremium,
                                                )}`}>
                                                {player.username}
                                             </p>
                                             <span className="text-sm font-medium text-emerald-200">
                                                {player.score} correct answers
                                             </span>
                                             <span className="text-sm font-medium text-emerald-200">
                                                {formatSeconds(player.totalResponseMs)}
                                             </span>
                                          </div>
                                       </div>

                                       <div className="flex items-center gap-2 text-emerald-200">
                                          {reward ? (
                                             <>
                                                <Image
                                                   src="/cp-icon.svg"
                                                   alt=""
                                                   aria-hidden="true"
                                                   width={18}
                                                   height={18}
                                                   className="h-[18px] w-[18px] shrink-0"
                                                />
                                                <span className="text-sm font-semibold">
                                                   +{reward.curiosityPoints} CP
                                                </span>
                                             </>
                                          ) : (
                                             <span />
                                          )}
                                       </div>
                                    </div>
                                 </div>
                              );
                           })}
                        </div>
                        {currentRound.rewards.length === 0 && (
                           <p className="mt-4 text-sm text-slate-300">
                              This round ended in a tie, so no Curiosity Points were awarded.
                           </p>
                        )}
                     </div>

                     {snapshot.viewerIsHost && snapshot.roomStatus === "open" && (
                        <div className="space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                           <div>
                              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                                 Next round setup
                              </p>
                              <p className="mt-2 text-sm text-slate-300">
                                 Choose which decks to use before starting the next round.
                              </p>
                           </div>

                           {loadingDecks ? (
                              <p className="text-sm text-slate-500">Loading available decks...</p>
                           ) : (
                              <div className="space-y-3">
                                 {deckGroups.map((group) => (
                                     <div
                                        key={group.slug}
                                        className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                        <div
                                           className={`absolute inset-0 bg-gradient-to-br ${
                                              (
                                                 FOLDER_THEME_MAP[group.folder_theme] ||
                                                 FOLDER_THEME_MAP.ocean
                                              ).accent
                                           }`}
                                        />
                                        <div className="absolute -right-6 top-4 h-20 w-20 rounded-full blur-3xl">
                                           <div
                                              className={`h-full w-full rounded-full ${
                                                 (
                                                    FOLDER_THEME_MAP[group.folder_theme] ||
                                                    FOLDER_THEME_MAP.ocean
                                                 ).glow
                                              }`}
                                           />
                                        </div>
                                        <button
                                           type="button"
                                           onClick={() => toggleFolder(group.slug)}
                                           className="relative flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-900/50">
                                           <span className="flex min-w-0 items-center gap-3">
                                              <span
                                                 className={`text-slate-400 transition-transform ${
                                                    openFolderSlug === group.slug ? "rotate-180" : ""
                                                 }`}>
                                                 <PiCaretDownBold size={14} />
                                              </span>
                                              <span className="inline-flex h-10 w-24 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-3">
                                                 <Image
                                                    src={
                                                       (
                                                          FOLDER_THEME_MAP[group.folder_theme] ||
                                                          FOLDER_THEME_MAP.ocean
                                                       ).logoSrc
                                                    }
                                                    alt={`${group.title} logo`}
                                                    width={160}
                                                    height={64}
                                                    className="h-6 w-full object-contain"
                                                 />
                                              </span>
                                              <span className="truncate text-sm font-semibold text-slate-100">
                                                 {group.title}
                                              </span>
                                           </span>
                                           <span className="relative text-xs text-slate-300">
                                              {group.decks.length} deck{group.decks.length === 1 ? "" : "s"}
                                           </span>
                                        </button>

                                        {openFolderSlug === group.slug && (
                                           <div className="relative mt-3 grid gap-2">
                                             {group.decks.map((deck) => {
                                                const checked = selectedDeckIds.includes(deck.id);

                                                return (
                                                   <label
                                                      key={deck.id}
                                                      className={`flex cursor-pointer gap-3 rounded-2xl border px-4 py-3 transition ${
                                                         checked
                                                            ? "border-emerald-500/50 bg-emerald-500/10"
                                                            : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
                                                      }`}>
                                                      <input
                                                         type="checkbox"
                                                         checked={checked}
                                                         onChange={() => toggleDeck(deck.id)}
                                                         className="mt-1 h-4 w-4 rounded border-slate-600 bg-slate-950 text-emerald-500"
                                                      />
                                                      <span className="min-w-0">
                                                         <span className="block text-sm font-medium text-slate-100">
                                                            {deck.title}
                                                         </span>
                                                         <span className="block text-xs text-slate-400">
                                                            {deck.description || "No description provided."}
                                                         </span>
                                                      </span>
                                                   </label>
                                                );
                                             })}
                                          </div>
                                       )}
                                    </div>
                                 ))}
                              </div>
                           )}

                           {selectedDecks.length > 0 && (
                              <p className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-400">
                                 Next round will use {selectedDecks.map((deck) => deck.title).join(", ")}.
                              </p>
                           )}

                           <button
                              type="button"
                              onClick={handleStartNextRound}
                              disabled={nextRoundLoading || selectedDeckIds.length === 0}
                              className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                              {nextRoundLoading ? "Creating next round..." : "Start next round"}
                           </button>
                        </div>
                     )}

                     {!snapshot.viewerIsHost && snapshot.roomStatus === "open" && (
                        <p className="text-sm text-slate-300">
                           Waiting for the host to start the next round.
                        </p>
                     )}

                     <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/40">
                        <button
                           type="button"
                           onClick={() => setIsRoundReviewOpen((current) => !current)}
                           className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-slate-900/40">
                           <div>
                              <h3 className="text-lg font-semibold text-slate-50">
                                 Round review
                              </h3>
                              <p className="mt-1 text-sm text-slate-400">
                                 Review each question from the finished round.
                              </p>
                           </div>
                           <span
                              className={`text-slate-400 transition-transform ${
                                 isRoundReviewOpen ? "rotate-180" : ""
                              }`}>
                              <PiCaretDownBold size={16} />
                           </span>
                        </button>

                        {isRoundReviewOpen && (
                           <div className="space-y-4 border-t border-slate-800 px-5 py-5">
                              {currentRound.completedQuestions.map((question) => {
                                 const viewerAnswer = question.answers.find(
                                    (answer) => answer.userId === snapshot.viewerUserId,
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
                                                viewerAnswer?.selectedOptionIndex === index;

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
                        )}
                     </div>
                  </div>
               )}
            </section>

            <aside className="space-y-6">
               <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                  <div className="flex items-center justify-between">
                     <h2 className="text-lg font-semibold text-slate-50">Room players</h2>
                     <span className="text-xs uppercase tracking-[0.2em] text-slate-500">
                        {snapshot.players.length} total
                     </span>
                  </div>

                  <div className="mt-4 space-y-3">
                     {snapshot.players.map((player) => {
                        return (
                           <div
                              key={player.userId}
                              className={`rounded-3xl border px-4 py-4 ${
                                 player.userId === snapshot.viewerUserId
                                    ? "border-emerald-500/40 bg-emerald-500/10"
                                    : "border-slate-800 bg-slate-950/70"
                              }`}>
                              <div className="flex items-center justify-between gap-3">
                                 <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                       <p
                                          className={`text-base font-semibold ${getPremiumNameClass(
                                             player.isPremium,
                                          )}`}>
                                          {player.username}
                                       </p>
                                       {player.isPremium && (
                                          <span className="rounded-full border border-amber-400/25 bg-amber-400/8 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-100/80">
                                             Premium
                                          </span>
                                       )}
                                    </div>
                                 </div>
                              </div>
                           </div>
                        );
                     })}
                  </div>
               </div>

               <div className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/60 text-sm text-slate-400">
                  <button
                     type="button"
                     onClick={() => setIsRoomRulesOpen((current) => !current)}
                     className="flex w-full cursor-pointer items-center justify-between gap-3 px-6 py-5 text-left transition hover:bg-slate-900/40">
                     <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                           Room rules
                        </p>
                        <p className="mt-2 text-sm text-slate-400">
                           Open to see how rounds and access work.
                        </p>
                     </div>
                     <span
                        className={`text-slate-400 transition-transform ${
                           isRoomRulesOpen ? "rotate-180" : ""
                        }`}>
                        <PiCaretDownBold size={16} />
                     </span>
                  </button>

                  {isRoomRulesOpen && (
                     <div className="space-y-2 border-t border-slate-800 px-6 py-5">
                        <p>Same room code across multiple rounds</p>
                        <p>{snapshot.questionCount} questions per round</p>
                        <p>{snapshot.timeLimitSeconds} seconds per question</p>
                        <p>Curiosity Points are awarded every round</p>
                        <p>
                           After 5 rounds, every player in the room must be Premium to continue
                        </p>
                     </div>
                  )}
               </div>

               {snapshot.recentRounds.length > 0 && (
                  <div className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
                     <h2 className="text-lg font-semibold text-slate-50">Recent rounds</h2>
                     <div className="mt-4 space-y-3">
                        {snapshot.recentRounds.map((entry) => (
                           <RoundHistoryCard key={entry.roundId} entry={entry} />
                        ))}
                     </div>
                  </div>
               )}
            </aside>
         </div>
      </div>
   );
}
