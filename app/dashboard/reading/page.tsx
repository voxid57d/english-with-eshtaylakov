"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";

type Article = {
   id: string;
   title: string;
   slug: string;
   short_summary: string | null;
   level: string | null;
   is_premium: boolean;
};

export default function ReadingPage() {
   const [articles, setArticles] = useState<Article[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [isPremium, setIsPremium] = useState(false);

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

            // 3) Load articles from Supabase
            const { data, error: articlesError } = await supabase
               .from("reading_articles")
               .select("id, title, slug, short_summary, level, is_premium")
               .order("created_at", { ascending: false });

            if (articlesError) throw articlesError;

            setArticles(data || []);
         } catch (err: any) {
            console.error(err);
            setError(err.message ?? "Failed to load articles");
         } finally {
            setLoading(false);
         }
      };

      load();
   }, []);

   return (
      <div className="space-y-6">
         <div className="flex items-center justify-between gap-2">
            <div>
               <h1 className="text-2xl font-semibold">Reading</h1>
               <p className="text-slate-400 text-sm">
                  Choose an article and click on words to see definitions.
               </p>
            </div>
         </div>

         {loading && (
            <p className="text-slate-400 text-sm">Loading articles…</p>
         )}

         {error && !loading && <p className="text-red-400 text-sm">{error}</p>}

         {!loading && !error && articles.length === 0 && (
            <p className="text-slate-400 text-sm">
               No reading articles yet. Add some in Supabase.
            </p>
         )}

         {!loading && !error && articles.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {articles.map((article) => {
                  const locked = article.is_premium && !isPremium;

                  const cardContent = (
                     <div className="h-full flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 p-4 hover:border-emerald-400/60 transition-colors">
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
                              : "Open article"}
                        </div>
                     </div>
                  );

                  return locked ? (
                     // Non-premium: show non-clickable card
                     <div key={article.id} className="opacity-80">
                        {cardContent}
                     </div>
                  ) : (
                     // Free or user is premium: clickable link
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
