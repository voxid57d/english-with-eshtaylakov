"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
   READING_MOCK_DURATION_SECONDS,
   READING_MOCK_THEME_OPTIONS,
   evaluateReadingMock,
   getQuestionAnswerValue,
   getQuestionsForBlock,
   getThemeConfig,
   isQuestionAnswered,
   type ReadingMockAnswerMap,
   type ReadingMockOption,
   type ReadingMockPassage,
   type ReadingMockQuestion,
   type ReadingMockQuestionBlock,
   type ReadingMockTest,
   type ReadingMockThemeId,
} from "@/lib/ieltsReadingMock";
import {
   PiCheckCircleLight,
   PiArrowCounterClockwiseLight,
   PiClockCountdownLight,
   PiMoonLight,
   PiPaletteLight,
   PiHighlighterLight,
   PiReadCvLogoLight,
   PiSignOutLight,
   PiSunLight,
   PiTreeEvergreenLight,
   PiXCircleLight,
} from "react-icons/pi";

const THEME_ICONS = {
   night: PiMoonLight,
   paper: PiSunLight,
   forest: PiTreeEvergreenLight,
} as const;

function renderInlineTemplate(
   template: string,
   questions: ReadingMockQuestion[],
   answers: ReadingMockAnswerMap,
   submitted: boolean,
   onAnswer: (questionId: string, value: string) => void,
   isLightTheme: boolean
) {
   const parts = template.split(/(\[\[\d+\]\])/g);
   return parts.map((part, index) => {
      const match = part.match(/\[\[(\d+)\]\]/);
      if (!match) {
         return <span key={`${part}-${index}`}>{part}</span>;
      }

      const questionNumber = Number(match[1]);
      const question = questions.find((item) => item.question_number === questionNumber);
      if (!question) return null;

      return (
         <span
            key={question.id}
            className="mx-1 inline-flex items-baseline gap-1.5 align-baseline whitespace-nowrap">
            <span
               className={[
                  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm font-semibold",
                  isLightTheme
                     ? "border-stone-300 bg-stone-100 text-stone-900"
                     : "border-slate-500/60 bg-slate-950/70 text-slate-100",
               ].join(" ")}>
               {question.question_number}
            </span>
            <input
               value={getQuestionAnswerValue(answers, question.id)}
               onChange={(event) => onAnswer(question.id, event.target.value)}
               disabled={submitted}
               className={[
                  "h-8 w-28 rounded-md border px-2.5 py-1 text-sm align-baseline outline-none transition disabled:opacity-70",
                  isLightTheme
                     ? "border-stone-300 bg-white text-stone-900 focus:border-sky-500"
                     : "border-slate-500/60 bg-slate-950/70 text-slate-100 focus:border-emerald-500",
               ].join(" ")}
            />
         </span>
      );
   });
}

function isAnswerCorrect(question: ReadingMockQuestion, answers: ReadingMockAnswerMap) {
   const userAnswer = getQuestionAnswerValue(answers, question.id).trim();
   const correct = question.answer_key;

   if (!userAnswer) return false;

   if (Array.isArray(correct)) {
      const userParts = userAnswer
         .split(",")
         .map((item) => item.trim().toLowerCase())
         .filter(Boolean)
         .sort();
      const correctParts = correct
         .map((item) => item.trim().toLowerCase())
         .filter(Boolean)
         .sort();

      return (
         userParts.length === correctParts.length &&
         userParts.every((item, index) => item === correctParts[index])
      );
   }

   return (
      typeof correct === "string" &&
      userAnswer.toLowerCase() === correct.trim().toLowerCase()
   );
}

