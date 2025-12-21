"use client";

import { useEffect, useMemo, useState } from "react";
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
   level: string | null;
   is_premium: boolean;
};

const LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const;
type Level = (typeof LEVELS)[number];
type OpenLevel = "ALL" | Level | "UNASSIGNED";
type ViewMode = "level" | "newest";

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
                  "id, title, slug, short_summary, level, is_premium, created_at"
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
                  (progressData || []).map((r: any) => r.article_id as string)
               );
               setFinishedArticleIds(ids);
            }
         } catch (err: any) {
            console.error(err);
            setError(err.message ?? "Failed to load articles");
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

   const sortUnfinishedFirst = (list: Article[]) => {
      return [...list].sort((a, b) => {
         const aFinished = finishedArticleIds.has(a.id);
         const bFinished = finishedArticleIds.has(b.id);
         if (aFinished === bFinished) return 0;
         return aFinished ? 1 : -1; // finished goes to bottom
      });
   };

   const countsByLevel = useMemo(() => {
      const counts: Record<OpenLevel, number> = {
         ALL: articles.length,
         A1: 0,
         A2: 0,
         B1: 0,
         B2: 0,
         C1: 0,
         UNASSIGNED: 0,
      };
      for (const a of articles) counts[getLevelBucket(a)]++;
      return counts;
   }, [articles]);

   const visibleArticles = useMemo(() => {
      // Newest view: all articles, unfinished first, then within each group keep newest order
      // Since we pulled newest first from DB, we can stable-sort by finished.
      if (viewMode === "newest") {
         return sortUnfinishedFirst(articles);
      }

      // Level view:
      if (openLevel === "ALL") {
         // Show everything but grouped order by level (A1..C1..UNASSIGNED), and finished at bottom inside each level
         const buckets: OpenLevel[] = [
            "A1",
            "A2",
            "B1",
            "B2",
            "C1",
            "UNASSIGNED",
         ];
         const merged: Article[] = [];
         for (const b of buckets) {
            const bucketArticles = articles.filter(
               (a) => getLevelBucket(a) === b
            );
            merged.push(...sortUnfinishedFirst(bucketArticles));
         }
         return merged;
      }

      const filtered = articles.filter((a) => getLevelBucket(a) === openLevel);
      return sortUnfinishedFirst(filtered);
   }, [articles, viewMode, openLevel, finishedArticleIds]);

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
         {viewMode === "level" && !loading && !error && articles.length > 0 && (
            <div className="flex flex-wrap gap-2">
               <FolderChip label="All" value="ALL" count={countsByLevel.ALL} />
               {LEVELS.map((lvl) => (
                  <FolderChip
                     key={lvl}
                     label={lvl}
                     value={lvl}
                     count={countsByLevel[lvl]}
                  />
               ))}
               <FolderChip
                  label="Unassigned"
                  value="UNASSIGNED"
                  count={countsByLevel.UNASSIGNED}
               />
            </div>
         )}

         {loading && (
            <p className="text-slate-400 text-sm">Loading articles…</p>
         )}

         {error && !loading && <p className="text-red-400 text-sm">{error}</p>}

         {!loading && !error && articles.length === 0 && (
            <p className="text-slate-400 text-sm">
               No reading articles yet. Add some in Supabase.
            </p>
         )}

         {!loading && !error && visibleArticles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {visibleArticles.map((article) => {
                  const locked = article.is_premium && !isPremium;
                  const finished = finishedArticleIds.has(article.id);

                  const cardContent = (
                     <div
                        className={[
                           "h-full flex flex-col rounded-xl border bg-slate-900/60 p-4 transition-colors",
                           locked
                              ? "border-slate-800 hover:border-amber-500/40"
                              : "border-slate-800 hover:border-emerald-400/60",
                           finished ? "opacity-70" : "",
                        ].join(" ")}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                           <h2 className="font-semibold text-lg">
                              {article.title}
                           </h2>

                           <div className="flex items-center gap-2">
                              {article.level && (
                                 <span className="text-xs px-2 py-1 rounded-full bg-slate-800 text-slate-200">
                                    {article.level}
                                 </span>
                              )}

                              {finished && (
                                 <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/40">
                                    Finished
                                 </span>
                              )}

                              {article.is_premium && (
                                 <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    Premium
                                 </span>
                              )}
                           </div>
                        </div>

                        {article.short_summary && (
                           <p className="text-slate-300 text-sm flex-1">
                              {article.short_summary}
                           </p>
                        )}

                        <div className="mt-3 text-xs text-slate-400">
                           {locked
                              ? "Upgrade to premium to read this article."
                              : finished
                              ? "Open again"
                              : "Open article"}
                        </div>
                     </div>
                  );

                  return locked ? (
                     <button
                        key={article.id}
                        type="button"
                        onClick={() => router.push("/premium")}
                        className="w-full text-left opacity-80 hover:opacity-100 transition cursor-pointer">
                        {cardContent}
                     </button>
                  ) : (
                     <Link
                        key={article.id}
                        href={`/dashboard/reading/${article.slug}`}>
                        {cardContent}
                     </Link>
                  );
               })}
            </div>
         )}
      </div>
   );
}
