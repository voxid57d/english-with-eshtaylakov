"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import AdminSectionNav from "@/components/AdminSectionNav";
import {
   blockTypeToQuestionType,
   createPassageBlock,
   createReadingMockBlock,
   createReadingMockPassage,
   createReadingMockQuestion,
   getBlockTemplate,
   parseLinesToOptions,
   serializeOptionsToLines,
   slugifyMockReadingTitle,
   type ReadingMockBlockType,
   type ReadingMockOption,
   type ReadingMockPassage,
   type ReadingMockQuestion,
   type ReadingMockQuestionBlock,
} from "@/lib/ieltsReadingMock";

type AdminReadingMockTest = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   is_premium: boolean;
   is_published: boolean;
   passages: ReadingMockPassage[];
   blocks: ReadingMockQuestionBlock[];
   questions: ReadingMockQuestion[];
   options: ReadingMockOption[];
};

type BlockForm = ReadingMockQuestionBlock & {
   instructionsText: string;
   sharedContentText: string;
   metaText: string;
};

type QuestionForm = ReadingMockQuestion & {
   answerKeyText: string;
   metaText: string;
   optionsText: string;
};

type FormState = {
   title: string;
   slug: string;
   description: string;
   isPremium: boolean;
   isPublished: boolean;
   passages: ReadingMockPassage[];
   blocks: BlockForm[];
   questions: QuestionForm[];
};

const BLOCK_TYPE_OPTIONS: { value: ReadingMockBlockType; label: string }[] = [
   { value: "true_false_not_given_block", label: "TFNG block" },
   { value: "yes_no_not_given_block", label: "Yes / No / NG block" },
   { value: "notes_completion_block", label: "Notes completion" },
   { value: "summary_completion_block", label: "Summary completion" },
   { value: "matching_information_block", label: "Matching information" },
   { value: "matching_people_block", label: "Matching people" },
   { value: "matching_headings_block", label: "Matching headings" },
   { value: "multiple_choice_block", label: "Multiple choice" },
];

async function getAccessToken() {
   const { data, error } = await supabase.auth.getSession();
   if (error || !data.session?.access_token) {
      throw new Error("You must be logged in.");
   }
   return data.session.access_token;
}

function stringifyAnswerKey(value: string | string[] | null) {
   if (Array.isArray(value)) return JSON.stringify(value);
   return value || "";
}

function parseAnswerKey(value: string) {
   const trimmed = value.trim();
   if (!trimmed) return "";
   if (trimmed.startsWith("[")) {
      try {
         const parsed = JSON.parse(trimmed);
         return Array.isArray(parsed) ? parsed : trimmed;
      } catch {
         return trimmed;
      }
   }
   return trimmed;
}

function createBlockForm(block: ReadingMockQuestionBlock): BlockForm {
   return {
      ...block,
      instructionsText: (block.instructions || []).join("\n"),
      sharedContentText: JSON.stringify(block.shared_content || {}, null, 2),
      metaText: JSON.stringify(block.meta || {}, null, 2),
   };
}

function createQuestionForm(
   question: ReadingMockQuestion,
   options: ReadingMockOption[]
): QuestionForm {
   return {
      ...question,
      answerKeyText: stringifyAnswerKey(question.answer_key),
      metaText: JSON.stringify(question.meta || {}, null, 2),
      optionsText: serializeOptionsToLines(
         options.filter((option) => option.question_id === question.id)
      ),
   };
}

function emptyForm(): FormState {
   const passage = createReadingMockPassage(1);
   const block = createReadingMockBlock(passage.id, 1);
   const template = getBlockTemplate(block.type);
   const question = createReadingMockQuestion(
      passage.id,
      block.id,
      1,
      block.type
   );

   return {
      title: "",
      slug: "",
      description: "",
      isPremium: false,
      isPublished: true,
      passages: [passage],
      blocks: [
         {
            ...createBlockForm(block),
            title: template.title,
            instructionsText: template.instructions.join("\n"),
            sharedContentText: JSON.stringify(template.sharedContent, null, 2),
            metaText: JSON.stringify(template.meta, null, 2),
         },
      ],
      questions: [createQuestionForm(question, [])],
   };
}

