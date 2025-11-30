"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import ArticleReader from "@/components/ArticleReader";

type Article = {
   id: string;
   title: string;
   slug: string;
   content: string;
   level: string | null;
   is_premium: boolean;
};

type SaveStatusState = null | {
   word: string;
   state: "saving" | "saved" | "exists" | "error";
   message: string;
};

export default function ReadingArticlePage() {
   const params = useParams();
   const router = useRouter();
   const slug = params.slug as string;

   const [article, setArticle] = useState<Article | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);
   const [userId, setUserId] = useState<string | null>(null);

   const [saveStatus, setSaveStatus] = useState<SaveStatusState>(null);

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);

            // 1) Get user
            const { data: userData, error: userError } =
               await supabase.auth.getUser();
            if (userError) throw userError;
            const user = userData.user;

            if (!user) {
               router.push("/login");
               return;
            }

            setUserId(user.id);

            // 2) Check premium status
            const premium = await getPremiumStatus(user.id);
            setIsPremium(premium);

            // 3) Load article by slug
            const { data, error: articleError } = await supabase
               .from("reading_articles")
               .select("id, title, slug, content, level, is_premium")
               .eq("slug", slug)
               .single();

            if (articleError) throw articleError;

            setArticle(data as Article);
         } catch (err: any) {
            console.error(err);
            setError(err.message ?? "Failed to load article");
         } finally {
            setLoading(false);
         }
      };

      if (slug) {
         load();
      }
   }, [slug, router]);

   // 🧠 This function does the Supabase work when "Add to my deck" is clicked
   const handleSaveWord = async (payload: {
      word: string;
      definition: string;
      example: string | null;
   }) => {
      if (!userId) {
         setSaveStatus({
            word: payload.word,
            state: "error",
            message: "You must be logged in to save words.",
         });
         return;
      }

      try {
         setSaveStatus({
            word: payload.word,
            state: "saving",
            message: `Saving "${payload.word}"...`,
         });

         const deckName = "Reading – Saved words";

         // 1) Find existing "Reading – Saved words" deck for this user
         const { data: decks, error: deckError } = await supabase
            .from("vocabulary_decks")
            .select("id")
            .eq("user_id", userId)
            .eq("title", deckName);

         if (deckError) throw deckError;

         let deckId: string;

         if (!decks || decks.length === 0) {
            // 2) If no such deck, create it
            const { data: newDecks, error: createError } = await supabase
               .from("vocabulary_decks")
               .insert({
                  user_id: userId,
                  title: deckName,
                  description: "Words saved from reading articles",
                  requires_premium: false,
               })
               .select("id")
               .single();

            if (createError) throw createError;

            deckId = newDecks.id;
         } else {
            deckId = decks[0].id;
         }

         // 3) Check if this word is already in that deck
         const { data: existingCards, error: cardError } = await supabase
            .from("vocabulary_cards")
            .select("id")
            .eq("deck_id", deckId)
            .ilike("front", payload.word);

         if (cardError) throw cardError;

         if (existingCards && existingCards.length > 0) {
            setSaveStatus({
               word: payload.word,
               state: "exists",
               message: `"${payload.word}" is already in your "Reading – Saved words" deck.`,
            });
            return;
         }

         // 4) Insert new card
         const { error: insertError } = await supabase
            .from("vocabulary_cards")
            .insert({
               deck_id: deckId,
               front: payload.word,
               back: payload.definition,
               example_sentence: payload.example,
            });

         if (insertError) throw insertError;

         setSaveStatus({
            word: payload.word,
            state: "saved",
            message: `Saved "${payload.word}" to your "Reading – Saved words" deck.`,
         });
      } catch (err: any) {
         console.error(err);
         setSaveStatus({
            word: payload.word,
            state: "error",
            message:
               err?.message ??
               `Failed to save "${payload.word}". Please try again.`,
         });
      }
   };

   if (loading) {
      return (
         <div className="space-y-4">
            <p className="text-slate-400 text-sm">Loading article…</p>
         </div>
      );
   }

   if (error || !article) {
      return (
         <div className="space-y-4">
            <p className="text-red-400 text-sm">
               {error ?? "Article not found."}
            </p>
         </div>
      );
   }

   const locked = article.is_premium && !isPremium;

   return (
      <div className="space-y-6">
         <button
            onClick={() => router.push("/dashboard/reading")}
            className="text-sm text-slate-400 hover:text-emerald-300 cursor-pointer">
            ← Back to reading list
         </button>

         <div className="space-y-2">
            <h1 className="text-2xl font-semibold">{article.title}</h1>
            <div className="flex items-center gap-2 text-sm text-slate-400">
               {article.level && (
                  <span className="px-2 py-1 rounded-full bg-slate-800 text-slate-200 text-xs">
                     {article.level}
                  </span>
               )}
               {article.is_premium && (
                  <span className="px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs">
                     Premium
                  </span>
               )}
            </div>
         </div>

         {locked ? (
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 text-slate-200 text-sm">
               This article is available only for premium members.
               <br />
               Please upgrade your account to read it.
            </div>
         ) : (
            <>
               <ArticleReader
                  text={article.content}
                  onSaveWord={handleSaveWord}
                  saveStatus={saveStatus}
               />

               {saveStatus && (
                  <p className="text-xs text-slate-400">{saveStatus.message}</p>
               )}
            </>
         )}
      </div>
   );
}
