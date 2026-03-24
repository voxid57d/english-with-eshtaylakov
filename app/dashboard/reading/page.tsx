"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import { PiReadCvLogoLight } from "react-icons/pi";

type Article = {
   id: string;
   title: string;
   slug: string;
   short_summary: string | null;
   cover_image_url: string | null;
   level: string | null;
   is_premium: boolean;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
type Level = (typeof LEVELS)[number];
type OpenLevel = "ALL" | Level | "UNASSIGNED";
type ViewMode = "level" | "newest";
type ReadingProgressRow = {
   article_id: string;
};

const LEVEL_LABELS: Record<Level, string> = {
   A1: "Beginner",
   A2: "Elementary",
   B1: "Pre-Inter",
   B2: "Intermediate",
   C1: "IELTS",
};

const LEVEL_CARD_STYLES: Record<
   Level,
   {
      gradient: string;
      accent: string;
      glow: string;
   }
> = {
   A1: {
      gradient: "from-emerald-500 via-teal-500 to-cyan-500",
      accent: "bg-emerald-100/90 text-emerald-950",
      glow: "bg-emerald-300/20",
   },
   A2: {
      gradient: "from-sky-500 via-blue-500 to-indigo-500",
      accent: "bg-sky-100/90 text-sky-950",
      glow: "bg-sky-300/20",
   },
   B1: {
      gradient: "from-amber-400 via-orange-500 to-rose-500",
      accent: "bg-amber-100/90 text-amber-950",
      glow: "bg-amber-300/20",
   },
   B2: {
      gradient: "from-fuchsia-500 via-pink-500 to-rose-500",
      accent: "bg-pink-100/90 text-pink-950",
      glow: "bg-pink-300/20",
   },
   C1: {
      gradient: "from-violet-500 via-indigo-500 to-slate-900",
      accent: "bg-violet-100/90 text-violet-950",
      glow: "bg-violet-300/20",
   },
};

function getErrorMessage(error: unknown, fallback: string) {
   return error instanceof Error ? error.message : fallback;
}

export default function ReadingPage() {
   const [articles, setArticles] = useState<Article[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);

   // UX additions
   const [viewMode, setViewMode] = useState<ViewMode>("level");
   const [openLevel, setOpenLevel] = useState<OpenLevel>("ALL");

   // Finished-reading ids for this user
   const [finishedArticleIds, setFinishedArticleIds] = useState<Set<string>>(
      new Set()
   );

   const router = useRouter();

   const sortUnfinishedFirst = useCallback(
      (list: Article[]) => {
         return [...list].sort((a, b) => {
            const aFinished = finishedArticleIds.has(a.id);
            const bFinished = finishedArticleIds.has(b.id);
            if (aFinished === bFinished) return 0;
            return aFinished ? 1 : -1;
         });
      },
      [finishedArticleIds]
   );

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);

            // 1) Get current user
            const { data: userData, error: userError } =
               await supabase.auth.getUser();
            if (userError) throw userError;

            const user = userData.user;
            if (!user) {
               setError("You must be logged in to see reading exercises.");
               setLoading(false);
               return;
            }

            // 2) Check premium status
            const premium = await getPremiumStatus(user.id);
            setIsPremium(premium);

            // 3) Load articles
            const { data, error: articlesError } = await supabase
               .from("reading_articles")
               .select(
                  "id, title, slug, short_summary, cover_image_url, level, is_premium, created_at"
               )
               .order("created_at", { ascending: false });

            if (articlesError) throw articlesError;
            setArticles((data || []) as Article[]);

            // 4) Load reading progress (finished)
            // If you haven't created reading_progress yet, this will error—create the table first.
            const { data: progressData, error: progressError } = await supabase
               .from("reading_progress")
               .select("article_id")
               .eq("user_id", user.id)
               .eq("finished", true);

            if (progressError) {
               // Don’t block the page if progress table is not ready yet
               console.warn(
                  "reading_progress load warning:",
                  progressError.message
               );
            } else {
               const ids = new Set<string>(
                  ((progressData || []) as ReadingProgressRow[]).map(
                     (row) => row.article_id
                  )
               );
               setFinishedArticleIds(ids);
            }
         } catch (err) {
            console.error(err);
            setError(getErrorMessage(err, "Failed to load articles"));
         } finally {
            setLoading(false);
         }
      };

      load();
   }, []);

   // Helpers
   const getLevelBucket = (a: Article): OpenLevel => {
      const lvl = (a.level || "").trim().toUpperCase();
      if (LEVELS.includes(lvl as Level)) return lvl as Level;
      return "UNASSIGNED";
   };

   const assignedArticles = useMemo(
      () =>
         articles.filter((article) => getLevelBucket(article) !== "UNASSIGNED"),
      [articles]
   );

   const countsByLevel = useMemo(() => {
      const counts: Record<OpenLevel, number> = {
         ALL: assignedArticles.length,
         A1: 0,
         A2: 0,
         B1: 0,
         B2: 0,
         C1: 0,
         UNASSIGNED: 0,
      };
      for (const a of assignedArticles) counts[getLevelBucket(a)]++;
      return counts;
   }, [assignedArticles]);

   const visibleArticles = useMemo(() => {
      // Newest view: all articles, unfinished first, then within each group keep newest order
      // Since we pulled newest first from DB, we can stable-sort by finished.
      if (viewMode === "newest") {
         return sortUnfinishedFirst(assignedArticles);
      }

      // Level view:
      if (openLevel === "ALL") {
         // Show assigned articles grouped by level, with finished items at the bottom of each level.
         const buckets: Level[] = ["A1", "A2", "B1", "B2", "C1"];
         const merged: Article[] = [];
         for (const b of buckets) {
            const bucketArticles = assignedArticles.filter(
               (a) => getLevelBucket(a) === b
            );
            merged.push(...sortUnfinishedFirst(bucketArticles));
         }
         return merged;
      }

      const filtered = assignedArticles.filter(
         (a) => getLevelBucket(a) === openLevel
      );
      return sortUnfinishedFirst(filtered);
   }, [assignedArticles, openLevel, sortUnfinishedFirst, viewMode]);

   const FolderChip = ({
      label,
      value,
      count,
   }: {
      label: string;
      value: OpenLevel;
      count: number;
   }) => {
      const active = openLevel === value;
      return (
         <button
            type="button"
            onClick={() => setOpenLevel(value)}
            className={[
               "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs transition cursor-pointer",
               active
                  ? "border-emerald-400/70 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700/70 bg-slate-900/40 text-slate-200 hover:border-emerald-400/40",
            ].join(" ")}>
            <span>{label}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/70 border border-slate-700 text-slate-200">
               {count}
            </span>
         </button>
      );
   };

   const loadingSkeleton = (
      <section aria-live="polite" aria-busy="true" className="space-y-6">
         <div className="flex flex-wrap items-start justify-between gap-4 sm:flex-nowrap">
            <div className="space-y-3">
               <div className="h-8 w-40 rounded-full bg-slate-700/80 skeleton-shimmer" />
               <div className="h-4 w-96 max-w-full rounded-full bg-slate-900 skeleton-shimmer" />
            </div>

            <div className="h-10 w-44 rounded-full border border-slate-800 bg-slate-900/80 skeleton-shimmer" />
         </div>

         <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, index) => (
               <div
                  key={index}
                  className="h-9 w-24 rounded-full border border-slate-800 bg-slate-900/60 skeleton-shimmer"
               />
            ))}
         </div>

         <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
               <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
                  <div className="min-h-40 space-y-5 bg-slate-900/70 p-5">
                     <div className="flex items-start justify-between gap-3">
                        <div className="h-6 w-20 rounded-full bg-slate-800 skeleton-shimmer" />
                        <div className="h-6 w-18 rounded-full bg-slate-800 skeleton-shimmer" />
                     </div>
                     <div className="space-y-3">
                        <div className="h-8 w-3/4 rounded-full bg-slate-700/80 skeleton-shimmer" />
                        <div className="h-8 w-1/2 rounded-full bg-slate-800/80 skeleton-shimmer" />
                     </div>
                  </div>

                  <div className="relative h-48 overflow-hidden bg-slate-950/70 p-6">
                     <div className="absolute inset-0 bg-slate-900/70 skeleton-shimmer" />
                     <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
                        <div className="w-full max-w-[14rem] rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3">
                           <div className="space-y-2">
                              <div className="h-3 rounded-full bg-slate-800 skeleton-shimmer" />
                              <div className="h-3 w-11/12 rounded-full bg-slate-800/80 skeleton-shimmer" />
                              <div className="h-3 w-8/12 rounded-full bg-slate-800/70 skeleton-shimmer" />
                           </div>
                        </div>

                        <div className="h-8 w-24 shrink-0 rounded-full border border-slate-800 bg-slate-900/70 skeleton-shimmer" />
                     </div>
                  </div>
               </div>
            ))}
         </div>
      </section>
   );

   return (
      <div className="space-y-6">
         {/* Header */}
         <div className="flex items-start justify-between gap-4 flex-wrap sm:flex-nowrap">
            <div>
               <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <PiReadCvLogoLight className="text-emerald-400" />
                  <span>Reading</span>
               </h1>
               <p className="text-slate-400 text-sm">
                  Choose an article and click on words to see definitions.
               </p>
            </div>

            {/* Tabs */}
            <div className="shrink-0">
               <div
                  className="
      inline-flex items-center overflow-hidden
      rounded-full border border-slate-700/70
      bg-slate-900/40
    ">
                  <button
                     type="button"
                     onClick={() => setViewMode("level")}
                     className={[
                        "whitespace-nowrap px-3 py-1 text-xs sm:text-sm sm:px-4 sm:py-1.5 transition cursor-pointer",
                        viewMode === "level"
                           ? "bg-emerald-500/15 text-emerald-200"
                           : "text-slate-200 hover:bg-slate-800/40",
                     ].join(" ")}>
                     By level
                  </button>

                  <div className="w-px self-stretch bg-slate-700/70" />

                  <button
                     type="button"
                     onClick={() => setViewMode("newest")}
                     className={[
                        "whitespace-nowrap px-3 py-1 text-xs sm:text-sm sm:px-4 sm:py-1.5 transition cursor-pointer",
                        viewMode === "newest"
                           ? "bg-emerald-500/15 text-emerald-200"
                           : "text-slate-200 hover:bg-slate-800/40",
                     ].join(" ")}>
                     Newest
                  </button>
               </div>
            </div>
         </div>

         {/* Folder row (only in level mode) */}
         {viewMode === "level" &&
            !loading &&
            !error &&
            assignedArticles.length > 0 && (
            <div className="flex flex-wrap gap-2">
               <FolderChip label="All" value="ALL" count={countsByLevel.ALL} />
               {LEVELS.map((lvl) => (
                  <FolderChip
                     key={lvl}
                     label={LEVEL_LABELS[lvl]}
                     value={lvl}
                     count={countsByLevel[lvl]}
                  />
               ))}
            </div>
         )}

         {loading && loadingSkeleton}

         {error && !loading && <p className="text-red-400 text-sm">{error}</p>}

         {!loading && !error && assignedArticles.length === 0 && (
            <p className="text-slate-400 text-sm">
               No assigned reading articles yet. Add some in Supabase.
            </p>
         )}

         {!loading && !error && visibleArticles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {visibleArticles.map((article) => {
                  const locked = article.is_premium && !isPremium;
                  const finished = finishedArticleIds.has(article.id);
                  const level = getLevelBucket(article) as Level;
                  const levelLabel = LEVEL_LABELS[level];
                  const cardStyle = LEVEL_CARD_STYLES[level];
                  const hasCoverImage = Boolean(article.cover_image_url);

                  const cardContent = (
                     <div
                        className={[
                           "h-full overflow-hidden rounded-2xl border bg-slate-900/60 transition-colors",
                           locked
                              ? "border-slate-800 hover:border-amber-500/40"
                              : "border-slate-800 hover:border-emerald-400/60",
                           finished ? "opacity-70" : "",
                        ].join(" ")}>
                        <div
                           className={[
                              "relative min-h-40 overflow-hidden bg-gradient-to-br p-5",
                              cardStyle.gradient,
                           ].join(" ")}>
                           <div
                              className={[
                                 "absolute -right-6 -top-8 h-28 w-28 rounded-full blur-2xl",
                                 cardStyle.glow,
                              ].join(" ")}
                           />
                           <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.18),transparent_45%)]" />
                           <div className="relative flex h-full flex-col justify-between gap-5">
                              <div className="flex items-start justify-between gap-2">
                                 <span
                                    className={[
                                       "inline-flex w-fit rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                                       cardStyle.accent,
                                    ].join(" ")}>
                                    {levelLabel}
                                 </span>

                                 <div className="flex items-center gap-2">
                                    {finished && (
                                       <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-50 border border-white/20">
                                          Finished
                                       </span>
                                    )}

                                    {article.is_premium && (
                                       <span className="text-xs px-2 py-1 rounded-full bg-slate-950/25 text-white border border-white/20">
                                          Premium
                                       </span>
                                    )}
                                 </div>
                              </div>

                              <div className="relative max-w-[16rem]">
                                 <div className="text-2xl font-semibold leading-tight text-white">
                                    {article.title}
                                 </div>
                              </div>
                           </div>
                        </div>

                        <div className="relative h-48 overflow-hidden bg-slate-950/70">
                           {hasCoverImage ? (
                              <>
                                 <img
                                    src={article.cover_image_url!}
                                    alt={article.title}
                                    className="absolute inset-0 h-full w-full object-cover"
                                 />
                                 <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-900/10" />
                              </>
                           ) : (
                              <>
                                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.12),transparent_22%),radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.08),transparent_18%),linear-gradient(135deg,rgba(15,23,42,0.65),rgba(2,6,23,0.95))]" />
                                 <div
                                    className={[
                                       "absolute left-6 top-8 h-20 w-20 rounded-3xl bg-gradient-to-br opacity-90 blur-[1px]",
                                       cardStyle.gradient,
                                    ].join(" ")}
                                 />
                                 <div
                                    className={[
                                       "absolute bottom-8 right-8 h-24 w-24 rounded-full opacity-70 blur-sm",
                                       cardStyle.glow,
                                    ].join(" ")}
                                 />
                              </>
                           )}
                           <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-4">
                              <div className="max-w-[14rem] rounded-2xl border border-white/10 bg-slate-900/65 px-4 py-3 backdrop-blur-sm">
                                 <div className="text-sm leading-6 text-slate-100 line-clamp-3">
                                    {article.short_summary ||
                                       "A short reading designed to build confidence, vocabulary, and understanding."}
                                 </div>
                              </div>

                              <div className="shrink-0 rounded-full border border-white/10 bg-slate-900/65 px-3 py-1.5 text-xs text-slate-300 backdrop-blur-sm">
                                 {locked
                                    ? "Premium"
                                    : finished
                                    ? "Read again"
                                    : "Start reading"}
                              </div>
                           </div>
                        </div>
                     </div>
                  );

                  return locked ? (
                     <button
                        key={article.id}
                        type="button"
                        onClick={() => router.push("/premium")}
                        className="w-full text-left opacity-80 hover:opacity-100 transition-transform duration-200 hover:-translate-y-1 cursor-pointer">
                        {cardContent}
                     </button>
                  ) : (
                     <Link
                        key={article.id}
                        href={`/dashboard/reading/${article.slug}`}
                        className="transition-transform duration-200 hover:-translate-y-1">
                        {cardContent}
                     </Link>
                  );
               })}
            </div>
         )}
      </div>
   );
}
