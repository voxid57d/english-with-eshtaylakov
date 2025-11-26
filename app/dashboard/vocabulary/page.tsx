"use client";

import { useEffect, useState, MouseEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   created_at: string;
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

   useEffect(() => {
      const fetchDecks = async () => {
         setLoading(true);
         setError(null);

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
               className="px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-sm font-medium text-slate-950 transition">
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
               {decks.map((deck) => (
                  <Link
                     key={deck.id}
                     href={`/dashboard/vocabulary/${deck.id}`}
                     className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-500/60 cursor-pointer transition block">
                     <div className="flex items-start justify-between gap-2">
                        <h2 className="text-lg font-semibold">{deck.title}</h2>

                        {!deck.is_public && (
                           <button
                              onClick={(e) =>
                                 handleDeleteDeck(e, deck.id, deck.is_public)
                              }
                              disabled={deletingId === deck.id}
                              className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed">
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
                        </span>
                        <span>
                           {new Date(deck.created_at).toLocaleDateString()}
                        </span>
                     </div>
                  </Link>
               ))}
            </div>
         )}
      </div>
   );
}
