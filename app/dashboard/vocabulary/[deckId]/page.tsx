"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Deck = {
   id: string;
   title: string;
   description: string | null;
};

type Card = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
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

   useEffect(() => {
      const fetchDeck = async () => {
         const { data, error } = await supabase
            .from("vocabulary_decks")
            .select("id, title, description")
            .eq("id", deckId)
            .single();

         if (!error) {
            setDeck(data as Deck);
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

   const startPractice = () => {
      if (cards.length === 0) return;
      setIsPracticing(true);
      setCurrentIndex(0);
      setShowBack(false);
   };

   const stopPractice = () => {
      setIsPracticing(false);
      setShowBack(false);
   };

   const goToNext = () => {
      if (cards.length === 0) return;
      setCurrentIndex((prev) => (prev + 1) % cards.length);
      setShowBack(false);
   };

   const goToPrev = () => {
      if (cards.length === 0) return;
      setCurrentIndex((prev) => (prev === 0 ? cards.length - 1 : prev - 1));
      setShowBack(false);
   };

   const flipCard = () => {
      setShowBack((prev) => !prev);
   };

   useEffect(() => {
      const fetchCards = async () => {
         setCardsLoading(true);

         const { data, error } = await supabase
            .from("vocabulary_cards")
            .select("id, front, back, example_sentence")
            .eq("deck_id", deckId)
            .order("id", { ascending: true });

         if (!error) {
            setCards(data as Card[]);
         }

         setCardsLoading(false);
      };

      fetchCards();
   }, [deckId]);

   if (loading) {
      return <div>Loading deck...</div>;
   }

   if (!deck) {
      return <div>Deck not found.</div>;
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
               className="px-4 py-2 rounded-full border border-emerald-500 text-sm font-medium
                 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition">
               {isPracticing ? "Stop practice" : "Practice"}
            </button>

            <button
               onClick={() => {
                  setAddingCard((prev) => !prev);
                  setCardError(null);
               }}
               className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-sm font-medium text-slate-950 transition">
               {addingCard ? "Cancel" : "+ Add card"}
            </button>
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
                     className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-950 transition">
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
                     className="text-sm text-slate-400 hover:text-slate-200">
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
                     className="px-3 py-2 rounded-full border border-slate-700 text-sm text-slate-200 hover:bg-slate-800 transition">
                     ← Previous
                  </button>

                  <button
                     onClick={flipCard}
                     className="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm text-slate-100 transition">
                     {showBack ? "Show word" : "Show definition"}
                  </button>

                  <button
                     onClick={goToNext}
                     className="px-3 py-2 rounded-full border border-slate-700 text-sm text-slate-200 hover:bg-slate-800 transition">
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

                        <button
                           onClick={() => handleDeleteCard(card.id)}
                           disabled={deletingId === card.id}
                           className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
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
