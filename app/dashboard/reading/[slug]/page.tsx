"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import ArticleReader from "@/components/ArticleReader";
import { PiCheckCircleLight } from "react-icons/pi";

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

   // Reading progress state
   const [isFinished, setIsFinished] = useState(false);
   const [progressLoading, setProgressLoading] = useState(false);
   const [progressError, setProgressError] = useState<string | null>(null);

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
            if (!data) throw new Error("Article not found.");

            setArticle(data as Article);
         } catch (err: any) {
            console.error(err);
            setError(err.message ?? "Failed to load article");
         } finally {
            setLoading(false);
         }
      };

      if (slug) load();
   }, [slug, router]);

   // Load finished status (after userId + article.id are known)
   useEffect(() => {
      const loadProgress = async () => {
         if (!userId || !article?.id) return;

         try {
            setProgressLoading(true);
            setProgressError(null);

            const { data, error } = await supabase
               .from("reading_progress")
               .select("finished")
               .eq("user_id", userId)
               .eq("article_id", article.id)
               .maybeSingle();

            if (error) throw error;

            setIsFinished(Boolean(data?.finished));
         } catch (err: any) {
            console.warn(err);
            setProgressError(
               err?.message ?? "Could not load reading progress."
            );
         } finally {
            setProgressLoading(false);
         }
      };

      loadProgress();
   }, [userId, article?.id]);

   // Toggle finished/un-finished
   const toggleFinished = async () => {
      if (!userId || !article?.id) return;

      try {
         setProgressLoading(true);
         setProgressError(null);

         const nextFinished = !isFinished;

         const { error } = await supabase.from("reading_progress").upsert(
            {
               user_id: userId,
               article_id: article.id,
               finished: nextFinished,
               finished_at: nextFinished ? new Date().toISOString() : null,
            },
            { onConflict: "user_id,article_id" }
         );

         if (error) throw error;

         setIsFinished(nextFinished);
      } catch (err: any) {
         console.error(err);
         setProgressError(err?.message ?? "Could not update reading progress.");
      } finally {
         setProgressLoading(false);
      }
   };

   // Save word to Reading deck
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

         // 1) Find existing deck
         const { data: decks, error: deckError } = await supabase
            .from("vocabulary_decks")
            .select("id")
            .eq("user_id", userId)
            .eq("title", deckName);

         if (deckError) throw deckError;

         let deckId: string;

         if (!decks || decks.length === 0) {
            // 2) Create deck
            const { data: newDeck, error: createError } = await supabase
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

            // ✅ Fix: newDeck can be null in types, so guard it
            if (!newDeck?.id) {
               throw new Error("Deck was not created. Please try again.");
            }

            deckId = newDeck.id;
         } else {
            deckId = decks[0].id;
         }

         // 3) Check if this word already exists
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
               {!locked && isFinished && (
                  <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/40 text-xs">
                     Finished
                  </span>
               )}
            </div>

            {progressError && (
               <p className="text-xs text-amber-300">{progressError}</p>
            )}
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
                  showHelper={false}
               />

               <div className="flex items-center justify-between gap-4">
                  <p className="text-slate-400 text-sm">
                     Click any word in the text to see its definition.
                  </p>

                  <button
                     type="button"
                     onClick={toggleFinished}
                     disabled={progressLoading}
                     className={[
                        "inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm border transition",
                        progressLoading
                           ? "opacity-60 cursor-not-allowed"
                           : "opacity-95 cursor-pointer",
                        isFinished
                           ? "border-slate-700/70 bg-slate-900/40 text-slate-200 hover:border-emerald-400/40"
                           : "border-emerald-400/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300",
                     ].join(" ")}>
                     <PiCheckCircleLight className="text-base" />
                     <span>
                        {progressLoading
                           ? "Saving…"
                           : isFinished
                           ? "Mark as unfinished"
                           : "Mark as finished"}
                     </span>
                  </button>
               </div>
            </>
         )}
      </div>
   );
}
