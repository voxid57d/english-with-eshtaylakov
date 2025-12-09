"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";

import PracticeView from "@/components/vocabulary/PracticeView";
import { useSRS, CardWithHealth, COOLDOWN_MS } from "@/app/hooks/useSRS";

// Types for deck + raw card data from DB
type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   requires_premium: boolean;
};

type CardRow = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
   transcription: string | null;
};

function formatCooldown(ms: number): string {
   const mins = Math.floor(ms / 60000);
   const secs = Math.floor((ms % 60000) / 1000);
   if (mins <= 0 && secs <= 0) return "soon";
   return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export default function DeckPage() {
   const params = useParams();
   const deckId = params.deckId as string;

   const [deck, setDeck] = useState<Deck | null>(null);
   const [loadingDeck, setLoadingDeck] = useState(true);

   const [rawCards, setRawCards] = useState<CardWithHealth[]>([]);
   const [cardsLoading, setCardsLoading] = useState(true);

   const [userId, setUserId] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);
   const [locked, setLocked] = useState(false);

   const [addingCard, setAddingCard] = useState(false);
   const [newWord, setNewWord] = useState("");
   const [newDefinition, setNewDefinition] = useState("");
   const [newExample, setNewExample] = useState("");
   const [cardSaving, setCardSaving] = useState(false);
   const [cardError, setCardError] = useState<string | null>(null);
   const [deletingId, setDeletingId] = useState<string | null>(null);

   // For live countdowns (grid + practice message)
   const [now, setNow] = useState(Date.now());
   useEffect(() => {
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
   }, []);

   // SRS hook – drives practice queue + cooldown + current card
   const {
      state: srsState,
      startPractice,
      stopPractice,
      flipCard,
      answer,
      setGrindMode,
      setSwipe,
   } = useSRS(rawCards);

   // ----- 1. Load user + deck + premium -----
   useEffect(() => {
      const loadDeck = async () => {
         setLoadingDeck(true);

         const { data: userData, error: userError } =
            await supabase.auth.getUser();

         if (userError) {
            console.error("Error fetching user:", userError);
         }

         let premium = false;
         let uid: string | null = null;

         if (userData?.user) {
            uid = userData.user.id;
            premium = await getPremiumStatus(uid);
            setUserId(uid);
            setIsPremium(premium);
         }

         const { data: deckData, error: deckError } = await supabase
            .from("vocabulary_decks")
            .select("id, title, description, is_public, requires_premium")
            .eq("id", deckId)
            .single();

         if (deckError) {
            console.error("Error loading deck:", deckError);
            setDeck(null);
         } else if (deckData) {
            const d = deckData as Deck;
            setDeck(d);
            if (d.requires_premium && !premium) {
               setLocked(true);
            }
         }

         setLoadingDeck(false);
      };

      loadDeck();
   }, [deckId]);

   // ----- 2. Load cards + progress from Supabase -----
   useEffect(() => {
      const fetchCards = async () => {
         if (!userId || locked) {
            setCardsLoading(false);
            return;
         }

         setCardsLoading(true);

         // Load all cards in this deck
         const { data: cardsData, error: cardsError } = await supabase
            .from("vocabulary_cards")
            .select("id, front, back, example_sentence, transcription")
            .eq("deck_id", deckId)
            .order("id", { ascending: true });

         if (cardsError) {
            console.error("Error loading cards:", cardsError);
            setRawCards([]);
            setCardsLoading(false);
            return;
         }

         if (!cardsData || cardsData.length === 0) {
            setRawCards([]);
            setCardsLoading(false);
            return;
         }

         const ids = (cardsData as CardRow[]).map((c) => c.id);

         // Load per-card progress for this user
         const { data: progressData, error: progressError } = await supabase
            .from("vocabulary_card_progress")
            .select("card_id, health, last_reviewed_at")
            .eq("user_id", userId)
            .in("card_id", ids);

         if (progressError) {
            console.error("Error loading progress:", progressError);
         }

         const progressMap = new Map<
            string,
            { health: number; lastReviewed: string | null }
         >();
         (progressData || []).forEach((row) => {
            progressMap.set(row.card_id, {
               health: row.health ?? 1,
               lastReviewed: row.last_reviewed_at,
            });
         });

         const cardsWithHealth: CardWithHealth[] = (cardsData as CardRow[]).map(
            (card) => {
               const p = progressMap.get(card.id);
               let health = 1;
               let cooldownUntil: number | null = null;

               if (p) {
                  health = p.health ?? 1;
                  if (p.lastReviewed) {
                     const last = new Date(p.lastReviewed).getTime();
                     const until = last + COOLDOWN_MS;
                     if (until > Date.now()) {
                        cooldownUntil = until;
                     }
                  }
               }

               return {
                  ...card,
                  health,
                  cooldownUntil,
               };
            }
         );

         setRawCards(cardsWithHealth);
         setCardsLoading(false);
      };

      fetchCards();
   }, [deckId, userId, locked]);

   // ----- 3. Derive all cards from SRS state (queue + cooldown) for the grid -----
   const allCardsForGrid: CardWithHealth[] = useMemo(() => {
      const map = new Map<string, CardWithHealth>();
      [...srsState.practiceQueue, ...srsState.cooldownList].forEach((c) => {
         map.set(c.id, c);
      });

      // If SRS hasn’t loaded yet (e.g. at mount), fall back to rawCards
      if (map.size === 0 && rawCards.length > 0) {
         rawCards.forEach((c) => map.set(c.id, c));
      }

      return Array.from(map.values()).sort(
         (a, b) => a.health - b.health || a.front.localeCompare(b.front)
      );
   }, [srsState.practiceQueue, srsState.cooldownList, rawCards]);

   const hasAnyCards = allCardsForGrid.length > 0;

   // ----- 4. Add & delete cards -----
   const handleAddCard = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newWord.trim() || !newDefinition.trim()) {
         setCardError("Word and definition are required.");
         return;
      }

      setCardSaving(true);
      setCardError(null);

      const { data, error } = await supabase
         .from("vocabulary_cards")
         .insert({
            deck_id: deckId,
            front: newWord.trim(),
            back: newDefinition.trim(),
            example_sentence: newExample.trim() || null,
         })
         .select("id, front, back, example_sentence, transcription")
         .single();

      if (error) {
         console.error("Error adding card:", error);
         setCardError("Failed to add card.");
         setCardSaving(false);
         return;
      }

      if (data) {
         const newCard: CardWithHealth = {
            ...(data as CardRow),
            health: 1,
            cooldownUntil: null,
         };

         // Update rawCards → triggers SRS reload via useSRS
         setRawCards((prev) => [...prev, newCard]);
      }

      setNewWord("");
      setNewDefinition("");
      setNewExample("");
      setAddingCard(false);
      setCardSaving(false);
   };

   const handleDeleteCard = async (cardId: string) => {
      if (!confirm("Delete this card?")) return;

      setDeletingId(cardId);
      const { error } = await supabase
         .from("vocabulary_cards")
         .delete()
         .eq("id", cardId);

      if (error) {
         console.error("Error deleting card:", error);
         alert("Failed to delete card.");
         setDeletingId(null);
         return;
      }

      // Remove locally → SRS will reload from new rawCards
      setRawCards((prev) => prev.filter((c) => c.id !== cardId));
      setDeletingId(null);
   };

   // ----- 5. Answer handler: combine SRS + DB update -----
   const handleAnswer = async (known: boolean) => {
      const current = srsState.currentCard;
      if (!current || !userId) return;

      const oldHealth = current.health;
      const newHealth = known
         ? Math.min(oldHealth + 1, 4)
         : Math.max(oldHealth - 1, 0);

      // First update SRS state (queue, cooldown, next card)
      answer(known);

      // Then persist to Supabase
      const { error } = await supabase.from("vocabulary_card_progress").upsert(
         {
            user_id: userId,
            card_id: current.id,
            deck_id: deckId,
            health: newHealth,
            last_reviewed_at: new Date().toISOString(),
         },
         { onConflict: "user_id,card_id" }
      );

      if (error) {
         console.error("Error saving progress:", error);
      }
   };

   // ----- 6. Render -----
   if (loadingDeck) {
      return <div className="text-slate-400">Loading deck...</div>;
   }

   if (!deck) {
      return <div className="text-slate-400">Deck not found.</div>;
   }

   if (locked) {
      return (
         <div className="space-y-6">
            <Link
               href="/dashboard/vocabulary"
               className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition">
               ← Back to vocabulary
            </Link>

            <h1 className="text-2xl font-semibold">{deck.title}</h1>
            <p className="text-slate-400">
               This deck is only available for{" "}
               <span className="text-amber-300">premium users</span>.
            </p>

            <div className="flex gap-3">
               <Link
                  href="/premium"
                  className="cursor-pointer px-4 py-2 rounded-full bg-emerald-500 text-slate-900 font-medium">
                  Go premium
               </Link>
               <Link
                  href="/dashboard/vocabulary"
                  className="cursor-pointer px-4 py-2 rounded-full bg-slate-800 text-slate-100">
                  Back to vocabulary
               </Link>
            </div>
         </div>
      );
   }

   return (
      <div className="space-y-6">
         {/* Back link */}
         <Link
            href="/dashboard/vocabulary"
            className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition">
            ← Back to decks
         </Link>

         {/* Header */}
         <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
               <h1 className="text-2xl font-semibold">{deck.title}</h1>
               {deck.description && (
                  <p className="text-sm text-slate-400 mt-1">
                     {deck.description}
                  </p>
               )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
               <button
                  onClick={() => {
                     if (srsState.isPracticing) {
                        stopPractice();
                     } else {
                        startPractice();
                     }
                  }}
                  disabled={!hasAnyCards}
                  className="cursor-pointer px-4 py-2 rounded-full border border-emerald-500 text-sm font-medium
                     text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition">
                  {srsState.isPracticing ? "Stop practice" : "Start practice"}
               </button>

               {!deck.is_public && (
                  <button
                     onClick={() => {
                        setAddingCard((prev) => !prev);
                        setCardError(null);
                     }}
                     className="cursor-pointer px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-sm font-medium text-slate-950 transition">
                     {addingCard ? "Cancel" : "+ Add card"}
                  </button>
               )}
            </div>
         </div>

         {/* Add card form */}
         {addingCard && (
            <form
               onSubmit={handleAddCard}
               className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
               {cardError && (
                  <p className="text-sm text-red-400">{cardError}</p>
               )}

               <div className="space-y-1">
                  <label className="block text-sm text-slate-300">Word</label>
                  <input
                     type="text"
                     value={newWord}
                     onChange={(e) => setNewWord(e.target.value)}
                     className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                     placeholder="e.g. tremendous"
                  />
               </div>

               <div className="space-y-1">
                  <label className="block text-sm text-slate-300">
                     Definition
                  </label>
                  <textarea
                     value={newDefinition}
                     onChange={(e) => setNewDefinition(e.target.value)}
                     className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none"
                     rows={3}
                     placeholder="e.g. very great in amount, scale, or intensity"
                  />
               </div>

               <div className="space-y-1">
                  <label className="block text-sm text-slate-300">
                     Example sentence (optional)
                  </label>
                  <textarea
                     value={newExample}
                     onChange={(e) => setNewExample(e.target.value)}
                     className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none"
                     rows={2}
                     placeholder="e.g. She made a tremendous effort to learn English."
                  />
               </div>

               <div className="flex items-center gap-3">
                  <button
                     type="submit"
                     disabled={cardSaving}
                     className="cursor-pointer px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-950 transition">
                     {cardSaving ? "Saving..." : "Save card"}
                  </button>
                  <button
                     type="button"
                     onClick={() => {
                        setAddingCard(false);
                        setCardError(null);
                     }}
                     className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">
                     Cancel
                  </button>
               </div>
            </form>
         )}

         {/* Practice view (uses SRS state) */}
         <PracticeView
            state={srsState}
            onFlip={flipCard}
            onAnswer={handleAnswer}
            onToggleGrindMode={setGrindMode}
            setSwipe={setSwipe}
         />

         {/* Cards grid */}
         {cardsLoading ? (
            <p className="text-slate-500 text-sm">Loading cards...</p>
         ) : !hasAnyCards ? (
            <p className="text-slate-500 text-sm">
               No cards yet in this deck. Add some to get started.
            </p>
         ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {allCardsForGrid.map((card) => {
                  const cooldownLeft =
                     card.cooldownUntil && card.cooldownUntil > now
                        ? card.cooldownUntil - now
                        : 0;

                  return (
                     <div
                        key={card.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/60 transition">
                        <div className="flex items-start justify-between gap-2">
                           <div>
                              <h2 className="text-lg font-semibold">
                                 {card.front}
                              </h2>
                              {card.transcription && (
                                 <p className="text-sm text-emerald-300 mt-1">
                                    /{card.transcription}/
                                 </p>
                              )}
                           </div>

                           {!deck.is_public && (
                              <button
                                 onClick={() => handleDeleteCard(card.id)}
                                 disabled={deletingId === card.id}
                                 className="cursor-pointer text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                 {deletingId === card.id
                                    ? "Deleting..."
                                    : "Delete"}
                              </button>
                           )}
                        </div>

                        <p className="text-slate-400 text-sm mt-2">
                           {card.back}
                        </p>

                        {card.example_sentence && (
                           <p className="text-slate-500 text-xs mt-2 italic">
                              {card.example_sentence}
                           </p>
                        )}

                        {cooldownLeft > 0 && !srsState.grindMode && (
                           <p className="text-xs text-amber-400 mt-2">
                              Back in {formatCooldown(cooldownLeft)}
                           </p>
                        )}

                        {/* Health bar */}
                        <div className="flex gap-1 mt-3">
                           {Array.from({ length: 4 }).map((_, i) => (
                              <div
                                 key={i}
                                 className={`h-2 flex-1 rounded-full ${
                                    i < card.health
                                       ? "bg-emerald-500"
                                       : "bg-slate-700"
                                 }`}
                              />
                           ))}
                        </div>
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   );
}
