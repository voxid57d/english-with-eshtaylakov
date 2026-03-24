"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import ArticleReader from "@/components/ArticleReader";
import { PiCheckCircleLight } from "react-icons/pi";
import {
   getReadingLevelLabel,
   normalizeReadingContentBlocks,
   type ReadingContentBlock,
} from "@/lib/readingContent";

type Article = {
   id: string;
   title: string;
   slug: string;
   short_summary: string | null;
   content: string;
   content_blocks: ReadingContentBlock[] | null;
   cover_image_url: string | null;
   level: string | null;
   is_premium: boolean;
};

type SaveStatusState = null | {
   word: string;
   state: "saving" | "saved" | "exists" | "error";
   message: string;
};

function getErrorMessage(error: unknown, fallback: string) {
   return error instanceof Error ? error.message : fallback;
}

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
   const [isFinished, setIsFinished] = useState(false);
   const [progressLoading, setProgressLoading] = useState(false);
   const [progressError, setProgressError] = useState<string | null>(null);

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);

            const { data: userData, error: userError } =
               await supabase.auth.getUser();
            if (userError) throw userError;

            const user = userData.user;
            if (!user) {
               router.push("/login");
               return;
            }

            setUserId(user.id);

            const premium = await getPremiumStatus(user.id);
            setIsPremium(premium);

            const { data, error: articleError } = await supabase
               .from("reading_articles")
               .select(
                  "id, title, slug, short_summary, content, content_blocks, cover_image_url, level, is_premium"
               )
               .eq("slug", slug)
               .single();

            if (articleError) throw articleError;
            if (!data) throw new Error("Article not found.");

            setArticle(data as Article);
         } catch (requestError) {
            console.error(requestError);
            setError(getErrorMessage(requestError, "Failed to load article"));
         } finally {
            setLoading(false);
         }
      };

      if (slug) load();
   }, [slug, router]);

   useEffect(() => {
      const loadProgress = async () => {
         if (!userId || !article?.id) return;

         try {
            setProgressLoading(true);
            setProgressError(null);

            const { data, error: progressErrorResult } = await supabase
               .from("reading_progress")
               .select("finished")
               .eq("user_id", userId)
               .eq("article_id", article.id)
               .maybeSingle();

            if (progressErrorResult) throw progressErrorResult;

            setIsFinished(Boolean(data?.finished));
         } catch (requestError) {
            console.warn(requestError);
            setProgressError(
               getErrorMessage(requestError, "Could not load reading progress.")
            );
         } finally {
            setProgressLoading(false);
         }
      };

      loadProgress();
   }, [userId, article?.id]);

   const toggleFinished = async () => {
      if (!userId || !article?.id) return;

      try {
         setProgressLoading(true);
         setProgressError(null);

         const nextFinished = !isFinished;

         const { error: updateError } = await supabase
            .from("reading_progress")
            .upsert(
               {
                  user_id: userId,
                  article_id: article.id,
                  finished: nextFinished,
                  finished_at: nextFinished ? new Date().toISOString() : null,
               },
               { onConflict: "user_id,article_id" }
            );

         if (updateError) throw updateError;

         setIsFinished(nextFinished);
      } catch (requestError) {
         console.error(requestError);
         setProgressError(
            getErrorMessage(requestError, "Could not update reading progress.")
         );
      } finally {
         setProgressLoading(false);
      }
   };

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

         const deckName = "Reading - Saved words";

         const { data: decks, error: deckError } = await supabase
            .from("vocabulary_decks")
            .select("id")
            .eq("user_id", userId)
            .eq("title", deckName);

         if (deckError) throw deckError;

         let deckId: string;

         if (!decks || decks.length === 0) {
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
            if (!newDeck?.id) {
               throw new Error("Deck was not created. Please try again.");
            }

            deckId = newDeck.id;
         } else {
            deckId = decks[0].id;
         }

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
               message: `"${payload.word}" is already in your "Reading - Saved words" deck.`,
            });
            return;
         }

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
            message: `Saved "${payload.word}" to your "Reading - Saved words" deck.`,
         });
      } catch (requestError) {
         console.error(requestError);
         setSaveStatus({
            word: payload.word,
            state: "error",
            message: getErrorMessage(
               requestError,
               `Failed to save "${payload.word}". Please try again.`
            ),
         });
      }
   };

   if (loading) {
      return (
         <div className="space-y-4">
            <p className="text-sm text-slate-400">Loading article...</p>
         </div>
      );
   }

   if (error || !article) {
      return (
         <div className="space-y-4">
            <p className="text-sm text-red-400">{error ?? "Article not found."}</p>
         </div>
      );
   }

   const locked = article.is_premium && !isPremium;
   const levelLabel = getReadingLevelLabel(article.level);
   const contentBlocks = normalizeReadingContentBlocks(
      article.content_blocks,
      article.content
   );

   return (
      <div className="mx-auto w-full max-w-6xl space-y-8">
         <button
            onClick={() => router.push("/dashboard/reading")}
            className="text-sm text-slate-400 transition hover:text-emerald-300 cursor-pointer">
            Back to reading list
         </button>

         <section className="overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/40">
            <div className="grid gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
               <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                  <div className="flex flex-wrap items-center gap-2">
                     {levelLabel && (
                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-[0.18em] text-slate-100">
                           {levelLabel}
                        </span>
                     )}
                     {article.is_premium && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/20 px-3 py-1 text-xs uppercase tracking-[0.18em] text-amber-300">
                           Premium
                        </span>
                     )}
                     {!locked && isFinished && (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs uppercase tracking-[0.18em] text-emerald-300">
                           Finished
                        </span>
                     )}
                  </div>

                  <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">
                     {article.title}
                  </h1>

                  {article.short_summary && (
                     <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300 md:text-lg">
                        {article.short_summary}
                     </p>
                  )}

                  {progressError && (
                     <p className="mt-4 text-xs text-amber-300">{progressError}</p>
                  )}
               </div>

               {article.cover_image_url ? (
                  <div className="relative min-h-[240px] border-t border-slate-800 xl:min-h-full xl:border-l xl:border-t-0">
                     <Image
                        src={article.cover_image_url}
                        alt={article.title}
                        fill
                        sizes="(min-width: 1280px) 38vw, 100vw"
                        className="object-cover"
                     />
                     <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent xl:bg-gradient-to-l xl:from-slate-950/10 xl:to-transparent" />
                  </div>
               ) : (
                  <div className="flex min-h-[240px] items-center justify-center border-t border-slate-800 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(2,6,23,0.98))] p-8 text-center text-sm text-slate-400 xl:border-l xl:border-t-0">
                     Add a cover image to give this article a stronger first impression.
                  </div>
               )}
            </div>
         </section>

         {locked ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-200">
               This article is available only for premium members.
               <br />
               Please upgrade your account to read it.
            </div>
         ) : (
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
               <ArticleReader
                  text={article.content}
                  blocks={contentBlocks}
                  onSaveWord={handleSaveWord}
                  saveStatus={saveStatus}
                  showHelper={false}
               />

               <div className="flex flex-col gap-4 rounded-[1.5rem] border border-slate-800 bg-slate-900/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-400">
                     Click any word in the text to see its definition.
                  </p>

                  <button
                     type="button"
                     onClick={toggleFinished}
                     disabled={progressLoading}
                     className={[
                        "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2.5 text-sm transition",
                        progressLoading
                           ? "cursor-not-allowed opacity-60"
                           : "cursor-pointer opacity-95",
                        isFinished
                           ? "border-slate-700/70 bg-slate-900/40 text-slate-200 hover:border-emerald-400/40"
                           : "border-emerald-400/70 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300",
                     ].join(" ")}>
                     <PiCheckCircleLight className="text-base" />
                     <span>
                        {progressLoading
                           ? "Saving..."
                           : isFinished
                             ? "Mark as unfinished"
                             : "Mark as finished"}
                     </span>
                  </button>
               </div>
            </div>
         )}
      </div>
   );
}