export default function ReadingMockTestPage() {
   const params = useParams();
   const router = useRouter();
   const slug = params.slug as string;

   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [submitting, setSubmitting] = useState(false);
   const [submitted, setSubmitted] = useState(false);
   const [test, setTest] = useState<ReadingMockTest | null>(null);
   const [passages, setPassages] = useState<ReadingMockPassage[]>([]);
   const [blocks, setBlocks] = useState<ReadingMockQuestionBlock[]>([]);
   const [questions, setQuestions] = useState<ReadingMockQuestion[]>([]);
   const [options, setOptions] = useState<ReadingMockOption[]>([]);
   const [answers, setAnswers] = useState<ReadingMockAnswerMap>({});
   const [activePassageId, setActivePassageId] = useState("");
   const [remainingSeconds, setRemainingSeconds] = useState(READING_MOCK_DURATION_SECONDS);
   const [themeId, setThemeId] = useState<ReadingMockThemeId>("night");
   const [summary, setSummary] = useState<ReturnType<typeof evaluateReadingMock> | null>(null);
   const [splitRatio, setSplitRatio] = useState(58);
   const [timerInitialized, setTimerInitialized] = useState(false);
   const [selectedText, setSelectedText] = useState("");
   const [highlightsByPassage, setHighlightsByPassage] = useState<Record<string, string[]>>({});
   const [highlightButtonPosition, setHighlightButtonPosition] = useState<{
      x: number;
      y: number;
      visible: boolean;
   }>({
      x: 0,
      y: 0,
      visible: false,
   });

   const questionRefs = useRef<Record<string, HTMLDivElement | null>>({});
   const passageArticleRef = useRef<HTMLElement | null>(null);
   const splitGridRef = useRef<HTMLDivElement | null>(null);
   const isDraggingDividerRef = useRef(false);
   const lastPointerPositionRef = useRef<{ x: number; y: number } | null>(null);
   const orderedPassages = useMemo(
      () => [...passages].sort((a, b) => a.passage_number - b.passage_number),
      [passages]
   );
   const orderedQuestions = useMemo(
      () => [...questions].sort((a, b) => a.question_number - b.question_number),
      [questions]
   );
   const orderedBlocks = useMemo(
      () => [...blocks].sort((a, b) => a.order_index - b.order_index),
      [blocks]
   );
   const optionsByQuestion = useMemo(
      () =>
         options.reduce<Record<string, ReadingMockOption[]>>((accumulator, option) => {
            if (!accumulator[option.question_id]) accumulator[option.question_id] = [];
            accumulator[option.question_id].push(option);
            return accumulator;
         }, {}),
      [options]
   );
   const activePassage = orderedPassages.find((passage) => passage.id === activePassageId) || null;
   const activeBlocks = orderedBlocks.filter((block) => block.passage_id === activePassageId);
   const totalDurationSeconds = Math.max(1, orderedPassages.length) * READING_MOCK_DURATION_SECONDS;
   const theme = getThemeConfig(themeId);
   const activeHighlights = highlightsByPassage[activePassageId] || [];
   const isLightTheme = themeId === "paper";
   const blockShellClass = isLightTheme
      ? "border-stone-300 bg-stone-50 text-stone-900 shadow-[0_8px_24px_rgba(148,163,184,0.08)]"
      : "border-slate-800 bg-slate-950/45";
   const nestedPanelClass = isLightTheme
      ? "border-stone-300/90 bg-white text-stone-900"
      : "border-slate-700/70 bg-slate-900/60";
   const questionCardClass = isLightTheme
      ? "border-stone-300 bg-white text-stone-900 shadow-[0_8px_24px_rgba(148,163,184,0.08)]"
      : "border-slate-800 bg-slate-900/55";
   const questionNumberClass = isLightTheme
      ? "border-stone-300 bg-stone-100 text-stone-900"
      : "border-slate-500/70 bg-slate-950/70";
   const optionControlClass = isLightTheme
      ? "border-stone-300 bg-stone-50 text-stone-900 focus:border-sky-500"
      : "border-slate-600 bg-slate-950/70 text-slate-100 focus:border-emerald-500";
   const choiceChipClass = isLightTheme
      ? "border-stone-300 bg-stone-50 text-stone-900 hover:-translate-y-0.5 hover:border-sky-400 hover:bg-sky-50"
      : "border-slate-800 bg-slate-950/70 text-slate-200 hover:-translate-y-0.5 hover:border-slate-500";
   const answerPanelClass = isLightTheme
      ? "border-stone-300 bg-stone-50 text-stone-700"
      : "border-slate-800 bg-slate-900/70 text-slate-300";
   const highlightButtonClass = isLightTheme
      ? "border-amber-300/70 bg-white/95 text-amber-700 shadow-lg shadow-stone-300/30 hover:bg-amber-50"
      : "border-amber-400/40 bg-slate-950/95 text-amber-200 shadow-lg shadow-black/30 hover:bg-slate-900";
   const dividerClass = isLightTheme
      ? "bg-stone-300/80 hover:bg-stone-400"
      : "bg-slate-800/70 hover:bg-slate-700/80";
   const dividerKnobClass = isLightTheme
      ? "bg-stone-500 group-hover:bg-sky-500"
      : "bg-slate-500 group-hover:bg-emerald-400";
   const bottomNavPanelClass = isLightTheme
      ? "border-stone-200 bg-stone-50/80"
      : theme.panelClass;
   const inactivePassageNavClass = isLightTheme
      ? "border-stone-300 bg-white text-stone-700 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
      : "border-slate-700 bg-slate-900/70 text-slate-300 hover:-translate-y-0.5 hover:border-slate-500";
   const activePassageNavClass = isLightTheme
      ? "border-sky-300 bg-sky-50 text-sky-700 shadow-[0_8px_18px_rgba(14,165,233,0.12)]"
      : theme.accentClass;
   const unansweredQuestionNavClass = isLightTheme
      ? "border-stone-300 bg-white text-stone-700 hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
      : "border-slate-700 bg-slate-900/70 text-slate-300 hover:-translate-y-0.5 hover:border-slate-500";
   const answeredQuestionNavClass = isLightTheme
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 shadow-[0_8px_18px_rgba(16,185,129,0.12)] hover:-translate-y-0.5 hover:bg-emerald-100"
      : "border-emerald-500/40 bg-emerald-500/15 text-emerald-200 hover:-translate-y-0.5";

   useEffect(() => {
      async function load() {
         try {
            setLoading(true);
            setError(null);
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData.user) {
               router.push("/login");
               return;
            }

            const { data: testData, error: testError } = await supabase
               .from("reading_mock_tests")
               .select("id, slug, title, description, is_premium, is_published, created_at")
               .eq("slug", slug)
               .eq("is_published", true)
               .maybeSingle();
            if (testError || !testData) throw new Error("Reading test not found.");
            setTest(testData as ReadingMockTest);

            const [{ data: passagesData, error: passagesError }, { data: blocksData, error: blocksError }, { data: questionsData, error: questionsError }] =
               await Promise.all([
                  supabase
                     .from("reading_mock_passages")
                     .select("id, test_id, passage_number, label, title, subtitle, content_blocks, created_at")
                     .eq("test_id", testData.id)
                     .order("passage_number", { ascending: true }),
                  supabase
                     .from("reading_mock_question_blocks")
                     .select("id, test_id, passage_id, order_index, type, title, instructions, shared_content, meta, created_at")
                     .eq("test_id", testData.id)
                     .order("order_index", { ascending: true }),
                  supabase
                     .from("reading_mock_questions")
                     .select("id, test_id, passage_id, block_id, question_number, order_index, type, prompt, answer_key, meta, created_at")
                     .eq("test_id", testData.id)
                     .order("question_number", { ascending: true }),
               ]);

            if (passagesError || blocksError || questionsError) {
               throw new Error("Failed to load reading test.");
            }

            const typedPassages = (passagesData || []) as ReadingMockPassage[];
            const typedBlocks = (blocksData || []) as ReadingMockQuestionBlock[];
            const typedQuestions = (questionsData || []) as ReadingMockQuestion[];
            setPassages(typedPassages);
            setBlocks(typedBlocks);
            setQuestions(typedQuestions);
            setActivePassageId(typedPassages[0]?.id || "");

            const questionIds = typedQuestions.map((question) => question.id);
            if (questionIds.length > 0) {
               const { data: optionsData, error: optionsError } = await supabase
                  .from("reading_mock_options")
                  .select("id, question_id, label, text, order_index")
                  .in("question_id", questionIds)
                  .order("order_index", { ascending: true });
               if (optionsError) throw optionsError;
               setOptions((optionsData || []) as ReadingMockOption[]);
            }
         } catch (requestError) {
            console.error(requestError);
            setError("Failed to load reading test.");
         } finally {
            setLoading(false);
         }
      }

      void load();
   }, [router, slug]);

   useEffect(() => {
      if (!orderedPassages.length || timerInitialized) return;
      setRemainingSeconds(totalDurationSeconds);
      setTimerInitialized(true);
   }, [orderedPassages.length, timerInitialized, totalDurationSeconds]);

   useEffect(() => {
      if (loading || submitted) return;
      const timer = window.setInterval(() => {
         setRemainingSeconds((current) => {
            if (current <= 1) {
               window.clearInterval(timer);
               return 0;
            }
            return current - 1;
         });
      }, 1000);
      return () => window.clearInterval(timer);
   }, [loading, submitted]);

   useEffect(() => {
      if (remainingSeconds === 0 && !submitted && !loading) {
         void handleSubmit();
      }
      // Auto-submit is intentionally tied to timer state instead of handleSubmit identity.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [remainingSeconds, submitted, loading]);

   useEffect(() => {
      function handlePointerMove(event: PointerEvent) {
         if (!isDraggingDividerRef.current || !splitGridRef.current) return;

         const bounds = splitGridRef.current.getBoundingClientRect();
         if (bounds.width <= 0) return;

         const rawPercent = ((event.clientX - bounds.left) / bounds.width) * 100;
         const clamped = Math.min(65, Math.max(35, rawPercent));
         setSplitRatio(clamped);
      }

      function stopDragging() {
         isDraggingDividerRef.current = false;
         document.body.style.cursor = "";
         document.body.style.userSelect = "";
      }

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopDragging);
      window.addEventListener("pointercancel", stopDragging);

      return () => {
         window.removeEventListener("pointermove", handlePointerMove);
         window.removeEventListener("pointerup", stopDragging);
         window.removeEventListener("pointercancel", stopDragging);
      };
   }, []);

   useEffect(() => {
      function hideHighlightButton() {
         setHighlightButtonPosition((current) => ({
            ...current,
            visible: false,
         }));
      }

      document.addEventListener("scroll", hideHighlightButton, true);
      window.addEventListener("resize", hideHighlightButton);

      return () => {
         document.removeEventListener("scroll", hideHighlightButton, true);
         window.removeEventListener("resize", hideHighlightButton);
      };
   }, []);

   function formatTime(value: number) {
      const minutes = Math.floor(value / 60).toString().padStart(2, "0");
      const seconds = Math.floor(value % 60).toString().padStart(2, "0");
      return `${minutes}:${seconds}`;
   }

   function resetTimer() {
      setRemainingSeconds(totalDurationSeconds);
   }

   function updateAnswer(questionId: string, value: string) {
      if (submitted) return;
      setAnswers((current) => ({ ...current, [questionId]: value }));
   }

   function jumpToQuestion(question: ReadingMockQuestion) {
      setActivePassageId(question.passage_id);
      window.setTimeout(() => {
         questionRefs.current[question.id]?.scrollIntoView({
            behavior: "smooth",
            block: "start",
         });
      }, 80);
   }

   function escapeRegExp(value: string) {
      return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
   }

   function renderHighlightedText(text: string) {
      if (!activeHighlights.length) return text;

      const uniqueHighlights = Array.from(
         new Set(
            activeHighlights
               .map((item) => item.trim())
               .filter(Boolean)
               .sort((a, b) => b.length - a.length)
         )
      );

      if (!uniqueHighlights.length) return text;

      const pattern = uniqueHighlights.map(escapeRegExp).join("|");
      const parts = text.split(new RegExp(`(${pattern})`, "gi"));

      return parts.map((part, index) => {
         const matched = uniqueHighlights.some(
            (highlight) => part.toLowerCase() === highlight.toLowerCase()
         );

         if (!matched) {
            return <span key={`${part}-${index}`}>{part}</span>;
         }

         return (
            <mark
               key={`${part}-${index}`}
               onClick={() => removeHighlight(part)}
               className="cursor-pointer rounded bg-amber-300/70 px-1 text-slate-950 transition hover:bg-amber-200">
               {part}
            </mark>
         );
      });
   }

   function handleSelectionChange() {
      const selection = window.getSelection();
      const nextText = selection?.toString().trim() || "";
      setSelectedText(nextText);

      if (!selection || !nextText || selection.rangeCount === 0) {
         setHighlightButtonPosition((current) => ({
            ...current,
            visible: false,
         }));
         return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const pointer = lastPointerPositionRef.current;

      if (!pointer && rect.width === 0 && rect.height === 0) {
         setHighlightButtonPosition((current) => ({
            ...current,
            visible: false,
         }));
         return;
      }

      setHighlightButtonPosition({
         x:
            (pointer?.x ?? rect.right + window.scrollX) + 10,
         y:
            (pointer?.y ?? rect.top + window.scrollY) - 42,
         visible: true,
      });
   }

   function addHighlight() {
      if (!activePassageId || !selectedText) return;

      setHighlightsByPassage((current) => ({
         ...current,
         [activePassageId]: Array.from(
            new Set([...(current[activePassageId] || []), selectedText])
         ),
      }));

      window.getSelection()?.removeAllRanges();
      setSelectedText("");
      setHighlightButtonPosition((current) => ({
         ...current,
         visible: false,
      }));
   }

   function removeHighlight(value: string) {
      if (!activePassageId) return;

      setHighlightsByPassage((current) => ({
         ...current,
         [activePassageId]: (current[activePassageId] || []).filter(
            (item) => item.toLowerCase() !== value.toLowerCase()
         ),
      }));
   }

   async function handleSubmit() {
      if (!test || submitting || submitted) return;
      try {
         setSubmitting(true);
         const nextSummary = evaluateReadingMock(orderedQuestions, answers);
         setSummary(nextSummary);
         setSubmitted(true);

         const { data: userData, error: userError } = await supabase.auth.getUser();
         if (userError || !userData.user) return;

         const { data: attemptData, error: attemptError } = await supabase
            .from("reading_mock_attempts")
            .insert({
               user_id: userData.user.id,
               test_id: test.id,
               score_raw: nextSummary.correctCount,
               total_questions: nextSummary.totalQuestions,
               duration_seconds: totalDurationSeconds - remainingSeconds,
            })
            .select("id")
            .single();
         if (attemptError) throw attemptError;

         const answerRows = orderedQuestions.map((question) => {
            const userAnswer = getQuestionAnswerValue(answers, question.id).trim();
            const isCorrect =
               userAnswer.length === 0
                  ? null
                  : Array.isArray(question.answer_key)
                    ? JSON.stringify(
                         userAnswer
                            .split(",")
                            .map((item) => item.trim().toLowerCase())
                            .filter(Boolean)
                            .sort()
                      ) ===
                      JSON.stringify(
                         question.answer_key
                            .map((item) => item.trim().toLowerCase())
                            .filter(Boolean)
                            .sort()
                      )
                    : userAnswer.toLowerCase() ===
                      String(question.answer_key || "").trim().toLowerCase();
            return {
               attempt_id: attemptData.id,
               question_id: question.id,
               answer_text: userAnswer || null,
               is_correct: isCorrect,
            };
         });

         const { error: answersError } = await supabase
            .from("reading_mock_answers")
            .insert(answerRows);
         if (answersError) throw answersError;
      } catch (requestError) {
         console.error(requestError);
         setError("Your answers were checked, but saving the attempt failed.");
      } finally {
         setSubmitting(false);
      }
   }

   function renderSelectQuestion(question: ReadingMockQuestion, optionList: ReadingMockOption[]) {
      return (
         <select
            value={getQuestionAnswerValue(answers, question.id)}
            onChange={(event) => updateAnswer(question.id, event.target.value)}
            disabled={submitted}
            className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition disabled:opacity-70 ${optionControlClass}`}>
            <option value="">Select</option>
            {optionList.map((option) => (
               <option key={option.id} value={option.label}>
                  {option.label}. {option.text}
               </option>
            ))}
         </select>
      );
   }

   function renderBlock(block: ReadingMockQuestionBlock) {
      const blockQuestions = getQuestionsForBlock(orderedQuestions, block.id);
      const sharedContent = block.shared_content || {};

      return (
         <div
            key={block.id}
            className={`rounded-3xl border p-5 transition duration-200 hover:-translate-y-0.5 ${blockShellClass}`}>
            <h3 className={`text-2xl font-semibold ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
               {block.title}
            </h3>
            <div
               className={`mt-4 space-y-2 text-base leading-8 ${isLightTheme ? "text-stone-700" : "text-slate-200"}`}>
               {(block.instructions || []).map((instruction, index) => (
                  <p key={`${block.id}-instruction-${index}`}>{instruction}</p>
               ))}
            </div>

            {(block.type === "notes_completion_block" || block.type === "summary_completion_block") && (
               <div className={`mt-5 rounded-3xl border p-5 ${nestedPanelClass}`}>
                  {typeof sharedContent.heading === "string" && (
                     <h4 className={`text-xl font-semibold ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                        {sharedContent.heading}
                     </h4>
                  )}
                  {typeof sharedContent.body === "string" && (
                     <div className={`mt-4 space-y-4 text-lg leading-10 ${isLightTheme ? "text-stone-800" : "text-slate-100"}`}>
                        {String(sharedContent.body)
                           .split("\n")
                           .filter(Boolean)
                           .map((line, index) => (
                              <p key={`${block.id}-line-${index}`}>
                                 {renderInlineTemplate(
                                    line,
                                    blockQuestions,
                                    answers,
                                    submitted,
                                    updateAnswer,
                                    isLightTheme
                                 )}
                              </p>
                           ))}
                     </div>
                  )}
               </div>
            )}

            {(block.type === "matching_people_block" ||
               block.type === "matching_headings_block" ||
               block.type === "matching_information_block" ||
               block.type === "multiple_choice_block") && (
               <div className="mt-5 space-y-4">
                  {block.type !== "matching_information_block" &&
                     Array.isArray(sharedContent.options) &&
                     sharedContent.options.length > 0 && (
                     <div className={`rounded-3xl border p-5 ${nestedPanelClass}`}>
                        {typeof sharedContent.heading === "string" && (
                           <h4 className={`text-xl font-semibold ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                              {sharedContent.heading}
                           </h4>
                        )}
                        <div className={`mt-3 space-y-2 text-base ${isLightTheme ? "text-stone-700" : "text-slate-200"}`}>
                           {(sharedContent.options as Array<Record<string, unknown>>).map(
                              (option, index) => (
                                 <p key={`${block.id}-shared-option-${index}`}>
                                    <span className={`font-semibold ${isLightTheme ? "text-stone-900" : "text-slate-50"}`}>
                                       {String(option.label || "")}.
                                    </span>{" "}
                                    {String(option.text || "")}
                                 </p>
                              )
                           )}
                        </div>
                     </div>
                  )}

                  {blockQuestions.map((question) => {
                     const optionList =
                        optionsByQuestion[question.id] ||
                        ((Array.isArray(sharedContent.options)
                           ? (sharedContent.options as Array<Record<string, unknown>>).map(
                                (option, index) => ({
                                   id: `${question.id}-${index}`,
                                   question_id: question.id,
                                   label: String(option.label || ""),
                                   text: String(option.text || ""),
                                   order_index: index,
                                })
                             )
                           : []) as ReadingMockOption[]);

                     return (
                        <div
                           key={question.id}
                           ref={(node) => {
                              questionRefs.current[question.id] = node;
                           }}
                           className={`grid gap-4 rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 md:grid-cols-[minmax(0,1fr)_220px] ${questionCardClass}`}>
                           <div>
                              <p className={`text-lg ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                                 <span className={`mr-3 inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-semibold ${questionNumberClass}`}>
                                    {question.question_number}
                                 </span>
                                 {question.prompt}
                              </p>
                           </div>
                           {renderSelectQuestion(question, optionList)}
                        </div>
                     );
                  })}
               </div>
            )}

            {(block.type === "true_false_not_given_block" ||
               block.type === "yes_no_not_given_block") && (
               <div className="mt-5 space-y-5">
                  {blockQuestions.map((question) => {
                     const choices =
                        block.type === "true_false_not_given_block"
                           ? ["TRUE", "FALSE", "NOT GIVEN"]
                           : ["YES", "NO", "NOT GIVEN"];
                     return (
                        <div
                           key={question.id}
                           ref={(node) => {
                              questionRefs.current[question.id] = node;
                           }}
                           className={`rounded-2xl border p-4 transition duration-200 hover:-translate-y-0.5 ${questionCardClass}`}>
                           <p className={`text-lg ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                              <span className={`mr-3 inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-semibold ${questionNumberClass}`}>
                                 {question.question_number}
                              </span>
                              {question.prompt}
                           </p>
                           <div className="mt-4 grid gap-2 sm:grid-cols-3">
                              {choices.map((choice) => (
                                 <label
                                    key={choice}
                                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${choiceChipClass}`}>
                                    <input
                                       type="radio"
                                       name={question.id}
                                       value={choice}
                                       checked={getQuestionAnswerValue(answers, question.id) === choice}
                                       onChange={(event) => updateAnswer(question.id, event.target.value)}
                                       disabled={submitted}
                                    />
                                    <span>{choice}</span>
                                 </label>
                              ))}
                           </div>
                        </div>
                     );
                  })}
               </div>
            )}

            {submitted && (
               <div className={`mt-5 space-y-2 rounded-2xl border p-4 text-sm ${answerPanelClass}`}>
                  {blockQuestions.map((question) => {
                     const correct = isAnswerCorrect(question, answers);

                     return (
                        <div
                           key={`${block.id}-answer-${question.id}`}
                           className="flex items-start gap-2.5">
                           <span
                              className={[
                                 "mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full",
                                 correct
                                    ? isLightTheme
                                       ? "bg-emerald-100 text-emerald-600"
                                       : "bg-emerald-500/15 text-emerald-300"
                                    : isLightTheme
                                      ? "bg-rose-100 text-rose-600"
                                      : "bg-rose-500/15 text-rose-300",
                              ].join(" ")}>
                              {correct ? <PiCheckCircleLight size={15} /> : <PiXCircleLight size={15} />}
                           </span>
                           <p>
                              <span className={`font-semibold ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                                 {question.question_number}.
                              </span>{" "}
                              Correct answer:{" "}
                              <span className={`font-semibold ${isLightTheme ? "text-emerald-600" : "text-emerald-300"}`}>
                                 {Array.isArray(question.answer_key)
                                    ? question.answer_key.join(", ")
                                    : String(question.answer_key || "No answer")}
                              </span>
                           </p>
                        </div>
                     );
                  })}
               </div>
            )}
         </div>
      );
   }

   if (loading) {
      return (
         <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
            <div className="mx-auto max-w-7xl rounded-3xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
               Loading reading test...
            </div>
         </main>
      );
   }

   if (error || !test || !activePassage) {
      return (
         <main className="min-h-screen bg-slate-950 px-4 py-6 text-red-200">
            <div className="mx-auto max-w-4xl rounded-3xl border border-red-500/30 bg-red-500/10 p-6">
               {error || "Reading test could not be loaded."}
            </div>
         </main>
      );
   }

   return (
      <main className={`min-h-screen border ${theme.shellClass} px-4 py-5 transition-colors`}>
         {highlightButtonPosition.visible && selectedText && (
            <button
               type="button"
               onMouseDown={(event) => event.preventDefault()}
               onClick={addHighlight}
               className={`fixed z-40 inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${highlightButtonClass}`}
               style={{
                  left: highlightButtonPosition.x,
                  top: highlightButtonPosition.y,
               }}>
               <PiHighlighterLight size={15} />
               <span>Highlight</span>
            </button>
         )}
         <div className="space-y-5">
            <header className={`rounded-3xl border p-5 ${theme.panelClass}`}>
               <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                     <h1 className="flex items-center gap-2 text-2xl font-semibold">
                        <PiReadCvLogoLight size={26} />
                        <span>{test.title}</span>
                     </h1>
                     {test.description && (
                        <p className={`mt-2 max-w-3xl text-sm ${theme.mutedClass}`}>
                           {test.description}
                        </p>
                     )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                     <div className="group relative">
                        <button
                           type="button"
                           onClick={resetTimer}
                           disabled={submitted}
                           className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${theme.accentClass}`}>
                           <PiClockCountdownLight size={18} />
                           <span>{formatTime(remainingSeconds)}</span>
                        </button>
                        {!submitted && (
                           <div
                              className={`pointer-events-none absolute right-0 top-[calc(100%+0.55rem)] z-20 w-max max-w-56 rounded-xl border px-3 py-2 text-xs opacity-0 shadow-lg transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 ${
                                 isLightTheme
                                    ? "border-stone-300 bg-white text-stone-700 shadow-stone-300/30"
                                    : "border-slate-700 bg-slate-950 text-slate-200 shadow-black/30"
                              } -translate-y-1`}>
                              <span className="inline-flex items-center gap-1.5">
                                 <PiArrowCounterClockwiseLight size={14} />
                                 Click to restart the timer
                              </span>
                           </div>
                        )}
                     </div>
                     <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 px-3 py-2 text-sm">
                        <PiPaletteLight size={16} />
                        {READING_MOCK_THEME_OPTIONS.map((option) => {
                           const Icon = THEME_ICONS[option.id];
                           return (
                              <button
                                 key={option.id}
                                 type="button"
                                 onClick={() => setThemeId(option.id)}
                                 className={[
                                    "inline-flex items-center gap-1 rounded-full px-3 py-1 transition duration-200 hover:-translate-y-0.5",
                                    themeId === option.id
                                       ? isLightTheme
                                          ? option.id === "paper"
                                             ? "bg-sky-100 text-sky-700 shadow-sm"
                                             : "bg-stone-200 text-stone-700"
                                          : "bg-white/10 text-white"
                                       : theme.mutedClass,
                                 ].join(" ")}>
                                 <Icon size={14} />
                                 <span>{option.label}</span>
                              </button>
                           );
                        })}
                     </div>
                     <button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={submitting || submitted}
                        className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-400 disabled:opacity-60">
                        {submitted ? "Submitted" : submitting ? "Submitting..." : "Submit"}
                     </button>
                     <button
                        type="button"
                        onClick={() => router.push("/dashboard/mock/reading")}
                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition duration-200 hover:-translate-y-0.5 ${
                           isLightTheme
                              ? "border-stone-300 bg-white text-stone-700 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700"
                              : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500 hover:bg-slate-900"
                        }`}>
                        <PiSignOutLight size={16} />
                        <span>Exit</span>
                     </button>
                  </div>
               </div>
            </header>

            {summary && (
               <section className={`rounded-3xl border p-5 ${theme.panelClass}`}>
                  <h2 className="text-xl font-semibold">
                     {summary.correctCount} / {summary.totalQuestions} correct
                  </h2>
                  <p className={`mt-2 text-sm ${theme.mutedClass}`}>
                     Answered {summary.answeredCount}.{" "}
                     {summary.unansweredNumbers.length > 0
                        ? `Unanswered: ${summary.unansweredNumbers.join(", ")}.`
                        : "All questions answered."}
                  </p>
               </section>
            )}

            <div
               ref={splitGridRef}
               className="grid gap-5 xl:items-start"
               style={{
                  gridTemplateColumns:
                     activePassage && typeof window !== "undefined"
                        ? `minmax(0, ${splitRatio}fr) minmax(14px,14px) minmax(340px, ${100 - splitRatio}fr)`
                        : undefined,
               }}>
               <section className={`rounded-3xl border p-5 ${theme.panelClass}`}>
                  <div className="mb-4 flex flex-wrap gap-2">
                     {orderedPassages.map((passage) => (
                        <button
                           key={passage.id}
                           type="button"
                           onClick={() => setActivePassageId(passage.id)}
                           className={[
                              "rounded-full border px-4 py-2 text-sm transition",
                              passage.id === activePassageId
                                 ? theme.accentClass
                                 : "border-slate-700/70 text-slate-300 hover:bg-slate-900/40",
                           ].join(" ")}>
                           {passage.label}
                        </button>
                     ))}
                  </div>

                  <p className={`text-xs uppercase tracking-[0.2em] ${theme.mutedClass}`}>
                     {activePassage.label}
                  </p>
                  <h2 className="mt-2 text-3xl font-semibold">{activePassage.title}</h2>
                  {activePassage.subtitle && (
                     <p className={`mt-2 text-base ${theme.mutedClass}`}>{activePassage.subtitle}</p>
                  )}
                  <article
                     ref={passageArticleRef}
                     onPointerUp={(event) => {
                        lastPointerPositionRef.current = {
                           x: event.clientX + window.scrollX,
                           y: event.clientY + window.scrollY,
                        };
                     }}
                     onMouseUp={handleSelectionChange}
                     onTouchEnd={handleSelectionChange}
                     className="mt-5 space-y-5 text-[17px] leading-9 xl:text-[18px] xl:leading-10">
                     {activePassage.content_blocks.map((block) => {
                        if (block.type === "heading") {
                           const Tag = block.level === "h3" ? "h3" : "h2";
                           return (
                              <Tag key={block.id} className="text-2xl font-semibold xl:text-[1.7rem]">
                                 {renderHighlightedText(block.text)}
                              </Tag>
                           );
                        }
                        if (block.type === "note") {
                           return (
                              <div key={block.id} className="rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-[15px] leading-8 text-slate-300 xl:text-base">
                                 {renderHighlightedText(block.text)}
                              </div>
                           );
                        }
                        return (
                           <p key={block.id}>
                              {block.label && <span className="mr-2 font-semibold">{block.label}</span>}
                              {renderHighlightedText(block.text)}
                           </p>
                        );
                     })}
                  </article>
               </section>

               <div className="hidden xl:flex items-stretch justify-center">
                  <div className="flex h-full min-h-[20rem] w-full items-center justify-center">
                     <button
                        type="button"
                        aria-label="Drag to resize reading and question panels"
                        onPointerDown={(event) => {
                           isDraggingDividerRef.current = true;
                           document.body.style.cursor = "col-resize";
                           document.body.style.userSelect = "none";
                           event.currentTarget.setPointerCapture?.(event.pointerId);
                        }}
                        className={`group flex h-full min-h-[20rem] w-4 cursor-col-resize items-center justify-center rounded-full transition ${dividerClass}`}>
                        <span className={`flex h-16 w-1 rounded-full transition ${dividerKnobClass}`} />
                     </button>
                  </div>
               </div>

               <section className={`rounded-3xl border p-5 ${theme.panelClass}`}>
                  <div className="space-y-5">
                     {activeBlocks.map((block) => renderBlock(block))}
                  </div>
               </section>
            </div>

            <section className={`rounded-3xl border p-5 ${bottomNavPanelClass}`}>
               <div className="grid gap-5 xl:grid-cols-2">
                  <div>
                     <div className="flex flex-wrap gap-2">
                        {orderedPassages.map((passage) => (
                           <button
                              key={passage.id}
                              type="button"
                              onClick={() => setActivePassageId(passage.id)}
                              className={[
                                 "rounded-2xl border px-4 py-2 text-sm font-medium transition duration-200",
                                 passage.id === activePassageId
                                    ? activePassageNavClass
                                    : inactivePassageNavClass,
                              ].join(" ")}>
                              {passage.label}
                           </button>
                        ))}
                     </div>
                  </div>

                  <div>
                     <div className="flex flex-wrap gap-2">
                        {orderedQuestions
                           .filter((question) => question.passage_id === activePassageId)
                           .map((question) => (
                              <button
                                 key={question.id}
                                 type="button"
                                 onClick={() => jumpToQuestion(question)}
                                 className={[
                                    "inline-flex h-10 min-w-10 items-center justify-center rounded-2xl border px-3 text-sm font-medium transition duration-200",
                                    isQuestionAnswered(question, answers)
                                       ? answeredQuestionNavClass
                                       : unansweredQuestionNavClass,
                                 ].join(" ")}>
                                 {isQuestionAnswered(question, answers) ? (
                                    <PiCheckCircleLight size={16} />
                                 ) : (
                                    question.question_number
                                 )}
                              </button>
                           ))}
                     </div>
                  </div>
               </div>
            </section>
         </div>
      </main>
   );
}
