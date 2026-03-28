"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AdminSectionNav from "@/components/AdminSectionNav";
import {
   createReadingBlock,
   getReadingLevelLabel,
   normalizeReadingContentBlocks,
   serializeReadingContentBlocks,
   slugifyReadingTitle,
   type ReadingContentBlock,
} from "@/lib/readingContent";

type AdminReadingArticle = {
   id: string;
   title: string;
   slug: string;
   short_summary: string | null;
   content: string;
   content_blocks: ReadingContentBlock[] | null;
   cover_image_url: string | null;
   level: string | null;
   is_premium: boolean;
   created_at: string;
};

const LEVEL_OPTIONS = ["A1", "A2", "B1", "B2", "C1"] as const;

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }

   return data.session.access_token;
}

function emptyForm() {
   return {
      title: "",
      slug: "",
      shortSummary: "",
      coverImageUrl: "",
      level: "A1",
      content: "",
      isPremium: false,
      blocks: [] as ReadingContentBlock[],
   };
}

export default function AdminReadingPage() {
   const router = useRouter();
   const [articles, setArticles] = useState<AdminReadingArticle[]>([]);
   const [selectedArticleId, setSelectedArticleId] = useState("");
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);
   const [form, setForm] = useState(emptyForm);

   const selectedArticle = useMemo(
      () => articles.find((article) => article.id === selectedArticleId) || null,
      [articles, selectedArticleId]
   );

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch("/api/admin/reading", {
               headers: {
                  Authorization: `Bearer ${token}`,
               },
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               if (response.status === 401 || response.status === 403) {
                  router.replace("/dashboard");
                  return;
               }

               throw new Error(payload.error || "Failed to load reading admin.");
            }

            const nextArticles = (payload.articles || []) as AdminReadingArticle[];
            setArticles(nextArticles);
            setSelectedArticleId(nextArticles[0]?.id || "");
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load reading admin."
            );
         } finally {
            setLoading(false);
         }
      };

      load();
   }, [router]);

   useEffect(() => {
      if (!selectedArticle) {
         setForm(emptyForm());
         return;
      }

      setForm({
         title: selectedArticle.title,
         slug: selectedArticle.slug,
         shortSummary: selectedArticle.short_summary || "",
         coverImageUrl: selectedArticle.cover_image_url || "",
         level: selectedArticle.level || "A1",
         content: selectedArticle.content || "",
         isPremium: selectedArticle.is_premium,
         blocks: normalizeReadingContentBlocks(
            selectedArticle.content_blocks,
            selectedArticle.content
         ),
      });
   }, [selectedArticle]);

   const updateBlock = (
      blockId: string,
      updater: (block: ReadingContentBlock) => ReadingContentBlock
   ) => {
      setForm((current) => ({
         ...current,
         blocks: current.blocks.map((block) =>
            block.id === blockId ? updater(block) : block
         ),
      }));
   };

   const moveBlock = (blockId: string, direction: -1 | 1) => {
      setForm((current) => {
         const currentIndex = current.blocks.findIndex(
            (block) => block.id === blockId
         );
         if (currentIndex === -1) return current;

         const nextIndex = currentIndex + direction;
         if (nextIndex < 0 || nextIndex >= current.blocks.length) return current;

         const nextBlocks = [...current.blocks];
         const [block] = nextBlocks.splice(currentIndex, 1);
         nextBlocks.splice(nextIndex, 0, block);

         return {
            ...current,
            blocks: nextBlocks,
         };
      });
   };

   const removeBlock = (blockId: string) => {
      setForm((current) => ({
         ...current,
         blocks: current.blocks.filter((block) => block.id !== blockId),
      }));
   };

   const addBlock = (type: ReadingContentBlock["type"]) => {
      setForm((current) => ({
         ...current,
         blocks: [...current.blocks, createReadingBlock(type)],
      }));
   };

   const resetForNew = () => {
      setSelectedArticleId("");
      setForm(emptyForm());
      setError(null);
      setSuccess(null);
   };

   const handleSubmit = async (event: FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const method = selectedArticleId ? "PATCH" : "POST";
         const endpoint = selectedArticleId
            ? `/api/admin/reading/${selectedArticleId}`
            : "/api/admin/reading";

         const response = await fetch(endpoint, {
            method,
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               title: form.title,
               slug: form.slug,
               shortSummary: form.shortSummary,
               coverImageUrl: form.coverImageUrl,
               level: form.level,
               content: form.content,
               isPremium: form.isPremium,
               contentBlocks: serializeReadingContentBlocks(form.blocks),
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save article.");
         }

         const savedArticle = payload.article as AdminReadingArticle;
         setArticles((current) => {
            if (selectedArticleId) {
               return current.map((article) =>
                  article.id === savedArticle.id ? savedArticle : article
               );
            }

            return [savedArticle, ...current];
         });
         setSelectedArticleId(savedArticle.id);
         setSuccess(selectedArticleId ? "Article updated." : "Article created.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save article."
         );
      } finally {
         setSaving(false);
      }
   };

   const handleDelete = async (articleId: string) => {
      const confirmed = window.confirm(
         "Delete this reading article? This cannot be undone."
      );
      if (!confirmed) return;

      try {
         setDeletingId(articleId);
         setError(null);
         setSuccess(null);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/reading/${articleId}`, {
            method: "DELETE",
            headers: {
               Authorization: `Bearer ${token}`,
            },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete article.");
         }

         const remaining = articles.filter((article) => article.id !== articleId);
         setArticles(remaining);

         if (selectedArticleId === articleId) {
            setSelectedArticleId(remaining[0]?.id || "");
            if (remaining.length === 0) {
               setForm(emptyForm());
            }
         }

         setSuccess("Article deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete article."
         );
      } finally {
         setDeletingId(null);
      }
   };

   return (
      <div className="space-y-6">
         <div className="space-y-4">
            <AdminSectionNav />

            <div className="flex flex-wrap items-center justify-between gap-3">
               <div>
                  <h1 className="text-3xl font-semibold">Reading admin</h1>
                  <p className="mt-2 text-sm text-slate-400">
                     Create and edit reading articles with cover images and structured body blocks.
                  </p>
               </div>

               <div className="flex items-center gap-3">
                  <Link
                     href="/dashboard/reading"
                     className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                     View reading
                  </Link>
                  <button
                     type="button"
                     onClick={resetForNew}
                     className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                     New article
                  </button>
               </div>
            </div>
         </div>

         {error && (
            <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </p>
         )}

         {success && (
            <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
               {success}
            </p>
         )}

         {loading ? (
            <p className="text-sm text-slate-400">Loading reading admin...</p>
         ) : (
            <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
               <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                     <h2 className="text-lg font-semibold">Articles</h2>
                     <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {articles.length}
                     </span>
                  </div>

                  <div className="mt-4 space-y-3">
                     {articles.length === 0 ? (
                        <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-500">
                           No reading articles yet.
                        </p>
                     ) : (
                        articles.map((article) => {
                           const active = article.id === selectedArticleId;

                           return (
                              <button
                                 key={article.id}
                                 type="button"
                                 onClick={() => setSelectedArticleId(article.id)}
                                 className={[
                                    "w-full rounded-2xl border p-4 text-left transition cursor-pointer",
                                    active
                                       ? "border-emerald-500/40 bg-emerald-500/10"
                                       : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                                 ].join(" ")}>
                                 <div className="flex items-center justify-between gap-3">
                                    <p className="font-medium text-slate-100">
                                       {article.title}
                                    </p>
                                    <span className="text-xs text-slate-400">
                                       {getReadingLevelLabel(article.level) || "No level"}
                                    </span>
                                 </div>
                                 {article.short_summary && (
                                    <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                                       {article.short_summary}
                                    </p>
                                 )}
                              </button>
                           );
                        })
                     )}
                  </div>
               </section>

               <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                  <div className="mb-5 flex items-center justify-between gap-3">
                     <div>
                        <h2 className="text-xl font-semibold">
                           {selectedArticleId ? "Edit article" : "Create article"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                           Covers and body images should use public Supabase storage URLs.
                        </p>
                     </div>

                     {selectedArticleId && (
                        <button
                           type="button"
                           onClick={() => handleDelete(selectedArticleId)}
                           disabled={deletingId === selectedArticleId}
                           className="rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-60">
                           {deletingId === selectedArticleId ? "Deleting..." : "Delete"}
                        </button>
                     )}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                     <div className="grid gap-3 md:grid-cols-2">
                        <input
                           value={form.title}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 title: event.target.value,
                                 slug:
                                    current.slug === "" ||
                                    current.slug === slugifyReadingTitle(current.title)
                                       ? slugifyReadingTitle(event.target.value)
                                       : current.slug,
                              }))
                           }
                           placeholder="Title"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <div className="flex gap-2">
                           <input
                              value={form.slug}
                              onChange={(event) =>
                                 setForm((current) => ({
                                    ...current,
                                    slug: event.target.value,
                                 }))
                              }
                              placeholder="Slug"
                              className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                           />
                           <button
                              type="button"
                              onClick={() =>
                                 setForm((current) => ({
                                    ...current,
                                    slug: slugifyReadingTitle(current.title),
                                 }))
                              }
                              className="rounded-2xl border border-slate-700 px-4 py-3 text-sm text-slate-300 transition hover:bg-slate-800">
                              Generate
                           </button>
                        </div>
                        <textarea
                           value={form.shortSummary}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 shortSummary: event.target.value,
                              }))
                           }
                           rows={3}
                           placeholder="Short summary"
                           className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 md:col-span-2"
                        />
                        <input
                           value={form.coverImageUrl}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 coverImageUrl: event.target.value,
                              }))
                           }
                           placeholder="Cover image URL"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 md:col-span-2"
                        />
                        <select
                           value={form.level}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 level: event.target.value,
                              }))
                           }
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                           {LEVEL_OPTIONS.map((level) => (
                              <option key={level} value={level}>
                                 {level} - {getReadingLevelLabel(level)}
                              </option>
                           ))}
                        </select>
                        <label className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                           <input
                              type="checkbox"
                              checked={form.isPremium}
                              onChange={(event) =>
                                 setForm((current) => ({
                                    ...current,
                                    isPremium: event.target.checked,
                                 }))
                              }
                           />
                           Premium article
                        </label>
                     </div>

                     <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                           <div>
                              <h3 className="text-lg font-semibold">Body blocks</h3>
                              <p className="text-sm text-slate-400">
                                 Use paragraph, heading, and image blocks for richer articles.
                              </p>
                           </div>

                           <div className="flex flex-wrap gap-2">
                              <button
                                 type="button"
                                 onClick={() => addBlock("paragraph")}
                                 className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800">
                                 Add paragraph
                              </button>
                              <button
                                 type="button"
                                 onClick={() => addBlock("heading")}
                                 className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800">
                                 Add heading
                              </button>
                              <button
                                 type="button"
                                 onClick={() => addBlock("image")}
                                 className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800">
                                 Add image
                              </button>
                           </div>
                        </div>

                        {form.blocks.length === 0 ? (
                           <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-500">
                              No structured blocks yet. Add one or rely on the legacy plain-text content below.
                           </p>
                        ) : (
                           <div className="space-y-3">
                              {form.blocks.map((block, index) => (
                                 <div
                                    key={block.id}
                                    className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                       <div className="text-sm font-medium text-slate-200">
                                          Block {index + 1}: {block.type}
                                       </div>
                                       <div className="flex flex-wrap gap-2">
                                          <button
                                             type="button"
                                             onClick={() => moveBlock(block.id, -1)}
                                             className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800">
                                             Up
                                          </button>
                                          <button
                                             type="button"
                                             onClick={() => moveBlock(block.id, 1)}
                                             className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800">
                                             Down
                                          </button>
                                          <button
                                             type="button"
                                             onClick={() => removeBlock(block.id)}
                                             className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10">
                                             Remove
                                          </button>
                                       </div>
                                    </div>

                                    {block.type === "paragraph" && (
                                       <div className="mt-3 grid gap-3">
                                          <textarea
                                             value={block.text}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   text: event.target.value,
                                                }))
                                             }
                                             rows={4}
                                             placeholder="Paragraph text. Use **bold** and *italic* for inline emphasis."
                                             className="resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                          />
                                          <div className="grid gap-3 md:grid-cols-4">
                                             <select
                                                value={block.tone || "body"}
                                                onChange={(event) =>
                                                   updateBlock(block.id, (current) => ({
                                                      ...current,
                                                      tone: event.target.value as
                                                         | "body"
                                                         | "large"
                                                         | "small",
                                                   }))
                                                }
                                                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                                <option value="body">Body</option>
                                                <option value="large">Large</option>
                                                <option value="small">Small</option>
                                             </select>
                                             <select
                                                value={block.align || "left"}
                                                onChange={(event) =>
                                                   updateBlock(block.id, (current) => ({
                                                      ...current,
                                                      align: event.target.value as
                                                         | "left"
                                                         | "center",
                                                   }))
                                                }
                                                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                                <option value="left">Left</option>
                                                <option value="center">Center</option>
                                             </select>
                                             <label className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                                                <input
                                                   type="checkbox"
                                                   checked={block.bold === true}
                                                   onChange={(event) =>
                                                      updateBlock(block.id, (current) => ({
                                                         ...current,
                                                         bold: event.target.checked,
                                                      }))
                                                   }
                                                />
                                                Bold block
                                             </label>
                                             <label className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-300">
                                                <input
                                                   type="checkbox"
                                                   checked={block.italic === true}
                                                   onChange={(event) =>
                                                      updateBlock(block.id, (current) => ({
                                                         ...current,
                                                         italic: event.target.checked,
                                                      }))
                                                   }
                                                />
                                                Italic block
                                             </label>
                                          </div>
                                       </div>
                                    )}

                                    {block.type === "heading" && (
                                       <div className="mt-3 grid gap-3 md:grid-cols-3">
                                          <input
                                             value={block.text}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   text: event.target.value,
                                                }))
                                             }
                                             placeholder="Heading text"
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500 md:col-span-2"
                                          />
                                          <select
                                             value={block.level || "h2"}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   level: event.target.value as "h2" | "h3",
                                                }))
                                             }
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                             <option value="h2">H2</option>
                                             <option value="h3">H3</option>
                                          </select>
                                          <select
                                             value={block.align || "left"}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   align: event.target.value as
                                                      | "left"
                                                      | "center",
                                                }))
                                             }
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                             <option value="left">Left</option>
                                             <option value="center">Center</option>
                                          </select>
                                       </div>
                                    )}

                                    {block.type === "image" && (
                                       <div className="mt-3 grid gap-3">
                                          <input
                                             value={block.url}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   url: event.target.value,
                                                }))
                                             }
                                             placeholder="Image URL"
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                          />
                                          <input
                                             value={block.caption || ""}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   caption: event.target.value,
                                                }))
                                             }
                                             placeholder="Caption"
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                          />
                                          <select
                                             value={block.width || "full"}
                                             onChange={(event) =>
                                                updateBlock(block.id, (current) => ({
                                                   ...current,
                                                   width: event.target.value as
                                                      | "full"
                                                      | "narrow",
                                                }))
                                             }
                                             className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                             <option value="full">Full width</option>
                                             <option value="narrow">Narrow</option>
                                          </select>
                                       </div>
                                    )}
                                 </div>
                              ))}
                           </div>
                        )}
                     </div>

                     <div className="space-y-3">
                        <div>
                           <h3 className="text-lg font-semibold">Legacy plain text</h3>
                           <p className="text-sm text-slate-400">
                              Existing articles still fall back to this when no structured blocks are present.
                           </p>
                        </div>

                        <textarea
                           value={form.content}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 content: event.target.value,
                              }))
                           }
                           rows={12}
                           placeholder="Legacy plain-text body"
                           className="w-full resize-y rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                     </div>

                     <button
                        type="submit"
                        disabled={saving}
                        className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                        {saving
                           ? "Saving..."
                           : selectedArticleId
                             ? "Save article"
                             : "Create article"}
                     </button>
                  </form>
               </section>
            </div>
         )}
      </div>
   );
}
