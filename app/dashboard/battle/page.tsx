"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
   BattleHistoryEntry,
   normalizeRoomCode,
} from "@/lib/vocabularyBattle";

type PublicDeck = {
   id: string;
   title: string;
   description: string | null;
};

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

export default function BattleLobbyPage() {
   const router = useRouter();
   const [decks, setDecks] = useState<PublicDeck[]>([]);
   const [selectedDeckId, setSelectedDeckId] = useState("");
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

         const token = await getAccessToken();
         const [decksResult, historyResult] = await Promise.all([
            supabase
               .from("vocabulary_decks")
               .select("id, title, description")
               .eq("is_public", true)
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

         const deckRows = (decksResult.data || []) as PublicDeck[];
         setDecks(deckRows);
         setSelectedDeckId(deckRows[0]?.id || "");
         setLoadingDecks(false);
      };

      load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   const handleCreate = async () => {
      try {
         setCreateLoading(true);
         setError(null);

         const token = await getAccessToken();
         const response = await fetch("/api/vocabulary-battle/create", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ deckId: selectedDeckId }),
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

         const token = await getAccessToken();
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
               Create a private head-to-head room, pick one public deck, and
               race through ten timed multiple-choice vocabulary questions.
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
                  <p className="text-sm text-slate-500">Loading public decks...</p>
               ) : decks.length === 0 ? (
                  <p className="text-sm text-slate-500">
                     No public decks are available yet.
                  </p>
               ) : (
                  <>
                     <label className="block space-y-2">
                        <span className="text-sm text-slate-300">Public deck</span>
                        <select
                           value={selectedDeckId}
                           onChange={(event) => setSelectedDeckId(event.target.value)}
                           className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                           {decks.map((deck) => (
                              <option key={deck.id} value={deck.id}>
                                 {deck.title}
                              </option>
                           ))}
                        </select>
                     </label>

                     {selectedDeckId && (
                        <p className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-3 text-sm text-slate-400">
                           {decks.find((deck) => deck.id === selectedDeckId)
                              ?.description || "No description provided."}
                        </p>
                     )}

                     <button
                        type="button"
                        onClick={handleCreate}
                        disabled={!selectedDeckId || createLoading}
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
                  Match rules: 10 questions, 10 seconds each, same deck, same
                  order, higher score wins.
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
