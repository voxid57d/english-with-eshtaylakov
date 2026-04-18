"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { PiSpeakerHighLight, PiQuotesLight } from "react-icons/pi";
import { CardWithHealth } from "@/app/hooks/useSRS";

type TestQuestion = {
   card: CardWithHealth;
   options: string[];
};

type TestViewProps = {
   cards: CardWithHealth[];
   onStop: () => void;
   onCorrectAnswer: () => Promise<void>;
};

function shuffleArray<T>(items: T[]) {
   const next = [...items];

   for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
   }

   return next;
}

function buildQuestion(
   cards: CardWithHealth[],
   queue: CardWithHealth[],
   index: number
): TestQuestion | null {
   const card = queue[index];

   if (!card) {
      return null;
   }

   const distractors = shuffleArray(
      cards
         .filter((candidate) => candidate.id !== card.id && candidate.back !== card.back)
         .map((candidate) => candidate.back)
   ).slice(0, 3);

   const options = shuffleArray([card.back, ...distractors]);

   return {
      card,
      options,
   };
}

export default function TestView({
   cards,
   onStop,
   onCorrectAnswer,
}: TestViewProps) {
   const [questions] = useState(() => {
      const questionQueue = shuffleArray(cards);

      return questionQueue
         .map((card, index) => buildQuestion(cards, questionQueue, index))
         .filter((question): question is TestQuestion => question !== null);
   });
   const [questionIndex, setQuestionIndex] = useState(0);
   const [selectedOption, setSelectedOption] = useState<string | null>(null);
   const [isAnswerLocked, setIsAnswerLocked] = useState(false);
   const [showPointBurst, setShowPointBurst] = useState(false);
   const [showWordDetails, setShowWordDetails] = useState(false);

   const currentQuestion = questions[questionIndex] ?? null;

   const isComplete = questions.length > 0 && !currentQuestion;

   const speak = useCallback((text: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
         return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
   }, []);

   const advanceToNext = () => {
      setQuestionIndex((value) => value + 1);
      setSelectedOption(null);
      setIsAnswerLocked(false);
      setShowPointBurst(false);
      setShowWordDetails(false);
   };

   const handleSelect = async (option: string) => {
      if (!currentQuestion || isAnswerLocked) {
         return;
      }

      const isCorrect = option === currentQuestion.card.back;

      setSelectedOption(option);
      setIsAnswerLocked(true);

      if (isCorrect) {
         setShowPointBurst(true);
         await onCorrectAnswer();
      }
   };

   if (cards.length < 4) {
      return (
         <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
            Add at least 4 cards to unlock test mode.
         </div>
      );
   }

   if (isComplete) {
      return (
         <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-8 text-center">
            <p className="text-lg font-semibold text-slate-100">Test complete</p>
            <p className="mt-2 text-sm text-slate-400">
               You went through every word in this deck once.
            </p>
            <div className="mt-6 flex justify-center">
               <button
                  onClick={onStop}
                  className="cursor-pointer rounded-full border border-emerald-500 px-4 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/10">
                  Back to deck
               </button>
            </div>
         </div>
      );
   }

   if (!currentQuestion) {
      return null;
   }

   return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
         <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
               <p className="text-xs uppercase tracking-[0.2em] text-emerald-300/80">
                  Test mode
               </p>
            </div>
            <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
               {Math.min(questionIndex + 1, questions.length)} / {questions.length}
            </div>
         </div>

         <div className="relative mt-6 w-full overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),rgba(15,23,42,0.95)_55%)] px-6 py-8 text-center">
            {showPointBurst && (
               <div className="pointer-events-none absolute right-5 top-5 flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-sm font-semibold text-amber-100 animate-bounce">
                  <Image
                     src="/cp-icon.svg"
                     alt=""
                     aria-hidden="true"
                     width={16}
                     height={16}
                     className="h-4 w-4"
                  />
                  <span>+1 Curiosity</span>
               </div>
            )}

            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
               {currentQuestion.card.front}
            </h2>
            {currentQuestion.card.transcription && (
               <p className="mt-3 text-sm text-emerald-200">
                  /{currentQuestion.card.transcription}/
               </p>
            )}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
               <button
                  type="button"
                  onClick={() => speak(currentQuestion.card.front)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-200">
                  <PiSpeakerHighLight size={16} />
                  <span>Listen</span>
               </button>
               <button
                  type="button"
                  onClick={() => setShowWordDetails((value) => !value)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 bg-slate-950/50 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-200">
                  <PiQuotesLight size={16} />
                  <span>Example</span>
               </button>
            </div>

            {showWordDetails && (
               <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-left">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                     Example sentence
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-200">
                     {currentQuestion.card.example_sentence ||
                        "No example sentence available for this word yet."}
                  </p>
               </div>
            )}
         </div>

         <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
            {currentQuestion.options.map((option) => {
               const isSelected = selectedOption === option;
               const isCorrect = option === currentQuestion.card.back;

               let buttonClass =
                  "border-slate-800 bg-slate-950/70 text-slate-100 hover:border-slate-700 hover:bg-slate-900";

               if (selectedOption) {
                  if (isCorrect) {
                     buttonClass =
                        "border-emerald-500/50 bg-emerald-500/10 text-emerald-200";
                  } else if (isSelected) {
                     buttonClass =
                        "border-red-500 bg-red-500/10 text-red-200 ring-1 ring-red-500/30";
                  } else {
                     buttonClass =
                        "border-slate-800 bg-slate-950/40 text-slate-500";
                  }
               }

               return (
                  <button
                     key={option}
                     onClick={() => void handleSelect(option)}
                     disabled={isAnswerLocked}
                     className={`rounded-2xl border px-4 py-4 text-left text-sm transition ${buttonClass} disabled:cursor-not-allowed`}>
                     {option}
                  </button>
               );
            })}
         </div>

         <div className="mt-6 flex justify-end">
            <button
               type="button"
               onClick={advanceToNext}
               disabled={!selectedOption}
               className="cursor-pointer rounded-full border border-emerald-500 px-5 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-60">
               {questionIndex === questions.length - 1 ? "Finish test" : "Next word"}
            </button>
         </div>
      </div>
   );
}
