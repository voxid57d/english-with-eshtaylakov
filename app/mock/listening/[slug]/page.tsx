"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ---------- Types ----------

type ListeningTest = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   audio_url: string | null;
};

type ListeningSection = {
   id: string;
   test_id: string;
   section_number: number;
   title: string | null;
   instructions: string | null;
};

type ListeningBlock = {
   id: string;
   section_id: string;
   order_index: number;
   type: string;
   content: string | null;
   question_id: string | null;
   extra_data: any | null;
};

type ListeningQuestion = {
   id: string;
   section_id: string;
   question_number: number;
   type: string;
   prompt: string | null;
   correct_answer: string | null;
};

type ListeningOption = {
   id: string;
   question_id: string;
   label: string;
   text: string;
};

type AnswerMap = {
   [questionId: string]: string;
};

export default function ListeningTestPage() {
   const params = useParams();
   const router = useRouter();
   const slug = params.slug as string;

   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);

   const [test, setTest] = useState<ListeningTest | null>(null);
   const [sections, setSections] = useState<ListeningSection[]>([]);
   const [section, setSection] = useState<ListeningSection | null>(null); // active section

   const [blocks, setBlocks] = useState<ListeningBlock[]>([]);
   const [questions, setQuestions] = useState<ListeningQuestion[]>([]);
   const [options, setOptions] = useState<ListeningOption[]>([]);

   const [answers, setAnswers] = useState<AnswerMap>({});
   const [submitting, setSubmitting] = useState(false);

   const [activePart, setActivePart] = useState<1 | 2 | 3 | 4>(1);

   const PARTS = [
      { part: 1 as const, label: "Part 1", start: 1, end: 10 },
      { part: 2 as const, label: "Part 2", start: 11, end: 20 },
      { part: 3 as const, label: "Part 3", start: 21, end: 30 },
      { part: 4 as const, label: "Part 4", start: 31, end: 40 },
   ];

   function getPartForQuestionNumber(n: number): 1 | 2 | 3 | 4 {
      if (n <= 10) return 1;
      if (n <= 20) return 2;
      if (n <= 30) return 3;
      return 4;
   }

   function setActivePartAndJump(part: 1 | 2 | 3 | 4) {
      setActivePart(part);

      // Optional: jump to the first question in that part (if exists)
      const meta = PARTS.find((p) => p.part === part)!;
      const firstQ = orderedQuestions.find(
         (q) =>
            q.question_number >= meta.start && q.question_number <= meta.end,
      );

      if (firstQ) {
         handleQuestionJump(firstQ);
      }
   }

   // For scrolling to a specific question
   const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});

   // ---------- Helper maps ----------

   const questionMap: Record<string, ListeningQuestion> = {};
   questions.forEach((q) => {
      questionMap[q.id] = q;
   });

   const optionsByQuestion: Record<string, ListeningOption[]> = {};
   options.forEach((opt) => {
      if (!optionsByQuestion[opt.question_id]) {
         optionsByQuestion[opt.question_id] = [];
      }
      optionsByQuestion[opt.question_id].push(opt);
   });

   // Group dropdown questions (like 27–30) by section
   const dropdownGroupsBySection: Record<string, ListeningQuestion[]> = {};
   questions.forEach((q) => {
      if (q.type === "mcq_dropdown") {
         if (!dropdownGroupsBySection[q.section_id]) {
            dropdownGroupsBySection[q.section_id] = [];
         }
         dropdownGroupsBySection[q.section_id].push(q);
      }
   });

   // Make sure each group is ordered by question number
   Object.values(dropdownGroupsBySection).forEach((group) => {
      group.sort((a, b) => a.question_number - b.question_number);
   });

   const orderedQuestions = [...questions].sort(
      (a, b) => a.question_number - b.question_number,
   );

   // ---------- Load test / sections / blocks / questions / options ----------

   useEffect(() => {
      async function load() {
         try {
            setLoading(true);
            setError(null);

            // 🔐 1) Check if user is logged in
            const { data: userData, error: userError } =
               await supabase.auth.getUser();
            if (userError || !userData.user) {
               router.push("/login");
               return; // ⛔ stop loading test
            }

            // 1) Test by slug
            const { data: testData, error: testError } = await supabase
               .from("listening_tests")
               .select("*")
               .eq("slug", slug)
               .maybeSingle();

            if (testError) throw testError;
            if (!testData) {
               setError("Test not found");
               setLoading(false);
               return;
            }

            setTest(testData as ListeningTest);

            // 2) Sections for this test
            const { data: sectionsData, error: sectionsError } = await supabase
               .from("listening_sections")
               .select("*")
               .eq("test_id", testData.id)
               .order("section_number", { ascending: true });

            if (sectionsError) throw sectionsError;
            if (!sectionsData || sectionsData.length === 0) {
               setError("No sections for this test");
               setLoading(false);
               return;
            }

            const typedSections = sectionsData as ListeningSection[];
            setSections(typedSections);
            setSection(typedSections[0]); // start at Section 1

            const sectionIds = typedSections.map((s) => s.id);

            // 3) Blocks
            const { data: blocksData, error: blocksError } = await supabase
               .from("listening_blocks")
               .select("*")
               .in("section_id", sectionIds)
               .order("order_index", { ascending: true });

            if (blocksError) throw blocksError;
            setBlocks((blocksData || []) as ListeningBlock[]);

            // 4) Questions
            const { data: questionsData, error: questionsError } =
               await supabase
                  .from("listening_questions")
                  .select("*")
                  .in("section_id", sectionIds)
                  .order("question_number", { ascending: true });

            if (questionsError) throw questionsError;
            setQuestions((questionsData || []) as ListeningQuestion[]);

            // 5) Options
            const questionIds = (questionsData || []).map(
               (q: any) => q.id as string,
            );

            if (questionIds.length > 0) {
               const { data: optionsData, error: optionsError } = await supabase
                  .from("listening_options")
                  .select("*")
                  .in("question_id", questionIds);

               if (optionsError) throw optionsError;
               setOptions((optionsData || []) as ListeningOption[]);
            } else {
               setOptions([]);
            }

            setLoading(false);
         } catch (err) {
            console.error(err);
            setError("Failed to load test");
            setLoading(false);
         }
      }

      load();
   }, [slug]);

   // ---------- Answer handling ----------

   function handleAnswerChange(questionId: string, value: string) {
      setAnswers((prev) => ({
         ...prev,
         [questionId]: value,
      }));
   }

   // ---------- Scoring ----------

   function computeScore() {
      let score = 0;

      for (const q of questions) {
         const userAnswerRaw = answers[q.id] ?? "";
         const userAnswer = userAnswerRaw.trim();
         if (!userAnswer) continue;

         if (q.type === "mcq_single" || q.type === "mcq_dropdown") {
            // For both radio and dropdown, compare letters directly (A, B, C, ...)
            if (userAnswer === (q.correct_answer || "")) {
               score += 1;
            }
         } else {
            // generic short-answer (gap-fill)
            const correct = (q.correct_answer || "").trim();
            if (correct && userAnswer.toLowerCase() === correct.toLowerCase()) {
               score += 1;
            }
         }
      }

      return score;
   }

   // ---------- Submit whole test ----------

   async function handleSubmit() {
      if (!test) return;
      if (submitting) return;

      try {
         setSubmitting(true);

         const { data: userData, error: userError } =
            await supabase.auth.getUser();
         if (userError) throw userError;

         const user = userData.user;
         if (!user) {
            router.push("/login");
            return;
         }

         const scoreRaw = computeScore();

         const { data: attemptData, error: attemptError } = await supabase
            .from("listening_attempts")
            .insert({
               user_id: user.id,
               test_id: test.id,
               score_raw: scoreRaw,
               completed_at: new Date().toISOString(),
            })
            .select("*")
            .single();

         if (attemptError) throw attemptError;
         const attemptId = attemptData.id as string;

         const answersToInsert = questions.map((q) => {
            const userAnswerRaw = answers[q.id] ?? "";
            const userAnswer = userAnswerRaw.trim();

            let isCorrect: boolean | null = null;
            if (userAnswer) {
               if (q.type === "mcq_single") {
                  isCorrect = userAnswer === (q.correct_answer || "");
               } else {
                  const correct = (q.correct_answer || "").trim();
                  if (correct) {
                     isCorrect =
                        userAnswer.toLowerCase() === correct.toLowerCase();
                  }
               }
            }

            return {
               attempt_id: attemptId,
               question_id: q.id,
               answer_text: userAnswer,
               is_correct: isCorrect,
            };
         });

         const { error: answersError } = await supabase
            .from("listening_answers")
            .insert(answersToInsert);

         if (answersError) throw answersError;

         router.push(`/mock/listening/${slug}/results/${attemptId}`);
      } catch (err) {
         console.error("Error submitting listening test:", err);
         alert("Something went wrong while submitting your answers.");
      } finally {
         setSubmitting(false);
      }
   }

   // ---------- Nav buttons: jump to question + switch section ----------

   function handleQuestionJump(q: ListeningQuestion) {
      setActivePart(getPartForQuestionNumber(q.question_number));

      if (!section || section.id !== q.section_id) {
         const targetSection = sections.find((s) => s.id === q.section_id);
         if (targetSection) {
            setSection(targetSection);
         }
      }

      setTimeout(() => {
         const el = questionRefs.current[q.id];
         if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
         }
      }, 80);
   }

   // ---------- Block renderer ----------

   function renderBlock(block: ListeningBlock) {
      if (block.type === "text") {
         return (
            <p key={block.id} className="mb-2 text-slate-200">
               {block.content}
            </p>
         );
      }

      if (block.type === "heading") {
         return (
            <div
               key={block.id}
               className="mt-4 mb-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
               <p className="text-sm font-semibold text-slate-100">
                  {block.content}
               </p>
            </div>
         );
      }

      if (block.type === "gap_sentence" && block.question_id) {
         const q = questionMap[block.question_id];
         const extra = (block.extra_data || {}) as {
            before?: string;
            after?: string;
         };

         if (!q) return null;

         return (
            <div
               key={block.id}
               ref={(el) => {
                  questionRefs.current[q.id] = el;
               }}
               className="mb-2 text-slate-200">
               {/* Make everything inline: number + sentence + gap */}
               <span className="inline-flex flex-wrap items-baseline gap-1">
                  {/* BEFORE text */}
                  {extra.before && <span>{extra.before}</span>}

                  {/* Question number right before the gap */}
                  <span
                     className="inline-flex items-center justify-center
                 w-5 h-5 rounded-full border border-emerald-400
                 text-xs font-semibold text-emerald-300">
                     {q.question_number}
                  </span>

                  {/* The gap itself */}
                  <input
                     className="inline-block border-b border-emerald-400 bg-transparent px-1 text-emerald-200 focus:outline-none min-w-[80px]"
                     value={answers[q.id] || ""}
                     onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                  />

                  {/* AFTER text */}
                  {extra.after && <span>{extra.after}</span>}
               </span>
            </div>
         );
      }

      if (block.type === "question" && block.question_id) {
         const q = questionMap[block.question_id];
         if (!q) return null;

         const opts = optionsByQuestion[q.id] || [];
         if (q.type === "mcq_single") {
            return (
               <div
                  key={block.id}
                  ref={(el) => {
                     questionRefs.current[q.id] = el;
                  }}
                  className="mb-5 rounded-xl border border-slate-700 bg-slate-900/50 p-4">
                  {/* Question header */}
                  <div className="flex items-start gap-3">
                     <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600 bg-slate-950 text-sm font-bold text-slate-100">
                        {q.question_number}
                     </div>

                     <div className="flex-1">
                        <p className="text-slate-100 font-medium leading-relaxed">
                           {q.prompt}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                           Choose one answer (A, B or C)
                        </p>
                     </div>
                  </div>

                  {/* Options */}
                  <div className="mt-4 grid gap-2">
                     {opts.map((opt) => {
                        const selected = answers[q.id] === opt.label;

                        return (
                           <label
                              key={opt.id}
                              className={`group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition
                ${
                   selected
                      ? "border-emerald-400 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-950/30 hover:border-slate-500"
                }`}>
                              {/* Keep input for accessibility, but hide visually */}
                              <input
                                 type="radio"
                                 name={q.id}
                                 value={opt.label}
                                 checked={selected}
                                 onChange={(e) =>
                                    handleAnswerChange(q.id, e.target.value)
                                 }
                                 className="sr-only"
                              />

                              {/* Option badge (A/B/C) */}
                              <div
                                 className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition
                  ${
                     selected
                        ? "border-emerald-400 text-emerald-200"
                        : "border-slate-600 text-slate-300 group-hover:border-slate-400"
                  }`}>
                                 {opt.label}
                              </div>

                              {/* Option text */}
                              <div className="text-slate-200">{opt.text}</div>

                              {/* Selected indicator dot on the right */}
                              <div className="ml-auto">
                                 <div
                                    className={`h-3.5 w-3.5 rounded-full border transition
                    ${
                       selected
                          ? "border-emerald-400 bg-emerald-400"
                          : "border-slate-600 bg-transparent"
                    }`}
                                 />
                              </div>
                           </label>
                        );
                     })}
                  </div>
               </div>
            );
         }

         /**
          * Special handling for "matching" questions like 27–30:
          * - One shared Opinions list (A–F) on top
          * - Each question has a dropdown with letters A–F
          * - When a letter is chosen anywhere, the corresponding opinion line is
          *   shown with line-through.
          */
         if (q.type === "mcq_dropdown") {
            const group = dropdownGroupsBySection[q.section_id] || [];
            const isGroup = group.length > 1;

            // If this is part of a group and it's NOT the first question in that group,
            // we don't render anything here (the first block will render the whole group).
            if (isGroup && group[0].id !== q.id) {
               return null;
            }

            // Use the options of the first question in the group (A–F with full text)
            const masterQuestion = isGroup ? group[0] : q;
            const masterOptions = optionsByQuestion[masterQuestion.id] || [];

            // Which letters are currently used by any question in this group?
            const usedLetters = new Set(
               group
                  .map((g) => (answers[g.id] || "").trim())
                  .filter((v) => v.length > 0),
            );

            return (
               <div
                  key={block.id}
                  ref={(el) => {
                     questionRefs.current[q.id] = el;
                  }}
                  className="mb-6">
                  {/* Instructions / heading */}
                  <p className="mb-2 text-slate-200">
                     What opinion do the students give about each of the
                     following modules on their veterinary science course?
                  </p>
                  <p className="mb-3 text-slate-300 text-sm">
                     Choose FOUR answers from the box and write the correct
                     letter,
                     <span className="font-semibold"> A–F</span>, next to
                     questions {group[0].question_number}–
                     {group[group.length - 1].question_number}.
                  </p>

                  {/* Opinions list (A–F) */}
                  <div className="mb-4 border border-slate-700 rounded-lg p-3 bg-slate-900/70">
                     <p className="text-center font-semibold mb-2">Opinions</p>
                     <ul className="space-y-1 text-sm">
                        {masterOptions.map((opt) => {
                           const isUsed = usedLetters.has(opt.label);
                           return (
                              <li
                                 key={opt.id}
                                 className={`flex gap-2 ${
                                    isUsed ? "line-through opacity-60" : ""
                                 }`}>
                                 <span className="font-semibold w-5">
                                    {opt.label}.
                                 </span>
                                 <span>{opt.text}</span>
                              </li>
                           );
                        })}
                     </ul>
                  </div>

                  {/* Modules with dropdowns */}
                  <div className="space-y-2">
                     {group.map((g) => (
                        <div
                           key={g.id}
                           className="flex flex-wrap items-center gap-2 text-sm">
                           <span className="font-semibold w-6">
                              {g.question_number}.
                           </span>
                           <span className="flex-1 min-w-[160px]">
                              {g.prompt}
                           </span>
                           <select
                              className="bg-slate-900 border border-slate-600 rounded-md px-2 py-1 text-slate-100"
                              value={answers[g.id] || ""}
                              onChange={(e) =>
                                 handleAnswerChange(g.id, e.target.value)
                              }>
                              <option value="">–</option>
                              {masterOptions.map((opt) => (
                                 <option key={opt.id} value={opt.label}>
                                    {opt.label}
                                 </option>
                              ))}
                           </select>
                        </div>
                     ))}
                  </div>
               </div>
            );
         }

         // generic short-answer (text input)
         return (
            <div
               key={block.id}
               ref={(el) => {
                  questionRefs.current[q.id] = el;
               }}
               className="mb-4">
               <p className="mb-2 text-slate-200">
                  {q.question_number}. {q.prompt}
               </p>
               <input
                  className="border-b border-emerald-400 bg-transparent px-1 text-emerald-200 focus:outline-none"
                  value={answers[q.id] || ""}
                  onChange={(e) => handleAnswerChange(q.id, e.target.value)}
               />
            </div>
         );
      }

      // later you can add image / map blocks here
      return null;
   }

   // ---------- Loading / error UI ----------

   if (loading) {
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
            Loading listening test…
         </main>
      );
   }

   if (error || !test || !section) {
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-red-400">
            {error || "Something went wrong"}
         </main>
      );
   }

   const visibleBlocks = blocks
      .filter((b) => b.section_id === section.id)
      .sort((a, b) => a.order_index - b.order_index);

   // ---------- Normal desktop layout + fixed footer ----------

   return (
      <main className="min-h-screen bg-slate-950 text-slate-100 pb-16">
         {/* Main content (scrolls with page) */}
         <div className="w-full px-4 lg:px-10 py-4 lg:py-6">
            {/* Title */}
            <h1 className="text-2xl font-bold mb-2">{test.title}</h1>
            {test.description && (
               <p className="mb-4 text-slate-300">{test.description}</p>
            )}

            {/* Audio */}
            {test.audio_url && (
               <audio controls className="w-full mb-6" src={test.audio_url}>
                  Your browser does not support the audio element.
               </audio>
            )}

            {/* Section header */}
            <h2 className="text-xl font-semibold mb-1">
               {section.title || `Section ${section.section_number}`}
            </h2>
            {section.instructions && (
               <div className="mb-4 rounded-xl border border-slate-700 bg-slate-900/40 p-4">
                  <div className="flex items-start gap-3">
                     <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/50 bg-emerald-500/10 text-emerald-300">
                        i
                     </div>
                     <div>
                        <p className="text-sm font-semibold text-slate-100">
                           Instructions
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-300">
                           {section.instructions}
                        </p>
                     </div>
                  </div>
               </div>
            )}

            {/* Active section content */}
            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
               {visibleBlocks.map((block) => renderBlock(block))}
            </div>
         </div>

         {/* Fixed footer: question navigation + submit */}
         {orderedQuestions.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 bg-slate-950/95 border-t border-slate-800 z-50">
               <div className="w-full px-4 lg:px-10 py-2 flex items-center gap-3">
                  {/* Part switcher + Active-part question buttons */}
                  <div className="flex-1 overflow-x-auto">
                     <div className="flex items-center gap-2 min-w-max">
                        {/* Part buttons (always visible) */}
                        {PARTS.map((p) => {
                           const isActive = p.part === activePart;

                           return (
                              <button
                                 key={p.part}
                                 onClick={() => setActivePartAndJump(p.part)}
                                 className={`h-8 px-3 rounded-full text-xs font-semibold border transition shrink-0
            ${
               isActive
                  ? "bg-emerald-500 text-slate-950 border-emerald-400"
                  : "bg-slate-900 text-slate-200 border-slate-600 hover:border-emerald-400"
            }`}>
                                 {p.label}
                              </button>
                           );
                        })}

                        {/* Divider (optional) */}
                        <span className="mx-1 h-5 w-px bg-slate-700 shrink-0" />

                        {/* Only show questions in the active part */}
                        {(() => {
                           const meta = PARTS.find(
                              (p) => p.part === activePart,
                           )!;
                           const activeQuestions = orderedQuestions.filter(
                              (q) =>
                                 q.question_number >= meta.start &&
                                 q.question_number <= meta.end,
                           );

                           return activeQuestions.map((q) => {
                              const answered =
                                 (answers[q.id] ?? "").trim().length > 0;

                              return (
                                 <button
                                    key={q.id}
                                    onClick={() => handleQuestionJump(q)}
                                    className={`w-8 h-8 rounded-full text-xs font-semibold flex items-center justify-center border transition shrink-0
              ${
                 answered
                    ? "bg-emerald-500 text-slate-950 border-emerald-400"
                    : "bg-slate-900 text-slate-200 border-slate-600 hover:border-emerald-400"
              }`}>
                                    {q.question_number}
                                 </button>
                              );
                           });
                        })()}
                     </div>
                  </div>

                  {/* Submit button */}
                  <button
                     onClick={handleSubmit}
                     disabled={submitting}
                     className="ml-2 inline-flex items-center px-4 py-2 rounded-full
                         bg-emerald-500 text-slate-950 font-semibold text-xs sm:text-sm
                         hover:bg-emerald-400 disabled:opacity-60
                         disabled:cursor-not-allowed whitespace-nowrap transition">
                     {submitting ? "Submitting..." : "Submit answers"}
                  </button>
               </div>
            </div>
         )}
      </main>
   );
}
