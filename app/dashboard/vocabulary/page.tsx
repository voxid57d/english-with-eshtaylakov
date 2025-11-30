"use client";

import { useEffect, useState, MouseEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { getPremiumStatus } from "@/lib/premium"; // ✅ NEW

type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   created_at: string;
   requires_premium: boolean; // ✅ NEW
};

export default function VocabularyPage() {
   const [decks, setDecks] = useState<Deck[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [creating, setCreating] = useState(false);
   const [newTitle, setNewTitle] = useState("");
   const [newDescription, setNewDescription] = useState("");
   const [saving, setSaving] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);

   useEffect(() => {
      const fetchDecks = async () => {
         setLoading(true);
         setError(null);

         // ✅ 1) Get current user
         const { data: userData } = await supabase.auth.getUser();

         if (userData.user) {
            // ✅ 2) Check if they are premium
            const premium = await getPremiumStatus(userData.user.id);
            setIsPremium(premium);
         }

         // ✅ 3) Load decks as before
         const { data, error } = await supabase
            .from("vocabulary_decks")
            .select("*")
            .order("created_at", { ascending: false });

         if (error) {
            console.error(error);
            setError("Failed to load decks.");
         } else {
            setDecks(data as Deck[]);
         }

         setLoading(false);
      };

      fetchDecks();
   }, []);

   const handleCreateDeck = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!newTitle.trim()) {
         setError("Deck title is required.");
         return;
      }

      setSaving(true);
      setError(null);

      const { data, error } = await supabase
         .from("vocabulary_decks")
         .insert({
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            is_public: false, // user decks are private by default
            requires_premium: false, // ✅ user decks are never premium-only
         })
         .select("*")
         .single();

      if (error) {
         console.error(error);
         setError("Failed to create deck.");
      } else if (data) {
         // Add new deck to state so it shows up immediately
         setDecks((prev) => [data as Deck, ...prev]);
         setCreating(false);
         setNewTitle("");
         setNewDescription("");
      }

      setSaving(false);
   };

   const handleDeleteDeck = async (
      e: MouseEvent<HTMLButtonElement>,
      id: string,
      isPublic: boolean
   ) => {
      // Don’t follow the Link when clicking delete
      e.preventDefault();
      e.stopPropagation();

      if (isPublic) {
         alert("You can’t delete a system/public deck.");
         return;
      }

      const confirmed = window.confirm("Delete this deck and all its cards?");
      if (!confirmed) return;

      setDeletingId(id);
      setError(null);

      const { error } = await supabase
         .from("vocabulary_decks")
         .delete()
         .eq("id", id);

      if (error) {
         console.error(error);
         setError("Failed to delete deck.");
      } else {
         // Remove from local state
         setDecks((prev) => prev.filter((deck) => deck.id !== id));
      }

      setDeletingId(null);
   };

   return (
      <div className="space-y-6">
         <header className="flex items-center justify-between">
            <div>
               <h1 className="text-2xl font-semibold">Vocabulary</h1>
               <p className="text-sm text-slate-400">
                  Choose a deck to start practicing.
               </p>
            </div>

            <button
               onClick={() => setCreating((prev) => !prev)}
               className="cursor-pointer px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-sm font-medium text-slate-950 transition">
               {creating ? "Cancel" : "+ Create new deck"}
            </button>
         </header>

         {creating && (
            <form
               onSubmit={handleCreateDeck}
               className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
               <div className="space-y-1">
                  <label className="block text-sm text-slate-300">
                     Deck title
                  </label>
                  <input
                     type="text"
                     value={newTitle}
                     onChange={(e) => setNewTitle(e.target.value)}
                     className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                     placeholder="e.g. Travel phrases"
                  />
               </div>

               <div className="space-y-1">
                  <label className="block text-sm text-slate-300">
                     Description (optional)
                  </label>
                  <textarea
                     value={newDescription}
                     onChange={(e) => setNewDescription(e.target.value)}
                     className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm outline-none focus:border-emerald-500 resize-none"
                     rows={3}
                     placeholder="Short description of this deck..."
                  />
               </div>

               <div className="flex items-center gap-3">
                  <button
                     type="submit"
                     disabled={saving}
                     className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-sm font-medium text-slate-950 transition">
                     {saving ? "Creating..." : "Create deck"}
                  </button>
                  <button
                     type="button"
                     onClick={() => {
                        setCreating(false);
                        setNewTitle("");
                        setNewDescription("");
                        setError(null);
                     }}
                     className="text-sm text-slate-400 hover:text-slate-200">
                     Cancel
                  </button>
               </div>
            </form>
         )}

         {/* Loading state */}
         {loading && (
            <div className="text-sm text-slate-400">Loading decks...</div>
         )}

         {/* Error state */}
         {!loading && error && (
            <div className="text-sm text-red-400">{error}</div>
         )}

         {/* Empty state */}
         {!loading && !error && decks.length === 0 && (
            <div className="text-sm text-slate-400">
               No decks yet. Click &quot;Create new deck&quot; to get started.
            </div>
         )}

         {/* Decks grid */}
         {!loading && !error && decks.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {decks.map((deck) => {
                  const locked = deck.requires_premium && !isPremium;

                  const cardContent = (
                     <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition block">
                        <div className="flex items-start justify-between gap-2">
                           <h2 className="text-lg font-semibold">
                              {deck.title}
                           </h2>

                           {/* Delete button only for your own (non-public) decks */}
                           {!deck.is_public && (
                              <button
                                 onClick={(e) =>
                                    handleDeleteDeck(e, deck.id, deck.is_public)
                                 }
                                 disabled={deletingId === deck.id}
                                 className="cursor-pointer text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
                                 {deletingId === deck.id
                                    ? "Deleting..."
                                    : "Delete"}
                              </button>
                           )}
                        </div>

                        {deck.description && (
                           <p className="text-sm text-slate-400 mt-1 line-clamp-2">
                              {deck.description}
                           </p>
                        )}

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                           <span>
                              {deck.is_public ? "Public deck" : "Your deck"}
                              {deck.requires_premium && (
                                 <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Premium only
                                 </span>
                              )}
                           </span>
                           <span>
                              {new Date(deck.created_at).toLocaleDateString()}
                           </span>
                        </div>
                     </div>
                  );

                  // If locked → show as non-clickable, slightly faded
                  if (locked) {
                     return (
                        <div
                           key={deck.id}
                           className="opacity-60 cursor-not-allowed"
                           onClick={() =>
                              alert(
                                 "This deck is only available for premium users."
                              )
                           }>
                           {cardContent}
                        </div>
                     );
                  }

                  // If not locked → normal Link
                  return (
                     <Link
                        key={deck.id}
                        href={`/dashboard/vocabulary/${deck.id}`}
                        className="hover:border-emerald-500/60">
                        {cardContent}
                     </Link>
                  );
               })}
            </div>
         )}
      </div>
   );
}
