"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
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
   const questionQueue = useMemo(() => shuffleArray(cards), [cards]);
   const [questionIndex, setQuestionIndex] = useState(0);
   const [selectedOption, setSelectedOption] = useState<string | null>(null);
   const [isAnswerLocked, setIsAnswerLocked] = useState(false);
   const [showPointBurst, setShowPointBurst] = useState(false);

   const currentQuestion = useMemo(
      () => buildQuestion(cards, questionQueue, questionIndex),
      [cards, questionQueue, questionIndex]
   );

   const isComplete = questionQueue.length > 0 && !currentQuestion;

   const advanceToNext = () => {
      setQuestionIndex((value) => value + 1);
      setSelectedOption(null);
      setIsAnswerLocked(false);
      setShowPointBurst(false);
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

      window.setTimeout(() => {
         advanceToNext();
      }, isCorrect ? 900 : 1000);
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
               <p className="mt-2 text-sm text-slate-400">
                  Choose the correct meaning for the word shown below.
               </p>
            </div>
            <div className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300">
               {Math.min(questionIndex + 1, questionQueue.length)} / {questionQueue.length}
            </div>
         </div>

         <div className="relative mt-6 overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),rgba(15,23,42,0.95)_55%)] px-6 py-8 text-center">
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

            <p className="text-sm uppercase tracking-[0.18em] text-slate-400">Word</p>
            <h2 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
               {currentQuestion.card.front}
            </h2>
            {currentQuestion.card.transcription && (
               <p className="mt-3 text-sm text-emerald-200">
                  /{currentQuestion.card.transcription}/
               </p>
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
                        "border-red-500/50 bg-red-500/10 text-red-200";
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
      </div>
   );
}
