"use client";

import Image from "next/image";
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
   PiCaretDownLight,
   PiCheckLight,
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
   isLightTheme: boolean,
   onRegisterQuestionRef: (
      questionId: string,
      node: HTMLSpanElement | null
   ) => void
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
            ref={(node) => onRegisterQuestionRef(question.id, node)}
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
   const [earnedCuriosityPoints, setEarnedCuriosityPoints] = useState(0);
   const [splitRatio, setSplitRatio] = useState(58);
   const [timerInitialized, setTimerInitialized] = useState(false);
   const [mobilePanel, setMobilePanel] = useState<"passage" | "questions">("passage");
   const [openSelectQuestionId, setOpenSelectQuestionId] = useState<string | null>(null);
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
      ? "border-stone-300 bg-stone-50 text-stone-900 hover:border-sky-400 hover:bg-sky-50"
      : "border-slate-800 bg-slate-950/70 text-slate-200 hover:border-slate-500";
   const answerPanelClass = isLightTheme
      ? "border-stone-300 bg-stone-50 text-stone-700"
      : "border-slate-800 bg-slate-900/70 text-slate-300";
   const highlightButtonClass = isLightTheme
      ? "border-amber-300/70 bg-white/95 text-amber-700 shadow-lg shadow-stone-300/30 hover:bg-amber-50"
      : "border-amber-400/40 bg-slate-950/95 text-amber-200 shadow-lg shadow-black/30 hover:bg-slate-900";
   const dividerKnobClass = isLightTheme
      ? "bg-stone-400/80 group-hover:bg-sky-500"
      : "bg-slate-600/80 group-hover:bg-emerald-400";
   const bottomNavPanelClass = isLightTheme
      ? "border-stone-200 bg-stone-50/80"
      : theme.panelClass;
   const scrollAreaClass = isLightTheme
      ? "[scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.45)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-400/50 [&::-webkit-scrollbar-thumb:hover]:bg-stone-500/60"
      : "[scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.3)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500/35 [&::-webkit-scrollbar-thumb:hover]:bg-slate-400/50";
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

   useEffect(() => {
      function handleWindowPointerDown() {
         setOpenSelectQuestionId(null);
      }

      window.addEventListener("pointerdown", handleWindowPointerDown);

      return () => {
         window.removeEventListener("pointerdown", handleWindowPointerDown);
      };
   }, []);

   useEffect(() => {
      const mediaQuery = window.matchMedia("(min-width: 1280px)");
      const html = document.documentElement;
      const body = document.body;
      const previousHtmlOverflow = html.style.overflow;
      const previousBodyOverflow = body.style.overflow;

      function syncDocumentScrollLock() {
         if (mediaQuery.matches) {
            html.style.overflow = "hidden";
            body.style.overflow = "hidden";
            return;
         }

         html.style.overflow = previousHtmlOverflow;
         body.style.overflow = previousBodyOverflow;
      }

      syncDocumentScrollLock();
      mediaQuery.addEventListener("change", syncDocumentScrollLock);

      return () => {
         mediaQuery.removeEventListener("change", syncDocumentScrollLock);
         html.style.overflow = previousHtmlOverflow;
         body.style.overflow = previousBodyOverflow;
      };
   }, []);

   useEffect(() => {
      function handleBeforeUnload(event: BeforeUnloadEvent) {
         if (submitted) return;

         event.preventDefault();
         event.returnValue = "";
      }

      window.addEventListener("beforeunload", handleBeforeUnload);

      return () => {
         window.removeEventListener("beforeunload", handleBeforeUnload);
      };
   }, [submitted]);

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
      setMobilePanel("questions");
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
         x: (pointer?.x ?? rect.right) + 10,
         y: (pointer?.y ?? rect.top) - 42,
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

   useEffect(() => {
      if (earnedCuriosityPoints <= 0) {
         return;
      }

      const timeoutId = window.setTimeout(() => {
         setEarnedCuriosityPoints(0);
      }, 4000);

      return () => window.clearTimeout(timeoutId);
   }, [earnedCuriosityPoints]);

   async function awardCuriosityPoints(userId: string, amount: number) {
      if (amount <= 0) {
         return false;
      }

      const { data, error } = await supabase
         .from("user_stats")
         .select("user_id, curiosity_points")
         .eq("user_id", userId)
         .maybeSingle();

      if (error) {
         console.error("Error loading curiosity points:", error);
         return false;
      }

      const currentPoints =
         data && typeof data.curiosity_points === "number"
            ? data.curiosity_points
            : 0;
      const nextPoints = currentPoints + amount;

      if (data?.user_id) {
         const { error: updateError } = await supabase
            .from("user_stats")
            .update({
               curiosity_points: nextPoints,
            })
            .eq("user_id", userId);

         if (updateError) {
            console.error("Error awarding curiosity points:", updateError);
            return false;
         }

         return true;
      }

      const { error: insertError } = await supabase.from("user_stats").insert({
         user_id: userId,
         streak: 0,
         last_active_date: null,
         curiosity_points: nextPoints,
      });

      if (insertError) {
         console.error("Error awarding curiosity points:", insertError);
         return false;
      }

      return true;
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

         const rewardApplied = await awardCuriosityPoints(
            userData.user.id,
            nextSummary.correctCount
         );
         if (rewardApplied) {
            setEarnedCuriosityPoints(nextSummary.correctCount);
         }
      } catch (requestError) {
         console.error(requestError);
         setError("Your answers were checked, but saving the attempt failed.");
      } finally {
         setSubmitting(false);
      }
   }

   function renderSelectQuestion(question: ReadingMockQuestion, optionList: ReadingMockOption[]) {
      const selectedValue = getQuestionAnswerValue(answers, question.id);
      const selectedOption =
         optionList.find((option) => option.label === selectedValue) || null;
      const isOpen = openSelectQuestionId === question.id;

      return (
         <div
            className="relative self-start"
            onPointerDown={(event) => event.stopPropagation()}>
            <button
               type="button"
               disabled={submitted}
               onClick={() =>
                  setOpenSelectQuestionId((current) =>
                     current === question.id ? null : question.id
                  )
               }
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm outline-none transition disabled:opacity-70 ${optionControlClass}`}>
               <span
                  className={`min-w-0 truncate ${
                     selectedOption
                        ? "font-medium"
                        : isLightTheme
                          ? "text-stone-500"
                          : "text-slate-400"
                  }`}>
                  {selectedOption
                     ? `${selectedOption.label}. ${selectedOption.text}`
                     : "Select"}
               </span>
               <PiCaretDownLight
                  className={`shrink-0 transition ${isOpen ? "rotate-180" : ""}`}
               />
            </button>

            {isOpen && !submitted && (
               <div
                  className={[
                     "absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-2xl border shadow-[0_18px_40px_rgba(15,23,42,0.18)] backdrop-blur-sm",
                     isLightTheme
                        ? "border-stone-300 bg-white/98"
                        : "border-slate-700 bg-slate-950/96",
                  ].join(" ")}>
                  <div className="max-h-72 overflow-y-auto p-1.5 [scrollbar-width:thin] [scrollbar-color:rgba(148,163,184,0.35)_transparent] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/35">
                     {optionList.map((option) => {
                        const isSelected = selectedValue === option.label;

                        return (
                           <button
                              key={option.id}
                              type="button"
                              onClick={() => {
                                 updateAnswer(question.id, option.label);
                                 setOpenSelectQuestionId(null);
                              }}
                              className={[
                                 "flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                                 isLightTheme
                                    ? isSelected
                                       ? "bg-sky-50 text-sky-800"
                                       : "text-stone-700 hover:bg-stone-100"
                                    : isSelected
                                      ? "bg-emerald-500/12 text-emerald-100"
                                      : "text-slate-200 hover:bg-slate-900",
                              ].join(" ")}>
                              <span className="min-w-0">
                                 <span className="mr-2 font-semibold">{option.label}.</span>
                                 <span>{option.text}</span>
                              </span>
                              <span className="mt-0.5 shrink-0">
                                 {isSelected ? <PiCheckLight size={16} /> : null}
                              </span>
                           </button>
                        );
                     })}
                  </div>
               </div>
            )}
         </div>
      );
   }

   function renderBlock(block: ReadingMockQuestionBlock) {
      const blockQuestions = getQuestionsForBlock(orderedQuestions, block.id);
      const sharedContent = block.shared_content || {};

      return (
         <div
            key={block.id}
            className={`rounded-3xl border p-5 transition duration-200 ${blockShellClass}`}>
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
                                    isLightTheme,
                                    (questionId, node) => {
                                       questionRefs.current[questionId] = node;
                                    }
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
                           className={`grid gap-4 rounded-2xl border p-4 transition duration-200 md:grid-cols-[minmax(0,1fr)_220px] ${questionCardClass}`}>
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
                           className={`rounded-2xl border p-4 transition duration-200 ${questionCardClass}`}>
                           <p className={`text-lg ${isLightTheme ? "text-stone-900" : "text-slate-100"}`}>
                              <span className={`mr-3 inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 font-semibold ${questionNumberClass}`}>
                                 {question.question_number}
                              </span>
                              {question.prompt}
                           </p>
                           <div
                              className="mt-4 grid gap-2 sm:grid-cols-3"
                              role="radiogroup"
                              aria-label={`Question ${question.question_number} choices`}>
                              {choices.map((choice) => {
                                 const isSelected =
                                    getQuestionAnswerValue(answers, question.id) === choice;

                                 return (
                                    <button
                                       key={choice}
                                       type="button"
                                       role="radio"
                                       aria-checked={isSelected}
                                       disabled={submitted}
                                       onClick={() => updateAnswer(question.id, choice)}
                                       className={[
                                          "flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                                          submitted ? "opacity-70" : "",
                                          choiceChipClass,
                                          isSelected
                                             ? isLightTheme
                                                ? "border-sky-400 bg-sky-50 text-sky-800 shadow-[0_10px_24px_rgba(14,165,233,0.16)]"
                                                : "border-emerald-400/70 bg-emerald-500/12 text-emerald-100 shadow-[0_10px_24px_rgba(16,185,129,0.14)]"
                                             : "",
                                       ].join(" ")}>
                                       <span
                                          className={[
                                             "inline-flex h-5 w-5 items-center justify-center rounded-full border transition",
                                             isSelected
                                                ? isLightTheme
                                                   ? "border-sky-500 bg-sky-500"
                                                   : "border-emerald-400 bg-emerald-400"
                                                : isLightTheme
                                                  ? "border-stone-400 bg-white"
                                                  : "border-slate-500 bg-slate-950/80",
                                          ].join(" ")}>
                                          <span
                                             className={[
                                                "h-2 w-2 rounded-full transition",
                                                isSelected
                                                   ? "bg-white"
                                                   : "bg-transparent",
                                             ].join(" ")}
                                          />
                                       </span>
                                       <span className={isSelected ? "font-semibold" : ""}>{choice}</span>
                                    </button>
                                 );
                              })}
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

   function renderPassagePanel(containerClassName: string) {
      if (!activePassage) return null;

      return (
         <section className={`${containerClassName} flex min-h-0 flex-col`}>
            <article
               ref={passageArticleRef}
               onPointerUp={(event) => {
                  lastPointerPositionRef.current = {
                     x: event.clientX,
                     y: event.clientY,
                  };
               }}
               onMouseUp={handleSelectionChange}
               onTouchEnd={handleSelectionChange}
               className={`mt-5 space-y-5 text-[17px] leading-9 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2 xl:text-[18px] xl:leading-10 ${scrollAreaClass}`}>
               <div className="space-y-2">
                  <p className={`text-xs uppercase tracking-[0.2em] ${theme.mutedClass}`}>
                     {activePassage.label}
                  </p>
                  <h2 className="text-3xl font-semibold">{activePassage.title}</h2>
                  {activePassage.subtitle && (
                     <p className={`text-base ${theme.mutedClass}`}>{activePassage.subtitle}</p>
                  )}
               </div>
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
      );
   }

   function renderQuestionsPanel(containerClassName: string) {
      return (
         <section className={`${containerClassName} xl:flex xl:min-h-0 xl:flex-col`}>
            <div
               className={`space-y-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2 ${scrollAreaClass}`}>
               {activeBlocks.map((block) => renderBlock(block))}
            </div>
         </section>
      );
   }

   if (loading) {
      return (
         <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
            <div className="flex min-h-[70vh] items-center justify-center px-4">
               <div className="flex w-fit items-center gap-4 rounded-full border border-slate-800 bg-slate-950/80 px-5 py-4 shadow-[0_30px_80px_rgba(2,6,23,0.45)]">
                  <Image
                     src="/logo-text-white.png"
                     alt=""
                     aria-hidden="true"
                     width={180}
                     height={40}
                     className="h-8 w-auto opacity-90 animate-pulse"
                  />
                  <div className="h-8 w-8 rounded-full border-4 border-slate-700 border-t-emerald-400 animate-spin" />
               </div>
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
      <main
         className={`min-h-screen border ${theme.shellClass} px-4 py-3 transition-colors xl:h-[100dvh] xl:min-h-0 xl:overflow-hidden`}>
         {earnedCuriosityPoints > 0 && (
            <div className="pointer-events-none fixed right-5 top-5 z-50">
               <div
                  className={`relative overflow-hidden rounded-2xl border px-4 py-3 shadow-[0_18px_40px_rgba(15,23,42,0.24)] animate-[pulse_1.2s_ease-out_2] ${
                     isLightTheme
                        ? "border-amber-300 bg-white/95 text-amber-700"
                        : "border-emerald-400/40 bg-slate-950/92 text-emerald-200"
                  }`}>
                  <div className="absolute inset-0 opacity-30">
                     <div className="absolute -right-6 -top-6 h-16 w-16 rounded-full bg-amber-300/25 animate-ping" />
                  </div>
                  <div className="relative flex items-center gap-3">
                     <span
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                           isLightTheme
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-400/15 text-emerald-200"
                        }`}>
                        +{earnedCuriosityPoints}
                     </span>
                     <div>
                        <p className="text-sm font-semibold leading-none">
                           Curiosity earned
                        </p>
                        <p className={`mt-1 text-xs ${isLightTheme ? "text-stone-600" : "text-slate-300"}`}>
                           {earnedCuriosityPoints} point
                           {earnedCuriosityPoints === 1 ? "" : "s"} added for your
                           correct answers
                        </p>
                     </div>
                  </div>
               </div>
            </div>
         )}
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
         <div className="flex flex-col gap-3 xl:grid xl:h-full xl:min-h-0 xl:grid-rows-[auto_minmax(0,1fr)_auto]">
            <div className="space-y-3">
               <header className={`rounded-3xl border p-3 xl:p-3 ${theme.panelClass}`}>
                  <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                     <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold xl:text-2xl">
                           <PiReadCvLogoLight size={24} />
                           <span>{test.title}</span>
                        </h1>
                     </div>

                      <div className="flex flex-wrap items-center gap-2.5">
                        <div className="group relative">
                           <button
                              type="button"
                              onClick={resetTimer}
                              disabled={submitted}
                              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm transition duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 ${theme.accentClass}`}>
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
                        <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/70 px-3 py-1.5 text-sm">
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
                           className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-slate-950 transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-400 disabled:opacity-60">
                           {submitted ? "Submitted" : submitting ? "Submitting..." : "Submit"}
                        </button>
                        <button
                           type="button"
                           onClick={() => router.push("/dashboard/mock/reading")}
                           className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition duration-200 hover:-translate-y-0.5 ${
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
                  <section className={`rounded-3xl border p-4 ${theme.panelClass}`}>
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
            </div>

            <div className="space-y-4 xl:hidden">
               <section className={`rounded-3xl border p-3 ${theme.panelClass}`}>
                  <div className="grid grid-cols-2 gap-2">
                     <button
                        type="button"
                        onClick={() => setMobilePanel("passage")}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition duration-200 ${
                           mobilePanel === "passage"
                              ? activePassageNavClass
                              : inactivePassageNavClass
                        }`}>
                        Passage
                     </button>
                     <button
                        type="button"
                        onClick={() => setMobilePanel("questions")}
                        className={`rounded-2xl border px-4 py-2.5 text-sm font-medium transition duration-200 ${
                           mobilePanel === "questions"
                              ? activePassageNavClass
                              : inactivePassageNavClass
                        }`}>
                        Questions
                     </button>
                  </div>
               </section>

               {mobilePanel === "passage"
                  ? renderPassagePanel(`rounded-3xl border p-5 ${theme.panelClass}`)
                  : renderQuestionsPanel(`rounded-3xl border p-5 ${theme.panelClass}`)}

               <section className={`rounded-3xl border p-4 ${bottomNavPanelClass}`}>
                  <div className="space-y-3">
                     <div className="-mx-1 overflow-x-auto px-1">
                        <div className="flex w-max gap-2">
                           {orderedPassages.map((passage) => (
                              <button
                                 key={passage.id}
                                 type="button"
                                 onClick={() => {
                                    setActivePassageId(passage.id);
                                    setMobilePanel("passage");
                                 }}
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
                     <div className="-mx-1 overflow-x-auto px-1">
                        <div className="flex w-max gap-2">
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

            <div
               ref={splitGridRef}
               className="hidden gap-3 xl:grid xl:min-h-0 xl:flex-1 xl:items-stretch"
               style={{
                  gridTemplateColumns:
                     activePassage && typeof window !== "undefined"
                        ? `minmax(0, ${splitRatio}fr) minmax(10px,10px) minmax(340px, ${100 - splitRatio}fr)`
                        : undefined,
               }}>
               {renderPassagePanel(
                  `rounded-3xl border p-4 ${theme.panelClass} xl:h-full xl:min-h-0 xl:overflow-hidden`
               )}

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
                        className="group flex h-full min-h-[20rem] w-2.5 cursor-col-resize items-center justify-center">
                        <span className={`flex h-20 w-[2px] rounded-full transition ${dividerKnobClass}`} />
                     </button>
                  </div>
               </div>

               {renderQuestionsPanel(
                  `rounded-3xl border p-4 ${theme.panelClass} xl:h-full xl:min-h-0 xl:overflow-hidden`
               )}
            </div>

            <section className={`hidden rounded-3xl border p-2.5 xl:block ${bottomNavPanelClass}`}>
               <div className="grid gap-2.5 xl:grid-cols-2 xl:items-center">
                  <div>
                     <div className="flex flex-wrap gap-2">
                        {orderedPassages.map((passage) => (
                           <button
                              key={passage.id}
                              type="button"
                              onClick={() => setActivePassageId(passage.id)}
                              className={[
                                 "rounded-2xl border px-3 py-1 text-sm font-medium transition duration-200",
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
                                    "inline-flex h-8 min-w-8 items-center justify-center rounded-2xl border px-2.5 text-sm font-medium transition duration-200",
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
