"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import {
   BATTLE_DEFAULT_QUESTION_COUNT,
   BATTLE_QUESTION_OPTIONS,
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
   } | null;
};

export default function BattleLobbyPage() {
   const router = useRouter();
   const [decks, setDecks] = useState<PublicDeck[]>([]);
   const [selectedDeckIds, setSelectedDeckIds] = useState<string[]>([]);
   const [questionCount, setQuestionCount] = useState(
      BATTLE_DEFAULT_QUESTION_COUNT,
   );
   const [roomCode, setRoomCode] = useState("");
   const [loadingDecks, setLoadingDecks] = useState(true);
   const [createLoading, setCreateLoading] = useState(false);
   const [joinLoading, setJoinLoading] = useState(false);
   const [history, setHistory] = useState<BattleHistoryEntry[]>([]);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      let cancelled = false;

      const load = async () => {
         const { data: userData } = await supabase.auth.getUser();
         if (!userData.user) {
            router.replace("/login");
            return;
         }

         const token = await getSupabaseAccessToken();
         const [decksResult, historyResult] = await Promise.all([
            supabase
               .from("vocabulary_decks")
               .select(
                  "id, title, description, folder_id, folder:vocabulary_folders(title, slug)",
               )
               .eq("is_public", true)
               .not("folder_id", "is", null)
               .order("title", { ascending: true }),
            fetch("/api/vocabulary-battle/history", {
               headers: {
                  Authorization: `Bearer ${token}`,
               },
               cache: "no-store",
            }),
         ]);

         if (cancelled) return;

         if (decksResult.error) {
            setError("Failed to load public decks.");
            setLoadingDecks(false);
            return;
         }

         const historyPayload = await historyResult.json();
         if (!historyResult.ok) {
            setError(historyPayload.error || "Failed to load battle history.");
         } else {
            setHistory((historyPayload.entries || []) as BattleHistoryEntry[]);
         }

         const deckRows = ((decksResult.data || []) as (PublicDeck & {
            folder?: { title: string; slug: string }[];
         })[]).map((deck) => ({
            id: deck.id,
            title: deck.title,
            description: deck.description,
            folder_id: deck.folder_id,
            folder: deck.folder?.[0]
               ? {
                    title: deck.folder[0].title,
                    slug: deck.folder[0].slug,
                 }
               : null,
         }));
         setDecks(deckRows);
         setSelectedDeckIds(deckRows[0]?.id ? [deckRows[0].id] : []);
         setLoadingDecks(false);
      };

      load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   const deckGroups = useMemo(() => {
      const groups = new Map<
         string,
         { slug: string; title: string; decks: PublicDeck[] }
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
            decks: [deck],
         });
      });

      return Array.from(groups.values()).sort((a, b) =>
         a.title.localeCompare(b.title),
      );
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
            <h1 className="text-3xl font-semibold">Vocabulary battle</h1>
            <p className="max-w-2xl text-sm text-slate-400">
               Create a private head-to-head room, combine one or more public
               decks from folders, and choose how many timed questions to play.
            </p>
         </div>

         {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
               <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Create a room</h2>
                  <p className="text-sm text-slate-400">
                     The room starts automatically when the second player joins.
                  </p>
               </div>

               {loadingDecks ? (
                  <p className="text-sm text-slate-500">
                     Loading folder decks...
                  </p>
               ) : decks.length === 0 ? (
                  <p className="text-sm text-slate-500">
                     No folder-based public decks are available yet.
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
                                 className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                 <p className="text-sm font-semibold text-slate-100">
                                    {group.title}
                                 </p>
                                 <div className="mt-3 grid gap-2">
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
                           Battle will use {questionCount} words from{" "}
                           {selectedDecks.map((deck) => deck.title).join(", ")}.
                        </p>
                     )}

                     <button
                        type="button"
                        onClick={handleCreate}
                        disabled={selectedDeckIds.length === 0 || createLoading}
                        className="cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
                        {createLoading ? "Creating room..." : "Create battle room"}
                     </button>
                  </>
               )}
            </section>

            <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 space-y-5">
               <div className="space-y-1">
                  <h2 className="text-xl font-semibold">Join by code</h2>
                  <p className="text-sm text-slate-400">
                     Ask your opponent for the six-character room code.
                  </p>
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
                     {joinLoading ? "Joining..." : "Join battle"}
                  </button>
               </form>

               <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-400">
                  Match rules: {questionCount} questions, 10 seconds each, same
                  shared set, higher score wins.
               </div>
            </section>
         </div>

         <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 space-y-5">
            <div className="space-y-1">
               <h2 className="text-xl font-semibold">Recent battles</h2>
               <p className="text-sm text-slate-400">
                  Your latest rooms, including unfinished matches and final results.
               </p>
            </div>

            {history.length === 0 ? (
               <p className="text-sm text-slate-500">
                  No battle history yet. Create a room to play your first match.
               </p>
            ) : (
               <div className="grid gap-3">
                  {history.map((entry) => {
                     const winner = entry.players.find(
                        (player) => player.userId === entry.winnerUserId,
                     );

                     return (
                        <div
                           key={entry.roomCode}
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
                              {entry.players.map((player) => (
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
                                 </div>
                              ))}
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}
         </section>
      </div>
   );
}
