"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PiCaretDownBold, PiSwordLight } from "react-icons/pi";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import {
   FOLDER_THEME_MAP,
   type FolderTheme,
} from "@/lib/vocabularyFolderThemes";
import {
   BATTLE_DEFAULT_QUESTION_COUNT,
   BATTLE_QUESTION_OPTIONS,
   BattleQuestionCount,
   BattleHistoryEntry,
   normalizeRoomCode,
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

type ActiveBattleRoomSummary = {
   roomCode: string;
   deckTitle: string;
   playerCount: number;
   currentRoundStatus: "waiting" | "active" | "finished" | null;
   roundNumber: number | null;
};

function getCuriosityPointReward(index: number) {
   if (index === 0) return 20;
   if (index === 1) return 10;
   return 0;
}

export default function BattleLobbyPage() {
   const router = useRouter();
   const [decks, setDecks] = useState<PublicDeck[]>([]);
   const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
   const [openFolderSlug, setOpenFolderSlug] = useState<string | null>(null);
   const [questionCount, setQuestionCount] = useState<BattleQuestionCount>(
      BATTLE_DEFAULT_QUESTION_COUNT,
   );
   const [roomCode, setRoomCode] = useState("");
   const [loadingDecks, setLoadingDecks] = useState(true);
   const [createLoading, setCreateLoading] = useState(false);
   const [joinLoading, setJoinLoading] = useState(false);
   const [history, setHistory] = useState<BattleHistoryEntry[]>([]);
   const [showHistory, setShowHistory] = useState(false);
   const [loadingHistory, setLoadingHistory] = useState(false);
   const [historyLoaded, setHistoryLoaded] = useState(false);
   const [activeRoom, setActiveRoom] = useState<ActiveBattleRoomSummary | null>(null);
   const [loadingActiveRoom, setLoadingActiveRoom] = useState(true);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         const { data: userData } = await supabase.auth.getUser();
         if (!userData.user) {
            router.replace("/login");
            return;
         }

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
            setError("Failed to load public decks.");
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
         setDecks(deckRows);
         setSelectedDeckIds([]);
         setOpenFolderSlug(null);
         setLoadingDecks(false);
      };

      load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   useEffect(() => {
      let cancelled = false;

      const loadActiveRoom = async () => {
         try {
            setLoadingActiveRoom(true);
            const token = await getSupabaseAccessToken();
            const response = await fetch("/api/vocabulary-battle/active-room", {
               headers: {
                  Authorization: `Bearer ${token}`,
               },
               cache: "no-store",
            });

            const payload = await response.json();
            if (!response.ok) {
               throw new Error(payload.error || "Failed to load active room.");
            }

            if (cancelled) return;
            setActiveRoom((payload.room || null) as ActiveBattleRoomSummary | null);
         } catch (requestError) {
            if (cancelled) return;

            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load active room.",
            );
         } finally {
            if (!cancelled) {
               setLoadingActiveRoom(false);
            }
         }
      };

      void loadActiveRoom();

      return () => {
         cancelled = true;
      };
   }, []);

   const activeRoomStatusLabel = useMemo(() => {
      if (!activeRoom?.currentRoundStatus) {
         return "Room available";
      }

      if (activeRoom.currentRoundStatus === "waiting") {
         return `Round ${activeRoom.roundNumber ?? "?"} waiting`;
      }

      if (activeRoom.currentRoundStatus === "active") {
         return `Round ${activeRoom.roundNumber ?? "?"} in progress`;
      }

      return `Round ${activeRoom.roundNumber ?? "?"} finished`;
   }, [activeRoom]);

   const loadHistory = async () => {
      if (loadingHistory || historyLoaded) return;

      try {
         setLoadingHistory(true);
         setError(null);

         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/history", {
            headers: {
               Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to load battle history.");
         }

         setHistory((payload.entries || []) as BattleHistoryEntry[]);
         setHistoryLoaded(true);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load battle history.",
         );
      } finally {
         setLoadingHistory(false);
      }
   };

   const handleToggleHistory = () => {
      const nextShowHistory = !showHistory;
      setShowHistory(nextShowHistory);

      if (nextShowHistory && !historyLoaded) {
         void loadHistory();
      }
   };

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

      decks.forEach((deck) => {
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
   }, [decks]);

   const selectedDecks = useMemo(
      () => decks.filter((deck) => selectedDeckIds.includes(deck.id)),
      [decks, selectedDeckIds],
   );

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

   const handleCreate = async () => {
      try {
         setCreateLoading(true);
         setError(null);

         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/create", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               deckIds: selectedDeckIds,
               questionCount,
            }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to create battle.");
         }

         router.push(`/dashboard/battle/${payload.roomCode}`);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to create battle.",
         );
      } finally {
         setCreateLoading(false);
      }
   };

   const handleJoin = async (event: FormEvent) => {
      event.preventDefault();

      try {
         setJoinLoading(true);
         setError(null);

         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/vocabulary-battle/join", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ roomCode: normalizeRoomCode(roomCode) }),
         });

         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to join battle.");
         }

         router.push(`/dashboard/battle/${payload.roomCode}`);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to join battle.",
         );
      } finally {
         setJoinLoading(false);
      }
   };

   return (
      <div className="space-y-8">
         <div className="space-y-2">
            <div className="flex items-center gap-3">
               <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-300">
                  <PiSwordLight size={28} />
               </div>
               <h1 className="text-3xl font-semibold">Vocabulary battle</h1>
            </div>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
               <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Join by code</h2>
               </div>

               <form onSubmit={handleJoin} className="space-y-4">
                  <label className="block space-y-2">
                     <span className="text-sm text-slate-300">Room code</span>
                     <input
                        type="text"
                        value={roomCode}
                        onChange={(event) =>
                           setRoomCode(normalizeRoomCode(event.target.value))
                        }
                        maxLength={6}
                        placeholder="AB12CD"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm uppercase tracking-[0.3em] outline-none focus:border-emerald-500"
                     />
                  </label>

                  <button
                     type="submit"
                     disabled={roomCode.length !== 6 || joinLoading}
                     className="cursor-pointer rounded-full border border-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60">
                     {joinLoading ? "Joining..." : "Join room"}
                  </button>
               </form>

               <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-4">
                  {loadingActiveRoom ? (
                     <p className="text-sm text-slate-500">
                        Checking whether you already have an open room...
                     </p>
                  ) : activeRoom ? (
                     <div className="space-y-3">
                        <div className="space-y-1">
                           <p className="text-sm font-semibold text-slate-100">
                              Your current room
                           </p>
                           <p className="text-sm text-slate-400">
                              {activeRoom.deckTitle}
                           </p>
                           <p className="text-xs text-slate-500">
                              Code {activeRoom.roomCode} · {activeRoom.playerCount} player
                              {activeRoom.playerCount === 1 ? "" : "s"} ·{" "}
                              {activeRoomStatusLabel}
                           </p>
                        </div>

                        <button
                           type="button"
                           onClick={() =>
                              router.push(`/dashboard/battle/${activeRoom.roomCode}`)
                           }
                           className="cursor-pointer rounded-full border border-sky-500 px-5 py-3 text-sm font-semibold text-sky-300 transition hover:bg-sky-500/10">
                           Re-enter room
                        </button>
                     </div>
                  ) : (
                     <p className="text-sm text-slate-500">
                        You are not currently in any open battle room.
                     </p>
                  )}
               </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
               <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Create a room</h2>
               </div>

               {loadingDecks ? (
                  <p className="text-sm text-slate-500">
                     Loading folder decks...
                  </p>
               ) : decks.length === 0 ? (
                  <p className="text-sm text-slate-500">
                     No battle-enabled folder decks are available yet.
                  </p>
               ) : (
                  <>
                     <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                           <span className="text-sm text-slate-300">
                              Decks from folders
                           </span>
                           <span className="text-xs text-slate-500">
                              {selectedDeckIds.length} selected
                           </span>
                        </div>

                        <div className="space-y-4">
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
                                     className="relative flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-900/50">
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
                                        {openFolderSlug === group.slug
                                           ? "Click to collapse"
                                           : `${group.decks.length} deck${group.decks.length === 1 ? "" : "s"} - click to expand`}
                                     </span>
                                  </button>

                                  {openFolderSlug === group.slug && (
                                     <div className="relative mt-3 grid gap-2">
                                        {group.decks.map((deck) => {
                                          const checked = selectedDeckIds.includes(
                                             deck.id,
                                          );

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
                                                      {deck.description ||
                                                         "No description provided."}
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
                     </div>

                     <div className="space-y-3">
                        <span className="text-sm text-slate-300">
                           Number of words
                        </span>
                        <div className="flex flex-wrap gap-2">
                           {BATTLE_QUESTION_OPTIONS.map((option) => (
                              <button
                                 key={option}
                                 type="button"
                                 onClick={() => setQuestionCount(option)}
                                 className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-medium transition ${
                                    questionCount === option
                                       ? "border-emerald-500 bg-emerald-500 text-slate-950"
                                       : "border-slate-700 bg-slate-950 text-slate-300 hover:border-emerald-500/40"
                                 }`}>
                                 {option}
                              </button>
                           ))}
                        </div>
                     </div>

                     {selectedDecks.length > 0 && (
                        <p className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-400">
                           The room will use {questionCount} words from{" "}
                           {selectedDecks.map((deck) => deck.title).join(", ")}.
                        </p>
                     )}

                     <button
                        type="button"
                        onClick={handleCreate}
                        disabled={selectedDeckIds.length === 0 || createLoading}
                        className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                        {createLoading ? "Creating room..." : "Create room"}
                     </button>
                  </>
               )}
            </section>
         </div>

         <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
            <div className="space-y-1">
               <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">Recent rounds</h2>
                  <button
                     type="button"
                     onClick={handleToggleHistory}
                     className="cursor-pointer rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition hover:bg-slate-800">
                     {showHistory ? "Hide history" : "Show history"}
                  </button>
               </div>
            </div>

            {!showHistory ? (
               <p className="text-sm text-slate-500">
                  Round history
               </p>
            ) : loadingHistory ? (
               <p className="text-sm text-slate-500">Loading battle history...</p>
            ) : history.length === 0 ? (
               <p className="text-sm text-slate-500">
                  No round history yet. Create a room to play your first match.
               </p>
            ) : (
               <div className="grid gap-3">
                  {history.map((entry) => {
                     const sortedPlayers = [...entry.players].sort((a, b) => {
                        if (b.score !== a.score) return b.score - a.score;
                        return a.totalResponseMs - b.totalResponseMs;
                     });
                     const winner = sortedPlayers.find(
                        (player) => player.userId === entry.winnerUserId,
                     );
                     const awardedPlayers =
                        entry.status === "finished" && winner
                           ? sortedPlayers
                                .map((player, index) => ({
                                   ...player,
                                   curiosityPointReward:
                                      getCuriosityPointReward(index),
                                }))
                                .filter(
                                   (player) => player.curiosityPointReward > 0,
                                )
                           : [];

                     return (
                        <div
                           key={entry.roundId}
                           className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                           <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                 <p className="text-sm text-slate-500">
                                    {new Date(entry.createdAt).toLocaleString()}
                                 </p>
                                 <p className="text-base font-semibold text-slate-100">
                                    {entry.deckTitle}
                                 </p>
                                 <p className="text-sm text-slate-400">
                                    Room {entry.roomCode} · {entry.questionCount} questions
                                 </p>
                              </div>

                              <div className="text-right">
                                 <p className="text-sm font-medium text-slate-300">
                                    {entry.status === "finished"
                                       ? winner
                                          ? `${winner.username} won`
                                          : "Tie"
                                       : entry.status === "active"
                                         ? "In progress"
                                         : "Waiting"}
                                 </p>
                                 <Link
                                    href={`/dashboard/battle/${entry.roomCode}`}
                                    className="mt-2 inline-flex rounded-full border border-slate-700 px-3 py-2 text-xs text-slate-200 transition hover:bg-slate-800">
                                    Open room
                                 </Link>
                              </div>
                           </div>

                           <div className="mt-4 grid gap-2 md:grid-cols-2">
                              {sortedPlayers.map((player, index) => {
                                 const reward =
                                    entry.rewards.find(
                                       (value) => value.userId === player.userId,
                                    )?.curiosityPoints || getCuriosityPointReward(index);

                                 return (
                                 <div
                                    key={player.userId}
                                    className="rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3 text-sm text-slate-300">
                                    <div className="flex items-center justify-between gap-3">
                                       <span>{player.username}</span>
                                       <span>{player.score} correct</span>
                                    </div>
                                    <p className="mt-1 text-xs text-slate-500">
                                       Total time {(player.totalResponseMs / 1000).toFixed(1)}s
                                    </p>
                                    {entry.status === "finished" && reward > 0 && winner && (
                                       <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-200">
                                          <Image
                                             src="/cp-icon.svg"
                                             alt=""
                                             aria-hidden="true"
                                             width={14}
                                             height={14}
                                             className="h-3.5 w-3.5 shrink-0"
                                          />
                                          <span>+{reward} CP</span>
                                       </div>
                                    )}
                                 </div>
                                 );
                              })}
                           </div>

                           {entry.status === "finished" && !winner && (
                              <p className="mt-3 text-xs text-slate-500">
                                 No Curiosity Points awarded because the match ended in a tie.
                              </p>
                           )}

                           {awardedPlayers.length > 0 && (
                              <p className="mt-3 text-xs text-slate-500">
                                 Curiosity Points were awarded to the top 2 finishers.
                              </p>
                           )}
                        </div>
                     );
                  })}
               </div>
            )}
         </section>
      </div>
   );
}
