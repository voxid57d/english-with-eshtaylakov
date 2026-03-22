"use client";

import { useEffect, useState, MouseEvent } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";
import { getPremiumStatus } from "@/lib/premium";
import { useRouter } from "next/navigation";
import {
   HiOutlineBookOpen,
   HiOutlineGlobeAlt,
   HiOutlineSparkles,
   HiOutlineSquares2X2,
} from "react-icons/hi2";
import { PiBookOpenTextLight } from "react-icons/pi";
import type { IconType } from "react-icons";

type FolderTheme = "ocean" | "emerald" | "sunset" | "violet";

type Deck = {
   id: string;
   title: string;
   description: string | null;
   is_public: boolean;
   requires_premium: boolean;
};

type Folder = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   folder_theme: FolderTheme;
};

type FolderThemeConfig = {
   icon: IconType;
   accent: string;
   glow: string;
};

const FOLDER_THEME_MAP: Record<FolderTheme, FolderThemeConfig> = {
   ocean: {
      icon: HiOutlineGlobeAlt,
      accent: "from-cyan-400/30 via-sky-500/18 to-slate-950/10",
      glow: "bg-cyan-400/20",
   },
   emerald: {
      icon: HiOutlineBookOpen,
      accent: "from-emerald-400/30 via-lime-500/18 to-slate-950/10",
      glow: "bg-emerald-400/20",
   },
   sunset: {
      icon: HiOutlineSparkles,
      accent: "from-amber-400/30 via-orange-500/18 to-slate-950/10",
      glow: "bg-orange-400/20",
   },
   violet: {
      icon: HiOutlineSquares2X2,
      accent: "from-violet-400/30 via-fuchsia-500/18 to-slate-950/10",
      glow: "bg-violet-400/20",
   },
};

