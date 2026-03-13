"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";

type Folder = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
};

type PublicDeck = {
   id: string;
   title: string;
   description: string | null;
   created_at: string;
   requires_premium: boolean;
};

export default function VocabularyFolderPage() {
   const params = useParams();
   const router = useRouter();
   const folderSlug = params.folderSlug as string;

   const [folder, setFolder] = useState<Folder | null>(null);
   const [decks, setDecks] = useState<PublicDeck[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);

   useEffect(() => {
      const loadFolder = async () => {
         setLoading(true);
         setError(null);

         const { data: userData } = await supabase.auth.getUser();
         if (userData.user) {
            const premium = await getPremiumStatus(userData.user.id);
            setIsPremium(premium);
         }

         const { data: folderData, error: folderError } = await supabase
            .from("vocabulary_folders")
            .select("id, slug, title, description")
            .eq("slug", folderSlug)
            .maybeSingle();

         if (folderError) {
            console.error(folderError);
            setError("Failed to load folder.");
            setLoading(false);
            return;
         }

         if (!folderData) {
            setFolder(null);
            setDecks([]);
            setLoading(false);
            return;
         }

         setFolder(folderData as Folder);

         const { data: decksData, error: decksError } = await supabase
            .from("vocabulary_decks")
            .select("id, title, description, created_at, requires_premium")
            .eq("is_public", true)
            .eq("folder_id", folderData.id)
            .order("title", { ascending: true });

         if (decksError) {
            console.error(decksError);
            setError("Failed to load public decks.");
            setDecks([]);
         } else {
            setDecks((decksData || []) as PublicDeck[]);
         }

         setLoading(false);
      };

      loadFolder();
   }, [folderSlug]);

   if (loading) {
      return <div className="text-sm text-slate-400">Loading folder...</div>;
   }

   if (error) {
      return <div className="text-sm text-red-400">{error}</div>;
   }

   if (!folder) {
      return <div className="text-sm text-slate-400">Folder not found.</div>;
   }

   return (
      <div className="space-y-6">
         <Link
            href="/dashboard/vocabulary"
            className="inline-flex items-center text-sm text-slate-400 transition hover:text-slate-200">
            ← Back to vocabulary
         </Link>

         <header className="space-y-2">
            <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
               Public folder
            </p>
            <h1 className="text-2xl font-semibold">{folder.title}</h1>
            {folder.description && (
               <p className="max-w-2xl text-sm text-slate-400">
                  {folder.description}
               </p>
            )}
         </header>

         {decks.length === 0 ? (
            <p className="text-sm text-slate-500">
               No public decks in this folder yet.
            </p>
         ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
               {decks.map((deck) => {
                  const locked = deck.requires_premium && !isPremium;

                  const cardContent = (
                     <div className="group block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-emerald-500/60">
                        <div className="flex items-start justify-between gap-2">
                           <h2 className="text-lg font-semibold">{deck.title}</h2>
                           {deck.requires_premium && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                                 Premium
                              </span>
                           )}
                        </div>

                        {deck.description && (
                           <p className="mt-1 line-clamp-2 text-sm text-slate-400">
                              {deck.description}
                           </p>
                        )}

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 transition group-hover:text-slate-300">
                           <span>Public deck</span>
                           <span>
                              {new Date(deck.created_at).toLocaleDateString()}
                           </span>
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
               })}
            </div>
         )}
      </div>
   );
}
