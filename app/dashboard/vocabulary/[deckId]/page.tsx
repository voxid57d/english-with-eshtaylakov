"use client";
import { getPremiumStatus } from "@/lib/premium";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   requires_premium: boolean; // ✅ NEW
};

type Card = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
   transcription: string | null;
};

export default function DeckPage() {
   const params = useParams();
   const deckId = params.deckId as string;

   const [deck, setDeck] = useState<Deck | null>(null);
   const [loading, setLoading] = useState(true);
   const [cards, setCards] = useState<Card[]>([]);
   const [cardsLoading, setCardsLoading] = useState(true);
   const [addingCard, setAddingCard] = useState(false);
   const [newWord, setNewWord] = useState("");
   const [newDefinition, setNewDefinition] = useState("");
   const [newExample, setNewExample] = useState("");
   const [cardSaving, setCardSaving] = useState(false);
   const [cardError, setCardError] = useState<string | null>(null);
   const [isPracticing, setIsPracticing] = useState(false);
   const [currentIndex, setCurrentIndex] = useState(0);
   const [showBack, setShowBack] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false); // ✅ is this user premium?
   const [locked, setLocked] = useState(false); // ✅ is this deck locked for them?
   const [history, setHistory] = useState<number[]>([]);
   const [historyPosition, setHistoryPosition] = useState(0);

   useEffect(() => {
      const fetchDeck = async () => {
         // 1) Get current user
         const { data: userData } = await supabase.auth.getUser();

         let premium = false;
         if (userData.user) {
            premium = await getPremiumStatus(userData.user.id);
            setIsPremium(premium);
         }

         // 2) Load the deck, including requires_premium
         const { data, error } = await supabase
            .from("vocabulary_decks")
            .select("id, title, description, is_public, requires_premium")
            .eq("id", deckId)
            .single();

         if (!error && data) {
            const deckData = data as Deck;
            setDeck(deckData);

            // 3) If this deck is premium-only and user is not premium → lock it
            if (deckData.requires_premium && !premium) {
               setLocked(true);
            }
         }

         setLoading(false);
      };

      fetchDeck();
   }, [deckId]);

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
         .select("id, front, back, example_sentence")
         .single();

      if (error) {
         console.error(error);
         setCardError("Failed to add card.");
      } else if (data) {
         // Add new card to the top of the list
         setCards((prev) => [data as Card, ...prev]);
         setAddingCard(false);
         setNewWord("");
         setNewDefinition("");
         setNewExample("");
      }

      setCardSaving(false);
   };

   const handleDeleteCard = async (id: string) => {
      const confirmed = window.confirm("Delete this card?");
      if (!confirmed) return;

      setDeletingId(id);
      setCardError(null);

      const { error } = await supabase
         .from("vocabulary_cards")
         .delete()
         .eq("id", id);

      if (error) {
         console.error(error);
         setCardError("Failed to delete card.");
      } else {
         // Remove the card from local state
         setCards((prev) => prev.filter((card) => card.id !== id));
      }

      setDeletingId(null);
   };

   const getRandomIndex = (length: number, excludeIndex: number | null) => {
      if (length <= 1) return 0;

      let random = Math.floor(Math.random() * length);

      // Try to avoid returning the same index as excludeIndex
      if (excludeIndex !== null && length > 1) {
         while (random === excludeIndex) {
            random = Math.floor(Math.random() * length);
         }
      }

      return random;
   };

   const startPractice = () => {
      if (cards.length === 0) return;

      // Pick a starting card (could be index 0 or random – let's go random)
      const firstIndex = getRandomIndex(cards.length, null);

      setIsPracticing(true);
      setCurrentIndex(firstIndex);
      setShowBack(false);

      // Reset history to start with this card
      setHistory([firstIndex]);
      setHistoryPosition(0);
   };

   const stopPractice = () => {
      setIsPracticing(false);
      setShowBack(false);
      setHistory([]);
      setHistoryPosition(0);
   };

   const goToNext = () => {
      if (cards.length === 0) return;

      setShowBack(false);

      setHistory((prevHistory) => {
         let newHistory = [...prevHistory];
         let newPosition = historyPosition;

         // If there is a future in history (user went back before)
         if (newPosition < newHistory.length - 1) {
            newPosition = newPosition + 1;
            setCurrentIndex(newHistory[newPosition]);
            setHistoryPosition(newPosition);
            return newHistory;
         }

         // Otherwise we're at the end → choose a new random card
         const currentIdx =
            newHistory.length > 0 ? newHistory[newPosition] : null;
         const randomIndex = getRandomIndex(cards.length, currentIdx);

         newHistory.push(randomIndex);
         newPosition = newHistory.length - 1;

         setCurrentIndex(randomIndex);
         setHistoryPosition(newPosition);

         return newHistory;
      });
   };

   const goToPrev = () => {
      if (cards.length === 0) return;
      if (historyPosition === 0) return; // no previous

      setShowBack(false);

      setHistoryPosition((prevPos) => {
         const newPos = prevPos - 1;
         const prevIndex = history[newPos];
         setCurrentIndex(prevIndex);
         return newPos;
      });
   };

   const flipCard = () => {
      setShowBack((prev) => !prev);
   };

   useEffect(() => {
      const fetchCards = async () => {
         // If deck is locked for this user, don't load cards at all
         if (locked) {
            setCards([]);
            setCardsLoading(false);
            return;
         }

         setCardsLoading(true);

         const { data, error } = await supabase
            .from("vocabulary_cards")
            .select("id, front, back, example_sentence, transcription")
            .eq("deck_id", deckId)
            .order("id", { ascending: true });

         if (!error) {
            setCards(data as Card[]);
         }

         setCardsLoading(false);
      };

      fetchCards();
   }, [deckId, locked]); // ✅ include locked here

   if (loading) {
      return <div>Loading deck...</div>;
   }

   if (!deck) {
      return <div>Deck not found.</div>;
   }

   if (locked && deck) {
      return (
         <div className="space-y-6">
            <Link
               href="/dashboard/vocabulary"
               className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition">
               ← Back to decks
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
         {/* Back button */}
         <Link
            href="/dashboard/vocabulary"
            className="inline-flex items-center text-sm text-slate-400 hover:text-slate-200 transition">
            ← Back to decks
         </Link>

         {/* Deck title */}
         <div className="flex items-center gap-3">
            <button
               onClick={() => {
                  if (isPracticing) {
                     stopPractice();
                  } else {
                     startPractice();
                  }
               }}
               disabled={cards.length === 0}
               className="cursor-pointer px-4 py-2 rounded-full border border-emerald-500 text-sm font-medium
                 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition">
               {isPracticing ? "Stop practice" : "Practice"}
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
                        setNewWord("");
                        setNewDefinition("");
                        setNewExample("");
                        setCardError(null);
                     }}
                     className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">
                     Cancel
                  </button>
               </div>
            </form>
         )}

         {isPracticing && cards.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
               <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                     Card {currentIndex + 1} of {cards.length}
                  </span>
                  <span>Tap the card to flip</span>
               </div>

               {/* Flashcard */}
               <div
                  onClick={flipCard}
                  className="cursor-pointer rounded-xl bg-slate-950 border border-slate-800 px-6 py-10 flex flex-col justify-center items-center text-center transition hover:border-emerald-500/60">
                  {!showBack ? (
                     <>
                        <p className="text-sm text-slate-400 mb-2">Word</p>
                        <p className="text-2xl font-semibold">
                           {cards[currentIndex].front}
                        </p>

                        {cards[currentIndex].transcription && (
                           <p className="mt-2 text-lg text-emerald-300">
                              /{cards[currentIndex].transcription}/
                           </p>
                        )}
                     </>
                  ) : (
                     <>
                        <p className="text-sm text-slate-400 mb-2">
                           Definition
                        </p>
                        <p className="text-base text-slate-100">
                           {cards[currentIndex].back}
                        </p>
                        {cards[currentIndex].example_sentence && (
                           <p className="text-sm text-slate-400 mt-3 italic">
                              {cards[currentIndex].example_sentence}
                           </p>
                        )}
                     </>
                  )}
               </div>

               {/* Controls */}
               <div className="flex items-center justify-between">
                  <button
                     onClick={goToPrev}
                     className="cursor-pointer px-3 py-2 rounded-full border border-slate-700 text-sm text-slate-200 hover:bg-slate-800 transition">
                     ← Previous
                  </button>

                  <button
                     onClick={flipCard}
                     className="cursor-pointer px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm text-slate-100 transition">
                     {showBack ? "Show word" : "Show definition"}
                  </button>

                  <button
                     onClick={goToNext}
                     className="cursor-pointer px-3 py-2 rounded-full border border-slate-700 text-sm text-slate-200 hover:bg-slate-800 transition">
                     Next →
                  </button>
               </div>
            </div>
         )}

         {/* Cards will go here */}
         {/* Cards */}
         {cardsLoading && (
            <p className="text-slate-500 text-sm">Loading cards...</p>
         )}

         {!cardsLoading && cards.length === 0 && (
            <p className="text-slate-500 text-sm">No cards yet in this deck.</p>
         )}

         {!cardsLoading && cards.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {cards.map((card) => (
                  <div
                     key={card.id}
                     className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/60 transition">
                     <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold">{card.front}</h2>

                        {card.transcription && (
                           <p className="text-sm text-emerald-300 mt-1">
                              /{card.transcription}/
                           </p>
                        )}

                        <button
                           onClick={() => handleDeleteCard(card.id)}
                           disabled={deletingId === card.id}
                           className="cursor-pointer text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
                           {deletingId === card.id ? "Deleting..." : "Delete"}
                        </button>
                     </div>

                     <p className="text-slate-400 text-sm mt-2">{card.back}</p>

                     {card.example_sentence && (
                        <p className="text-slate-500 text-xs mt-2 italic">
                           {card.example_sentence}
                        </p>
                     )}
                  </div>
               ))}
            </div>
         )}
      </div>
   );
}