export default function VocabularyPage() {
   const [userDecks, setUserDecks] = useState<Deck[]>([]);
   const [publicStandaloneDecks, setPublicStandaloneDecks] = useState<Deck[]>([]);
   const [publicFolders, setPublicFolders] = useState<Folder[]>([]);
   const [folderDeckCounts, setFolderDeckCounts] = useState<Record<string, number>>(
      {}
   );
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [creating, setCreating] = useState(false);
   const [newTitle, setNewTitle] = useState("");
   const [newDescription, setNewDescription] = useState("");
   const [saving, setSaving] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);
   const router = useRouter();

   useEffect(() => {
      const fetchVocabularyHome = async () => {
         setLoading(true);
         setError(null);

         const { data: userData } = await supabase.auth.getUser();

         if (userData.user) {
            const premium = await getPremiumStatus(userData.user.id);
            setIsPremium(premium);
         }

         const [
            userDecksResult,
            publicStandaloneDecksResult,
            publicFoldersResult,
            folderedPublicDecksResult,
         ] = await Promise.all([
            supabase
               .from("vocabulary_decks")
               .select("id, title, description, is_public, requires_premium")
               .eq("is_public", false)
               .order("created_at", { ascending: false }),
            supabase
               .from("vocabulary_decks")
               .select("id, title, description, is_public, requires_premium")
               .eq("is_public", true)
               .is("folder_id", null)
               .order("created_at", { ascending: false }),
            supabase
               .from("vocabulary_folders")
               .select("id, slug, title, description, folder_theme")
               .order("sort_order", { ascending: true })
               .order("created_at", { ascending: false }),
            supabase
               .from("vocabulary_decks")
               .select("folder_id")
               .eq("is_public", true)
               .not("folder_id", "is", null),
         ]);

         if (
            userDecksResult.error ||
            publicStandaloneDecksResult.error ||
            publicFoldersResult.error ||
            folderedPublicDecksResult.error
         ) {
            console.error(
               userDecksResult.error ||
                  publicStandaloneDecksResult.error ||
                  publicFoldersResult.error ||
                  folderedPublicDecksResult.error
            );
            setError("Failed to load vocabulary.");
            setLoading(false);
            return;
         }

         setUserDecks((userDecksResult.data || []) as Deck[]);
         setPublicStandaloneDecks(
            (publicStandaloneDecksResult.data || []) as Deck[]
         );
         setPublicFolders((publicFoldersResult.data || []) as Folder[]);

         const counts: Record<string, number> = {};
         ((folderedPublicDecksResult.data || []) as { folder_id: string }[]).forEach(
            (deck) => {
               counts[deck.folder_id] = (counts[deck.folder_id] || 0) + 1;
            }
         );
         setFolderDeckCounts(counts);
         setLoading(false);
      };

      fetchVocabularyHome();
   }, []);

   const handleCreateDeck = async (e: React.FormEvent) => {
      e.preventDefault();

      if (!newTitle.trim()) {
         setError("Deck title is required.");
         return;
      }

      setSaving(true);
      setError(null);

      const { data, error: createError } = await supabase
         .from("vocabulary_decks")
         .insert({
            title: newTitle.trim(),
            description: newDescription.trim() || null,
            is_public: false,
            requires_premium: false,
         })
         .select("id, title, description, is_public, requires_premium")
         .single();

      if (createError) {
         console.error(createError);
         setError("Failed to create deck.");
      } else if (data) {
         setUserDecks((prev) => [data as Deck, ...prev]);
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
      e.preventDefault();
      e.stopPropagation();

      if (isPublic) {
         alert("You can't delete a system/public deck.");
         return;
      }

      const confirmed = window.confirm("Delete this deck and all its cards?");
      if (!confirmed) return;

      setDeletingId(id);
      setError(null);

      const { error: deleteError } = await supabase
         .from("vocabulary_decks")
         .delete()
         .eq("id", id);

      if (deleteError) {
         console.error(deleteError);
         setError("Failed to delete deck.");
      } else {
         setUserDecks((prev) => prev.filter((deck) => deck.id !== id));
      }

      setDeletingId(null);
   };

   const renderDeckCard = (deck: Deck) => {
      const locked = deck.requires_premium && !isPremium;

      const cardContent = (
         <div className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition block hover:border-emerald-500/60">
            <div className="flex items-start justify-between gap-2">
               <h3 className="text-lg font-semibold">{deck.title}</h3>

               {!deck.is_public && (
                  <button
                     onClick={(e) => handleDeleteDeck(e, deck.id, deck.is_public)}
                     disabled={deletingId === deck.id}
                     className="cursor-pointer text-xs text-slate-500 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50">
                     {deletingId === deck.id ? "Deleting..." : "Delete"}
                  </button>
               )}
            </div>

            {deck.description && (
               <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                  {deck.description}
               </p>
            )}

            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500 transition group-hover:text-slate-300">
               <span>{deck.is_public ? "Public deck" : "Your deck"}</span>
               {deck.requires_premium && (
                  <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-amber-300 transition group-hover:bg-amber-500/30 group-hover:text-amber-200">
                     Premium
                  </span>
               )}
            </div>
         </div>
      );

      if (locked) {
         return (
            <button
               key={deck.id}
               type="button"
               onClick={() => router.push("/premium")}
               className="w-full cursor-pointer text-left opacity-70 transition hover:opacity-90">
               {cardContent}
            </button>
         );
      }

      return (
         <Link
            key={deck.id}
            href={`/dashboard/vocabulary/${deck.id}`}
            className="block">
            {cardContent}
         </Link>
      );
   };

   const isEmpty =
      !loading &&
      !error &&
      userDecks.length === 0 &&
      publicFolders.length === 0 &&
      publicStandaloneDecks.length === 0;

   return (
      <div className="space-y-6">
         <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
               <h1 className="flex items-center gap-2 text-2xl font-semibold">
                  <PiBookOpenTextLight className="text-emerald-400" />
                  <span>Vocabulary</span>
               </h1>
            </div>

            <button
               onClick={() => setCreating((prev) => !prev)}
               className="self-start rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-600 sm:self-auto">
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
                     className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
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
                     className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                     rows={3}
                     placeholder="Short description of this deck..."
                  />
               </div>

               <div className="flex flex-wrap items-center gap-3">
                  <button
                     type="submit"
                     disabled={saving}
                     className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60">
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
                     className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">
                     Cancel
                  </button>
               </div>
            </form>
         )}

         {loading && <div className="text-sm text-slate-400">Loading vocabulary...</div>}

         {!loading && error && <div className="text-sm text-red-400">{error}</div>}

         {isEmpty && (
            <div className="text-sm text-slate-400">
               No decks yet. Click &quot;Create new deck&quot; to get started.
            </div>
         )}

         {!loading && !error && publicFolders.length > 0 && (
            <section className="space-y-3">
               <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                     Public folders
                  </h2>
               </div>

               <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {publicFolders.map((folder) => {
                     const visual =
                        FOLDER_THEME_MAP[folder.folder_theme] || FOLDER_THEME_MAP.ocean;
                     const Icon = visual.icon;
                     const deckCount = folderDeckCounts[folder.id] || 0;

                     return (
                        <Link
                           key={folder.id}
                           href={`/dashboard/vocabulary/folders/${folder.slug}`}
                           className="group relative block overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 p-6 transition hover:-translate-y-1 hover:border-emerald-500/60">
                           <div
                              className={`absolute inset-0 bg-gradient-to-br ${visual.accent}`}
                           />
                           <div className="absolute -right-6 top-6 h-24 w-24 rounded-full blur-3xl transition group-hover:scale-125">
                              <div className={`h-full w-full rounded-full ${visual.glow}`} />
                           </div>

                           <div className="relative flex h-full flex-col">
                              <div className="flex items-start justify-between gap-4">
                                 <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-xl text-slate-100">
                                    <Icon />
                                 </span>

                                 <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                                    {deckCount} {deckCount === 1 ? "deck" : "decks"}
                                 </span>
                              </div>

                              <h3 className="mt-8 text-2xl font-semibold text-slate-50">
                                 {folder.title}
                              </h3>

                              <p className="mt-5 min-h-10 text-sm text-slate-300/85">
                                 {folder.description || "Open this folder to browse its decks."}
                              </p>

                              <div className="mt-6 flex items-center justify-between text-sm text-slate-300">
                                 <span>Open folder</span>
                                 <span className="transition group-hover:translate-x-1">
                                    &rarr;
                                 </span>
                              </div>
                           </div>
                        </Link>
                     );
                  })}
               </div>
            </section>
         )}

         {!loading && !error && userDecks.length > 0 && (
            <section className="space-y-3">
               <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                     Your decks
                  </h2>
                  <p className="text-sm text-slate-400">
                     Private decks you create and manage yourself.
                  </p>
               </div>

               <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {userDecks.map((deck) => renderDeckCard(deck))}
               </div>
            </section>
         )}

         {!loading && !error && publicStandaloneDecks.length > 0 && (
            <section className="space-y-3">
               <div>
                  <h2 className="text-lg font-semibold text-slate-100">
                     Public decks
                  </h2>
                  <p className="text-sm text-slate-400">
                     Public decks that are not assigned to a folder yet.
                  </p>
               </div>

               <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {publicStandaloneDecks.map((deck) => renderDeckCard(deck))}
               </div>
            </section>
         )}
      </div>
   );
}