export default function AdminMockReadingPage() {
   const router = useRouter();
   const [tests, setTests] = useState<AdminReadingMockTest[]>([]);
   const [selectedTestId, setSelectedTestId] = useState("");
   const [form, setForm] = useState<FormState>(emptyForm);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const selectedTest = useMemo(
      () => tests.find((test) => test.id === selectedTestId) || null,
      [tests, selectedTestId]
   );

   useEffect(() => {
      const load = async () => {
         try {
            setLoading(true);
            setError(null);
            const token = await getAccessToken();
            const response = await fetch("/api/admin/mock-reading", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            });
            const payload = await response.json();
            if (!response.ok) {
               if (response.status === 401 || response.status === 403) {
                  router.replace("/dashboard");
                  return;
               }
               throw new Error(payload.error || "Failed to load IELTS reading admin.");
            }
            const nextTests = (payload.tests || []) as AdminReadingMockTest[];
            setTests(nextTests);
            setSelectedTestId(nextTests[0]?.id || "");
         } catch (requestError) {
            setError(
               requestError instanceof Error
                  ? requestError.message
                  : "Failed to load IELTS reading admin."
            );
         } finally {
            setLoading(false);
         }
      };

      void load();
   }, [router]);

   useEffect(() => {
      if (!selectedTest) {
         setForm(emptyForm());
         return;
      }

      setForm({
         title: selectedTest.title,
         slug: selectedTest.slug,
         description: selectedTest.description || "",
         isPremium: selectedTest.is_premium,
         isPublished: selectedTest.is_published,
         passages: [...selectedTest.passages].sort(
            (a, b) => a.passage_number - b.passage_number
         ),
         blocks: [...selectedTest.blocks]
            .sort((a, b) => a.order_index - b.order_index)
            .map(createBlockForm),
         questions: [...selectedTest.questions]
            .sort((a, b) => a.question_number - b.question_number)
            .map((question) => createQuestionForm(question, selectedTest.options)),
      });
   }, [selectedTest]);

   const resetForNew = () => {
      setSelectedTestId("");
      setForm(emptyForm());
      setError(null);
      setSuccess(null);
   };

   const addPassage = () => {
      setForm((current) => ({
         ...current,
         passages: [
            ...current.passages,
            createReadingMockPassage(current.passages.length + 1),
         ],
      }));
   };

   const addBlock = () => {
      setForm((current) => {
         const passageId = current.passages[0]?.id;
         if (!passageId) return current;
         const block = createReadingMockBlock(passageId, current.blocks.length + 1);
         const template = getBlockTemplate(block.type);
         return {
            ...current,
            blocks: [
               ...current.blocks,
               {
                  ...createBlockForm(block),
                  title: template.title,
                  instructionsText: template.instructions.join("\n"),
                  sharedContentText: JSON.stringify(template.sharedContent, null, 2),
                  metaText: JSON.stringify(template.meta, null, 2),
               },
            ],
         };
      });
   };

   const addQuestion = (blockId?: string) => {
      setForm((current) => {
         const resolvedBlockId = blockId || current.blocks[0]?.id;
         const block = current.blocks.find((item) => item.id === resolvedBlockId);
         if (!block) return current;
         const question = createReadingMockQuestion(
            block.passage_id,
            block.id,
            current.questions.length + 1,
            block.type
         );
         return {
            ...current,
            questions: [...current.questions, createQuestionForm(question, [])],
         };
      });
   };

   const submitForm = async (event: FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);

         const token = await getAccessToken();
         const method = selectedTestId ? "PATCH" : "POST";
         const endpoint = selectedTestId
            ? `/api/admin/mock-reading/${selectedTestId}`
            : "/api/admin/mock-reading";

         const passages = form.passages.map((passage, index) => ({
            ...passage,
            passage_number: index + 1,
         }));

         const blocks = form.blocks.map((block, index) => {
            let sharedContent: Record<string, unknown> = {};
            let meta: Record<string, unknown> = {};
            try {
               sharedContent = JSON.parse(block.sharedContentText || "{}");
               meta = JSON.parse(block.metaText || "{}");
            } catch {
               throw new Error(`Block "${block.title || index + 1}" has invalid JSON.`);
            }

            return {
               id: block.id,
               passage_id: block.passage_id,
               order_index: index + 1,
               type: block.type,
               title: block.title,
               instructionsText: block.instructionsText,
               shared_content: sharedContent,
               meta,
            };
         });

         const blockTypeMap = new Map(blocks.map((block) => [block.id, block.type]));

         const questions = form.questions.map((question, index) => {
            let meta: Record<string, unknown> = {};
            try {
               meta = JSON.parse(question.metaText || "{}");
            } catch {
               throw new Error(`Question ${question.question_number} has invalid meta JSON.`);
            }

            return {
               id: question.id,
               passage_id: question.passage_id,
               block_id: question.block_id,
               question_number: question.question_number,
               order_index: index + 1,
               prompt: question.prompt,
               answer_key: parseAnswerKey(question.answerKeyText),
               meta: {
                  ...meta,
                  questionType: blockTypeToQuestionType(
                     blockTypeMap.get(question.block_id) || "true_false_not_given_block"
                  ),
               },
            };
         });

         const options = form.questions.flatMap((question) =>
            parseLinesToOptions(question.optionsText, question.id)
         );

         const response = await fetch(endpoint, {
            method,
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               title: form.title,
               slug: form.slug,
               description: form.description,
               isPremium: form.isPremium,
               isPublished: form.isPublished,
               passages,
               blocks,
               questions,
               options,
            }),
         });
         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to save mock test.");
         }

         const savedTest = payload.test as AdminReadingMockTest;
         setTests((current) =>
            selectedTestId
               ? current.map((item) => (item.id === savedTest.id ? savedTest : item))
               : [savedTest, ...current]
         );
         setSelectedTestId(savedTest.id);
         setSuccess(selectedTestId ? "Mock test updated." : "Mock test created.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save mock test."
         );
      } finally {
         setSaving(false);
      }
   };

   const deleteTest = async (testId: string) => {
      if (!window.confirm("Delete this IELTS reading mock test?")) return;
      try {
         setDeletingId(testId);
         const token = await getAccessToken();
         const response = await fetch(`/api/admin/mock-reading/${testId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
         });
         const payload = await response.json();
         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete mock test.");
         }
         const remaining = tests.filter((test) => test.id !== testId);
         setTests(remaining);
         if (selectedTestId === testId) setSelectedTestId(remaining[0]?.id || "");
         setSuccess("Mock test deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete mock test."
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
                  <h1 className="text-3xl font-semibold">IELTS Reading admin</h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-400">
                     Build real IELTS-style blocks first, then place questions
                     inside them. Use block JSON for formatted content such as
                     note templates, summaries, and shared lists.
                  </p>
               </div>
               <div className="flex items-center gap-3">
                  <Link
                     href="/dashboard/mock/reading"
                     className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                     View reading folder
                  </Link>
                  <button
                     type="button"
                     onClick={resetForNew}
                     className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400">
                     New mock test
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
            <p className="text-sm text-slate-400">Loading IELTS reading admin...</p>
         ) : (
            <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
               <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                  <div className="flex items-center justify-between gap-3">
                     <h2 className="text-lg font-semibold">Mock tests</h2>
                     <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        {tests.length}
                     </span>
                  </div>
                  <div className="mt-4 space-y-3">
                     {tests.length === 0 ? (
                        <p className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-500">
                           No reading mock tests yet.
                        </p>
                     ) : (
                        tests.map((test) => (
                           <button
                              key={test.id}
                              type="button"
                              onClick={() => setSelectedTestId(test.id)}
                              className={[
                                 "w-full rounded-2xl border p-4 text-left transition",
                                 test.id === selectedTestId
                                    ? "border-emerald-500/40 bg-emerald-500/10"
                                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700",
                              ].join(" ")}>
                              <div className="flex items-center justify-between gap-3">
                                 <p className="font-medium text-slate-100">
                                    {test.title}
                                 </p>
                                 <span className="text-xs text-slate-500">
                                    {test.is_published ? "Published" : "Draft"}
                                 </span>
                              </div>
                              <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                                 {test.description || "No description"}
                              </p>
                           </button>
                        ))
                     )}
                  </div>
               </section>

               <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                  <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                     <div>
                        <h2 className="text-xl font-semibold">
                           {selectedTestId ? "Edit mock test" : "Create mock test"}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                           Shared block content uses JSON. Example:
                           {` {"heading":"The Life and Work of Georgia O'Keeffe","body":"- studied art, then worked as a [[1]] in various places"}`}
                        </p>
                     </div>
                     {selectedTestId && (
                        <div className="flex items-center gap-3">
                           <Link
                              href={`/mock/reading/${form.slug || selectedTest?.slug || ""}`}
                              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                              Open learner view
                           </Link>
                           <button
                              type="button"
                              onClick={() => deleteTest(selectedTestId)}
                              disabled={deletingId === selectedTestId}
                              className="rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10 disabled:opacity-60">
                              {deletingId === selectedTestId ? "Deleting..." : "Delete"}
                           </button>
                        </div>
                     )}
                  </div>

                  <form onSubmit={submitForm} className="space-y-8">
                     <div className="grid gap-3 md:grid-cols-2">
                        <input
                           value={form.title}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 title: event.target.value,
                                 slug:
                                    current.slug === "" ||
                                    current.slug ===
                                       slugifyMockReadingTitle(current.title)
                                       ? slugifyMockReadingTitle(event.target.value)
                                       : current.slug,
                              }))
                           }
                           placeholder="Test title"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                        <input
                           value={form.slug}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 slug: slugifyMockReadingTitle(event.target.value),
                              }))
                           }
                           placeholder="Slug"
                           className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                        />
                     </div>

                     <textarea
                        value={form.description}
                        onChange={(event) =>
                           setForm((current) => ({
                              ...current,
                              description: event.target.value,
                           }))
                        }
                        rows={3}
                        placeholder="Description"
                        className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                     />

                     <div className="flex flex-wrap gap-5 text-sm text-slate-300">
                        <label className="inline-flex items-center gap-2">
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
                           Premium only
                        </label>
                        <label className="inline-flex items-center gap-2">
                           <input
                              type="checkbox"
                              checked={form.isPublished}
                              onChange={(event) =>
                                 setForm((current) => ({
                                    ...current,
                                    isPublished: event.target.checked,
                                 }))
                              }
                           />
                           Published
                        </label>
                     </div>

                     <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                           <h3 className="text-lg font-semibold">Passages</h3>
                           <button
                              type="button"
                              onClick={addPassage}
                              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                              Add passage
                           </button>
                        </div>

                        <div className="space-y-4">
                           {form.passages.map((passage) => (
                              <div
                                 key={passage.id}
                                 className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                                 <div className="grid gap-3 md:grid-cols-3">
                                    <input
                                       value={passage.label}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             passages: current.passages.map((item) =>
                                                item.id === passage.id
                                                   ? {
                                                        ...item,
                                                        label: event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       placeholder="READING PASSAGE 1"
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <input
                                       value={passage.title}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             passages: current.passages.map((item) =>
                                                item.id === passage.id
                                                   ? {
                                                        ...item,
                                                        title: event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       placeholder="Passage title"
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <input
                                       value={passage.subtitle || ""}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             passages: current.passages.map((item) =>
                                                item.id === passage.id
                                                   ? {
                                                        ...item,
                                                        subtitle: event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       placeholder="Subtitle"
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                 </div>

                                 <div className="mt-4 space-y-3">
                                    {passage.content_blocks.map((block) => (
                                       <textarea
                                          key={block.id}
                                          value={block.text}
                                          onChange={(event) =>
                                             setForm((current) => ({
                                                ...current,
                                                passages: current.passages.map((item) =>
                                                   item.id === passage.id
                                                      ? {
                                                           ...item,
                                                           content_blocks:
                                                              item.content_blocks.map(
                                                                 (entry) =>
                                                                    entry.id === block.id
                                                                       ? {
                                                                            ...entry,
                                                                            text: event.target.value,
                                                                         }
                                                                       : entry
                                                              ),
                                                        }
                                                      : item
                                                ),
                                             }))
                                          }
                                          rows={block.type === "heading" ? 2 : 4}
                                          placeholder={`${block.type} text`}
                                          className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                       />
                                    ))}
                                 </div>

                                 <div className="mt-3 flex gap-2">
                                    {(["heading", "paragraph", "note"] as const).map(
                                       (type) => (
                                          <button
                                             key={type}
                                             type="button"
                                             onClick={() =>
                                                setForm((current) => ({
                                                   ...current,
                                                   passages: current.passages.map((item) =>
                                                      item.id === passage.id
                                                         ? {
                                                              ...item,
                                                              content_blocks: [
                                                                 ...item.content_blocks,
                                                                 createPassageBlock(type),
                                                              ],
                                                           }
                                                         : item
                                                   ),
                                                }))
                                             }
                                             className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900">
                                             Add {type}
                                          </button>
                                       )
                                    )}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                           <h3 className="text-lg font-semibold">Blocks</h3>
                           <button
                              type="button"
                              onClick={addBlock}
                              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                              Add block
                           </button>
                        </div>

                        <div className="space-y-5">
                           {form.blocks.map((block) => (
                              <div
                                 key={block.id}
                                 className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                                 <div className="grid gap-3 md:grid-cols-3">
                                    <input
                                       value={block.title}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             blocks: current.blocks.map((item) =>
                                                item.id === block.id
                                                   ? {
                                                        ...item,
                                                        title: event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       placeholder="Questions 1-7"
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <select
                                       value={block.passage_id}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             blocks: current.blocks.map((item) =>
                                                item.id === block.id
                                                   ? {
                                                        ...item,
                                                        passage_id: event.target.value,
                                                     }
                                                   : item
                                             ),
                                             questions: current.questions.map((question) =>
                                                question.block_id === block.id
                                                   ? {
                                                        ...question,
                                                        passage_id: event.target.value,
                                                     }
                                                   : question
                                             ),
                                          }))
                                       }
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                       {form.passages.map((passage) => (
                                          <option key={passage.id} value={passage.id}>
                                             {passage.label}
                                          </option>
                                       ))}
                                    </select>
                                    <select
                                       value={block.type}
                                       onChange={(event) =>
                                          setForm((current) => {
                                             const nextType = event.target
                                                .value as ReadingMockBlockType;
                                             const template = getBlockTemplate(nextType);

                                             return {
                                                ...current,
                                                blocks: current.blocks.map((item) =>
                                                   item.id === block.id
                                                      ? {
                                                           ...item,
                                                           type: nextType,
                                                           title:
                                                              item.title.trim() === "" ||
                                                              item.title ===
                                                                 getBlockTemplate(item.type)
                                                                    .title
                                                                 ? template.title
                                                                 : item.title,
                                                           instructionsText:
                                                              item.instructionsText.trim() ===
                                                                 "" ||
                                                              item.instructionsText ===
                                                                 getBlockTemplate(item.type)
                                                                    .instructions
                                                                    .join("\n")
                                                                 ? template.instructions.join(
                                                                      "\n"
                                                                   )
                                                                 : item.instructionsText,
                                                        }
                                                      : item
                                                ),
                                                questions: current.questions.map((question) =>
                                                   question.block_id === block.id
                                                      ? {
                                                           ...question,
                                                           type: blockTypeToQuestionType(
                                                              nextType
                                                           ),
                                                        }
                                                      : question
                                                ),
                                             };
                                          })
                                       }
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                       {BLOCK_TYPE_OPTIONS.map((option) => (
                                          <option key={option.value} value={option.value}>
                                             {option.label}
                                          </option>
                                       ))}
                                    </select>
                                 </div>

                                 <textarea
                                    value={block.instructionsText}
                                    onChange={(event) =>
                                       setForm((current) => ({
                                          ...current,
                                          blocks: current.blocks.map((item) =>
                                             item.id === block.id
                                                ? {
                                                     ...item,
                                                     instructionsText:
                                                        event.target.value,
                                                  }
                                                : item
                                          ),
                                       }))
                                    }
                                    rows={4}
                                    placeholder="One instruction per line"
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                 />
                                 <textarea
                                    value={block.sharedContentText}
                                    onChange={(event) =>
                                       setForm((current) => ({
                                          ...current,
                                          blocks: current.blocks.map((item) =>
                                             item.id === block.id
                                                ? {
                                                     ...item,
                                                     sharedContentText:
                                                        event.target.value,
                                                  }
                                                : item
                                          ),
                                       }))
                                    }
                                    rows={7}
                                    placeholder='Shared content JSON. Example: {"heading":"List of People","options":[{"label":"A","text":"Yanira Pineda"}]}'
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-xs outline-none focus:border-emerald-500"
                                 />
                                 <textarea
                                    value={block.metaText}
                                    onChange={(event) =>
                                       setForm((current) => ({
                                          ...current,
                                          blocks: current.blocks.map((item) =>
                                             item.id === block.id
                                                ? {
                                                     ...item,
                                                     metaText: event.target.value,
                                                  }
                                                : item
                                          ),
                                       }))
                                    }
                                    rows={5}
                                    placeholder='Meta JSON. Example: {"placeholder":"ONE WORD ONLY"}'
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-xs outline-none focus:border-emerald-500"
                                 />
                                 <div className="mt-3 flex gap-2">
                                    <button
                                       type="button"
                                       onClick={() => addQuestion(block.id)}
                                       className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-900">
                                       Add question to block
                                    </button>
                                    <button
                                       type="button"
                                       onClick={() =>
                                          setForm((current) => {
                                             const template = getBlockTemplate(block.type);
                                             return {
                                                ...current,
                                                blocks: current.blocks.map((item) =>
                                                   item.id === block.id
                                                      ? {
                                                           ...item,
                                                           title: template.title,
                                                           instructionsText:
                                                              template.instructions.join(
                                                                 "\n"
                                                              ),
                                                           sharedContentText:
                                                              JSON.stringify(
                                                                 template.sharedContent,
                                                                 null,
                                                                 2
                                                              ),
                                                           metaText:
                                                              JSON.stringify(
                                                                 template.meta,
                                                                 null,
                                                                 2
                                                              ),
                                                        }
                                                      : item
                                                ),
                                             };
                                          })
                                       }
                                       className="rounded-full border border-emerald-500/40 px-3 py-1.5 text-xs text-emerald-300 transition hover:bg-emerald-500/10">
                                       Use template
                                    </button>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="space-y-4">
                        <h3 className="text-lg font-semibold">Questions</h3>
                        <div className="space-y-5">
                           {form.questions.map((question) => (
                              <div
                                 key={question.id}
                                 className="rounded-3xl border border-slate-800 bg-slate-950/60 p-5">
                                 <div className="grid gap-3 md:grid-cols-3">
                                    <input
                                       type="number"
                                       min={1}
                                       value={question.question_number}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             questions: current.questions.map((item) =>
                                                item.id === question.id
                                                   ? {
                                                        ...item,
                                                        question_number:
                                                           Number(event.target.value) || 1,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <select
                                       value={question.block_id}
                                       onChange={(event) => {
                                          const block = form.blocks.find(
                                             (item) => item.id === event.target.value
                                          );
                                          setForm((current) => ({
                                             ...current,
                                             questions: current.questions.map((item) =>
                                                item.id === question.id
                                                   ? {
                                                        ...item,
                                                        block_id: event.target.value,
                                                        passage_id:
                                                           block?.passage_id ||
                                                           item.passage_id,
                                                        type: blockTypeToQuestionType(
                                                           block?.type ||
                                                              "true_false_not_given_block"
                                                        ),
                                                     }
                                                   : item
                                             ),
                                          }));
                                       }}
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500">
                                       {form.blocks.map((block) => (
                                          <option key={block.id} value={block.id}>
                                             {block.title || "Untitled block"}
                                          </option>
                                       ))}
                                    </select>
                                    <input
                                       value={question.type}
                                       disabled
                                       className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400"
                                    />
                                 </div>

                                 <textarea
                                    value={question.prompt}
                                    onChange={(event) =>
                                       setForm((current) => ({
                                          ...current,
                                          questions: current.questions.map((item) =>
                                             item.id === question.id
                                                ? {
                                                     ...item,
                                                     prompt: event.target.value,
                                                  }
                                                : item
                                          ),
                                       }))
                                    }
                                    rows={3}
                                    placeholder="Prompt. For note/summary blocks you can keep this short or empty and rely on [[1]] placeholders in the block."
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                 />

                                 <div className="mt-3 grid gap-3 lg:grid-cols-2">
                                    <textarea
                                       value={question.answerKeyText}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             questions: current.questions.map((item) =>
                                                item.id === question.id
                                                   ? {
                                                        ...item,
                                                        answerKeyText:
                                                           event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       rows={3}
                                       placeholder='Answer key, for example TRUE or ["A","C"]'
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                    <textarea
                                       value={question.optionsText}
                                       onChange={(event) =>
                                          setForm((current) => ({
                                             ...current,
                                             questions: current.questions.map((item) =>
                                                item.id === question.id
                                                   ? {
                                                        ...item,
                                                        optionsText:
                                                           event.target.value,
                                                     }
                                                   : item
                                             ),
                                          }))
                                       }
                                       rows={3}
                                       placeholder={"A|Option text\nB|Option text"}
                                       className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none focus:border-emerald-500"
                                    />
                                 </div>

                                 <textarea
                                    value={question.metaText}
                                    onChange={(event) =>
                                       setForm((current) => ({
                                          ...current,
                                          questions: current.questions.map((item) =>
                                             item.id === question.id
                                                ? {
                                                     ...item,
                                                     metaText: event.target.value,
                                                  }
                                                : item
                                          ),
                                       }))
                                    }
                                    rows={4}
                                    placeholder='Question meta JSON. Example: {"placeholder":"ONE WORD ONLY"}'
                                    className="mt-3 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-xs outline-none focus:border-emerald-500"
                                 />
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="flex justify-end">
                        <button
                           type="submit"
                           disabled={saving}
                           className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                           {saving
                              ? "Saving..."
                              : selectedTestId
                                ? "Update mock test"
                                : "Create mock test"}
                        </button>
                     </div>
                  </form>
               </section>
            </div>
         )}
      </div>
   );
}
