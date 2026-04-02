"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PiCaretDownBold, PiCheckCircleFill, PiCrownSimpleFill } from "react-icons/pi";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { supabase } from "@/lib/supabaseClient";
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

type JoinAnnouncementPayload = {
   roomId: string;
   roomCode: string;
   viewerUserId: string;
   viewerIsRoomMember: boolean;
   username: string;
   isPremium: boolean;
   joinedAt: string;
};

type BattleBroadcastPayload =
   | {
        kind: "snapshot-refresh";
        roomCode: string;
        sentAt: string;
     }
   | {
        kind: "player-joined";
        roomCode: string;
        userId: string;
        username: string;
        isPremium: boolean;
        joinedAt: string;
     }
   | {
        kind: "player-ready";
        roomCode: string;
        roundId: string;
        userId: string;
        readyAt: string;
     }
   | {
        kind: "player-submitted";
        roomCode: string;
        roundId: string;
        userId: string;
        submittedAt: string;
     }
   | {
        kind: "next-round-started";
        roomCode: string;
        sentAt: string;
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

function getPlayerCardClass(isViewer: boolean, isPremium: boolean) {
   if (isPremium) {
      return "border-amber-400/40 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(30,41,59,0.92))]";
   }

   return "border-slate-800 bg-slate-950/70";
}

function getWaitingRoomNameClass(isViewer: boolean, isPremium: boolean) {
   if (isViewer) {
      return "text-emerald-300";
   }

   if (isPremium) {
      return "text-amber-100";
   }

   return "text-slate-100";
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

function isSessionExpiredMessage(message: string) {
   return (
      message === "You must sign in again." ||
      message === "Failed to read your session." ||
      message === "Unauthorized."
   );
}

function applyBattleBroadcastToSnapshot(
   snapshot: BattleRoomSnapshot,
   payload: BattleBroadcastPayload,
): BattleRoomSnapshot {
   if (payload.roomCode !== snapshot.roomCode) {
      return snapshot;
   }

   if (payload.kind === "player-joined") {
      const alreadyInRoom = snapshot.players.some(
         (player) => player.userId === payload.userId,
      );

      if (alreadyInRoom) {
         return snapshot;
      }

      return {
         ...snapshot,
         players: [
            ...snapshot.players,
            {
               userId: payload.userId,
               username: payload.username,
               isPremium: payload.isPremium,
               joinedAt: payload.joinedAt,
            },
         ],
      };
   }

   if (!snapshot.currentRound) {
      return snapshot;
   }

   if (
      (payload.kind === "player-ready" || payload.kind === "player-submitted") &&
      payload.roundId !== snapshot.currentRound.roundId
   ) {
      return snapshot;
   }

   if (payload.kind === "player-ready") {
      return {
         ...snapshot,
         currentRound: {
            ...snapshot.currentRound,
            viewerReady:
               snapshot.viewerUserId === payload.userId
                  ? true
                  : snapshot.currentRound.viewerReady,
            players: snapshot.currentRound.players.map((player) =>
               player.userId === payload.userId
                  ? {
                       ...player,
                       isReady: true,
                       readyAt: payload.readyAt,
                    }
                  : player,
            ),
         },
      };
   }

   if (payload.kind === "player-submitted") {
      return {
         ...snapshot,
         currentRound: {
            ...snapshot.currentRound,
            viewerSubmitted:
               snapshot.viewerUserId === payload.userId
                  ? true
                  : snapshot.currentRound.viewerSubmitted,
            players: snapshot.currentRound.players.map((player) =>
               player.userId === payload.userId
                  ? {
                       ...player,
                       submittedAt: payload.submittedAt,
                    }
                  : player,
            ),
         },
      };
   }

   return snapshot;
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
   const [forceFinishLoading, setForceFinishLoading] = useState(false);
   const [removingPlayerId, setRemovingPlayerId] = useState<string | null>(null);
   const [now, setNow] = useState(0);
   const [localBattle, setLocalBattle] = useState<LocalBattleState | null>(null);
   const [availableDecks, setAvailableDecks] = useState<PublicDeck[]>([]);
   const [loadingDecks, setLoadingDecks] = useState(true);
   const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
   const [openFolderSlug, setOpenFolderSlug] = useState<string | null>(null);
   const [isRoundReviewOpen, setIsRoundReviewOpen] = useState(false);
   const [isRoomRulesOpen, setIsRoomRulesOpen] = useState(false);
   const questionTimerRef = useRef<number | null>(null);
   const syncedDeckSourceRef = useRef<string | null>(null);
   const countdownScrollKeyRef = useRef<string | null>(null);
   const joinAnnouncementRef = useRef<string | null>(null);
   const joinAnnouncementPayloadRef = useRef<JoinAnnouncementPayload | null>(null);
   const snapshotRequestIdRef = useRef(0);
   const realtimeRefreshTimeoutRef = useRef<number | null>(null);
   const roomChannelRef = useRef<RealtimeChannel | null>(null);

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

   const handleSnapshotError = useCallback(
      (requestError: unknown) => {
         const message =
            requestError instanceof Error
               ? requestError.message
               : "Failed to load battle room.";
         const status =
            requestError instanceof Error &&
            "status" in requestError &&
            typeof requestError.status === "number"
               ? requestError.status
               : null;

         if (isSessionExpiredMessage(message) || status === 401) {
            router.replace("/login");
            return;
         }

         setError(message);
         setLoading(false);
      },
      [router],
   );

   const loadSnapshot = useCallback(async () => {
      const requestId = snapshotRequestIdRef.current + 1;
      snapshotRequestIdRef.current = requestId;
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
         const requestError = new Error(
            payload.error || "Failed to load battle room.",
         ) as Error & { status?: number };
         requestError.status = response.status;
         throw requestError;
      }

      if (snapshotRequestIdRef.current !== requestId) {
         return;
      }

      setSnapshot(payload);
      setError(null);
      setLoading(false);
   }, [roomCode]);

   useEffect(() => {
      const load = async () => {
         try {
            await loadSnapshot();
         } catch (requestError) {
            handleSnapshotError(requestError);
         }
      };

      void load();
   }, [handleSnapshotError, loadSnapshot]);

   const refreshSnapshot = useCallback(async () => {
      try {
         await loadSnapshot();
      } catch (requestError) {
         handleSnapshotError(requestError);
      }
   }, [handleSnapshotError, loadSnapshot]);

   const scheduleSnapshotRefresh = useCallback(
      (delayMs = 120) => {
         if (realtimeRefreshTimeoutRef.current) {
            window.clearTimeout(realtimeRefreshTimeoutRef.current);
         }

         realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
            realtimeRefreshTimeoutRef.current = null;
            void refreshSnapshot();
         }, delayMs);
      },
      [refreshSnapshot],
   );

   const broadcastRoomUpdate = useCallback(async (payload: BattleBroadcastPayload) => {
      const channel = roomChannelRef.current;
      if (!channel) {
         return;
      }

      await channel.send({
         type: "broadcast",
         event: "room-update",
         payload,
      });
   }, []);

   useEffect(() => {
      return () => {
         if (realtimeRefreshTimeoutRef.current) {
            window.clearTimeout(realtimeRefreshTimeoutRef.current);
            realtimeRefreshTimeoutRef.current = null;
         }
      };
   }, []);

   useEffect(() => {
      if (!snapshot?.roomId || !snapshot.viewerUserId) {
         joinAnnouncementPayloadRef.current = null;
         return;
      }

      const viewer = snapshot.players.find(
         (player) => player.userId === snapshot.viewerUserId,
      );

      if (!viewer) {
         joinAnnouncementPayloadRef.current = null;
         return;
      }

      joinAnnouncementPayloadRef.current = {
         roomId: snapshot.roomId,
         roomCode: snapshot.roomCode,
         viewerUserId: snapshot.viewerUserId,
         viewerIsRoomMember: snapshot.viewerIsRoomMember,
         username: viewer.username,
         isPremium: viewer.isPremium,
         joinedAt: viewer.joinedAt,
      };
   }, [
      snapshot?.players,
      snapshot?.roomCode,
      snapshot?.roomId,
      snapshot?.viewerIsRoomMember,
      snapshot?.viewerUserId,
   ]);

   useEffect(() => {
      if (!snapshot?.roomId) {
         return;
      }

      const roomChannel = supabase.channel(`battle-room:${snapshot.roomId}`);
      roomChannelRef.current = roomChannel;
      const handleRoomChange = () => scheduleSnapshotRefresh();

      roomChannel
         .on("broadcast", { event: "room-update" }, ({ payload }) => {
            const roomUpdate = payload as BattleBroadcastPayload;

            setSnapshot((current) =>
               current ? applyBattleBroadcastToSnapshot(current, roomUpdate) : current,
            );
            scheduleSnapshotRefresh(0);
         })
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_rooms",
            filter: `id=eq.${snapshot.roomId}`,
         }, handleRoomChange)
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_room_players",
            filter: `room_id=eq.${snapshot.roomId}`,
         }, handleRoomChange)
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_rounds",
            filter: `room_id=eq.${snapshot.roomId}`,
         }, handleRoomChange)
         .subscribe((status) => {
            if (status === "SUBSCRIBED") {
               void refreshSnapshot();

               const joinPayload = joinAnnouncementPayloadRef.current;

               if (
                  joinPayload?.viewerIsRoomMember &&
                  joinPayload.roomId === snapshot.roomId &&
                  joinAnnouncementRef.current !==
                     `${joinPayload.roomId}:${joinPayload.viewerUserId}`
               ) {
                  joinAnnouncementRef.current =
                     `${joinPayload.roomId}:${joinPayload.viewerUserId}`;
                  void broadcastRoomUpdate({
                     kind: "player-joined",
                     roomCode: joinPayload.roomCode,
                     userId: joinPayload.viewerUserId,
                     username: joinPayload.username,
                     isPremium: joinPayload.isPremium,
                     joinedAt: joinPayload.joinedAt,
                  });
               }
            }

            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
               scheduleSnapshotRefresh(0);
            }
         });

      return () => {
         if (roomChannelRef.current === roomChannel) {
            roomChannelRef.current = null;
         }
         void supabase.removeChannel(roomChannel);
      };
   }, [
      broadcastRoomUpdate,
      refreshSnapshot,
      scheduleSnapshotRefresh,
      snapshot?.roomId,
   ]);

   useEffect(() => {
      if (!currentRound?.roundId) {
         return;
      }

      const roundChannel = supabase.channel(`battle-round:${currentRound.roundId}`);
      const handleRoundChange = () => scheduleSnapshotRefresh();

      roundChannel
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_round_players",
            filter: `round_id=eq.${currentRound.roundId}`,
         }, handleRoundChange)
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_round_questions",
            filter: `round_id=eq.${currentRound.roundId}`,
         }, handleRoundChange)
         .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "vocab_battle_round_answers",
            filter: `round_id=eq.${currentRound.roundId}`,
         }, handleRoundChange)
         .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
               scheduleSnapshotRefresh(0);
            }
         });

      return () => {
         void supabase.removeChannel(roundChannel);
      };
   }, [currentRound?.roundId, scheduleSnapshotRefresh]);

   useEffect(() => {
      const handleVisibilityChange = () => {
         if (document.visibilityState === "visible") {
            scheduleSnapshotRefresh(0);
         }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("focus", handleVisibilityChange);

      return () => {
         document.removeEventListener("visibilitychange", handleVisibilityChange);
         window.removeEventListener("focus", handleVisibilityChange);
      };
   }, [scheduleSnapshotRefresh]);

   useEffect(() => {
      if (!snapshot?.deckIds?.length) {
         return;
      }

      const deckSourceKey = currentRound?.roundId || `room:${snapshot.roomCode}`;
      if (syncedDeckSourceRef.current === deckSourceKey) {
         return;
      }

      setSelectedDeckIds(snapshot.deckIds);
      syncedDeckSourceRef.current = deckSourceKey;
   }, [currentRound?.roundId, snapshot?.deckIds, snapshot?.roomCode]);

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
            void broadcastRoomUpdate({
               kind: "player-submitted",
               roomCode: snapshot.roomCode,
               roundId: currentRound.roundId,
               userId: payload.viewerUserId,
               submittedAt: new Date().toISOString(),
            });
         } catch (requestError) {
            if (
               requestError instanceof Error &&
               isSessionExpiredMessage(requestError.message)
            ) {
               router.replace("/login");
               return;
            }

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
      [
         broadcastRoomUpdate,
         clearQuestionTimer,
         currentRound,
         router,
         snapshot,
         submitLoading,
      ],
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
         void broadcastRoomUpdate({
            kind: "player-ready",
            roomCode: snapshot.roomCode,
            roundId: currentRound.roundId,
            userId: payload.viewerUserId,
            readyAt: new Date().toISOString(),
         });
      } catch (requestError) {
         if (
            requestError instanceof Error &&
            isSessionExpiredMessage(requestError.message)
         ) {
            router.replace("/login");
            return;
         }

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
         void broadcastRoomUpdate({
            kind: "next-round-started",
            roomCode: snapshot.roomCode,
            sentAt: new Date().toISOString(),
         });
      } catch (requestError) {
         if (
            requestError instanceof Error &&
            isSessionExpiredMessage(requestError.message)
         ) {
            router.replace("/login");
            return;
         }

         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to start the next round.",
         );
      } finally {
         setNextRoundLoading(false);
      }
   };

   const handleForceFinishRound = async () => {
      if (!snapshot || !currentRound || forceFinishLoading) return;

      const shouldContinue = window.confirm(
         "Force-finish this round and show results with the submissions received so far?",
      );

      if (!shouldContinue) {
         return;
      }

      try {
         setForceFinishLoading(true);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/force-finish", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               roomCode: snapshot.roomCode,
            }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to force-finish round.");
         }

         setSnapshot(payload);
         setError(null);
         void broadcastRoomUpdate({
            kind: "snapshot-refresh",
            roomCode: snapshot.roomCode,
            sentAt: new Date().toISOString(),
         });
      } catch (requestError) {
         if (
            requestError instanceof Error &&
            isSessionExpiredMessage(requestError.message)
         ) {
            router.replace("/login");
            return;
         }

         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to force-finish round.",
         );
      } finally {
         setForceFinishLoading(false);
      }
   };

   const handleRemovePlayer = async (targetUserId: string, username: string) => {
      if (!snapshot || removingPlayerId) return;

      const shouldContinue = window.confirm(
         `Remove ${username} from this room? They will also be removed from the current unfinished round.`,
      );

      if (!shouldContinue) {
         return;
      }

      try {
         setRemovingPlayerId(targetUserId);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/remove-player", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               roomCode: snapshot.roomCode,
               targetUserId,
            }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to remove player.");
         }

         setSnapshot(payload);
         setError(null);
         void broadcastRoomUpdate({
            kind: "snapshot-refresh",
            roomCode: snapshot.roomCode,
            sentAt: new Date().toISOString(),
         });
      } catch (requestError) {
         if (
            requestError instanceof Error &&
            isSessionExpiredMessage(requestError.message)
         ) {
            router.replace("/login");
            return;
         }

         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to remove player.",
         );
      } finally {
         setRemovingPlayerId(null);
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

   useEffect(() => {
      const countdownKey =
         currentRound?.status === "active" && countdownMs > 0
            ? `${currentRound.roundId}:${currentRound.battleStartsAt ?? ""}`
            : null;

      if (countdownKey && countdownScrollKeyRef.current !== countdownKey) {
         window.scrollTo({ top: 0, behavior: "smooth" });
      }

      countdownScrollKeyRef.current = countdownKey;
   }, [countdownMs, currentRound]);

   if (loading) {
      return (
         <div className="flex min-h-[70vh] items-center justify-center px-4">
            <div className="flex w-fit items-center gap-4 rounded-full border border-slate-800 bg-slate-950/80 px-5 py-4 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
               <Image
                  src="/logo-text-white.png"
                  alt=""
                  aria-hidden="true"
                  width={180}
                  height={40}
                  className="h-8 w-auto opacity-90 animate-pulse"
               />
               <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin" />
            </div>
         </div>
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

   const hasMinimumPlayers =
      currentRound?.players.length ? currentRound.players.length >= 2 : snapshot.players.length >= 2;
   const everyoneReady =
      currentRound?.status === "waiting"
         ? currentRound.players.length >= 2 &&
           currentRound.players.every((player) => player.isReady)
         : false;
   const showFloatingReadyButton =
      currentRound?.status === "waiting" &&
      currentRound.viewerIsParticipant &&
      hasMinimumPlayers &&
      !currentRound.viewerReady;
   const winner = currentRound?.players.find(
      (player) => player.userId === currentRound.winnerUserId,
   );

   return (
      <div className="space-y-6">
         {showFloatingReadyButton && (
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.25rem)] sm:bottom-6 sm:px-6 lg:px-8">
               <div className="mx-auto flex w-full max-w-5xl justify-center">
                  <button
                     type="button"
                     onClick={handleReady}
                     disabled={readyLoading}
                     className="pointer-events-auto w-full max-w-sm cursor-pointer rounded-full bg-emerald-500 px-5 py-4 text-sm font-semibold text-slate-950 shadow-[0_18px_40px_rgba(16,185,129,0.28)] transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                     {readyLoading ? "Loading..." : "I'm ready"}
                  </button>
               </div>
            </div>
         )}

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

               {currentRound && currentRound.status !== "finished" && (
                  <div
                     className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 space-y-5">
                     <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">
                           Round {currentRound.roundNumber}
                        </p>
                        <h2 className="mt-2 text-2xl font-semibold text-slate-50">
                           {currentRound.status === "waiting"
                              ? "Waiting room"
                              : "Round in progress"}
                        </h2>
                        {currentRound.status === "waiting" && (
                           <p className="mt-2 text-sm text-slate-300">
                              Players stay in the same room and can keep battling here. Once at least 2 players are ready, the next countdown begins.
                           </p>
                        )}
                     </div>

                     <div className="grid gap-4 md:grid-cols-2">
                        {currentRound.players.map((player) => {
                           const isViewer = player.userId === snapshot.viewerUserId;

                           return (
                           <div
                              key={player.userId}
                              className={`rounded-3xl border bg-slate-950/70 p-5 ${
                                 player.isPremium
                                    ? "border-amber-400/40"
                                    : "border-slate-800"
                              }`}>
                              <div className="flex items-center gap-2">
                                 <p
                                    className={`text-lg font-semibold ${getWaitingRoomNameClass(
                                       isViewer,
                                       player.isPremium,
                                    )}`}>
                                    {player.username}
                                 </p>
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                                 {currentRound.status === "waiting" && player.isReady && (
                                    <span className="text-emerald-300">
                                       <PiCheckCircleFill size={14} />
                                    </span>
                                 )}
                                 <span>
                                    {currentRound.status === "waiting"
                                       ? player.isReady
                                          ? "Ready to start"
                                          : "Not ready yet"
                                       : player.submittedAt
                                         ? `${player.score} correct in ${formatSeconds(
                                              player.totalResponseMs,
                                           )}`
                                         : "Still playing"}
                                 </span>
                              </div>
                           </div>
                           );
                        })}
                     </div>

                     {currentRound.status === "waiting" && !hasMinimumPlayers && (
                        <p className="text-sm text-slate-400">
                           Waiting for more players to join. At least 2 players are needed to start a round.
                        </p>
                     )}

                     {currentRound.status === "waiting" && currentRound.viewerIsParticipant ? (
                        <>
                           {currentRound.viewerReady && !everyoneReady && (
                              <p className="text-sm text-slate-300">
                                 You are ready. Waiting for the remaining players.
                              </p>
                           )}
                        </>
                     ) : currentRound.status === "waiting" ? (
                        <p className="text-sm text-slate-300">
                           You joined the room after this round setup began. Wait here and you will be included in the next round.
                        </p>
                     ) : !currentRound.viewerIsParticipant ? (
                        <p className="text-sm text-slate-300">
                           You joined after this round started, so you are watching this round and will be added to the next one.
                        </p>
                     ) : null}

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

               {snapshot.viewerIsHost && currentRound?.status === "active" && (
                  <div className="rounded-[2rem] border border-amber-500/25 bg-amber-500/10 p-6">
                     <p className="text-xs uppercase tracking-[0.3em] text-amber-200">
                        Host controls
                     </p>
                     <p className="mt-2 text-sm text-amber-100">
                        If someone has stopped playing, you can force-finish the round and reveal results using the answers submitted so far.
                     </p>
                     <button
                        type="button"
                        onClick={handleForceFinishRound}
                        disabled={forceFinishLoading}
                        className="mt-4 cursor-pointer rounded-full border border-amber-300/40 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-60">
                        {forceFinishLoading ? "Finishing round..." : "Force finish round"}
                     </button>
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
                        const isViewer = player.userId === snapshot.viewerUserId;

                        return (
                           <div
                              key={player.userId}
                              className={`rounded-3xl border px-4 py-4 ${getPlayerCardClass(
                                 isViewer,
                                 player.isPremium,
                              )}`}>
                              <div className="flex items-start justify-between gap-3">
                                 <div className="min-w-0">
                                    <p
                                       className={`truncate text-base font-semibold ${getPremiumNameClass(
                                          player.isPremium,
                                       )}`}>
                                       {player.username}
                                    </p>
                                 </div>

                                 {snapshot.viewerIsHost && !isViewer && (
                                    <button
                                       type="button"
                                       onClick={() =>
                                          handleRemovePlayer(player.userId, player.username)
                                       }
                                       disabled={removingPlayerId === player.userId}
                                       className="rounded-full border border-red-400/30 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60">
                                       {removingPlayerId === player.userId
                                          ? "Removing"
                                          : "Remove"}
                                    </button>
                                 )}
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
