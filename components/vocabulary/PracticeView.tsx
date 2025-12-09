"use client";

import React, { useCallback, useEffect } from "react";
import Flashcard from "./Flashcard";
import { SRSState, CardWithHealth } from "@/app/hooks/useSRS";

// Simple health bar used under the card
function HealthBar({ value, max }: { value: number; max: number }) {
   return (
      <div className="flex gap-1 mt-3">
         {Array.from({ length: max }).map((_, i) => (
            <div
               key={i}
               className={`h-2 flex-1 rounded-full transition-colors ${
                  i < value ? "bg-emerald-500" : "bg-slate-700"
               }`}
            />
         ))}
      </div>
   );
}

function formatCooldown(ms: number): string {
   const mins = Math.floor(ms / 60000);
   const secs = Math.floor((ms % 60000) / 1000);
   if (mins <= 0 && secs <= 0) return "soon";
   return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

type PracticeViewProps = {
   state: SRSState;
   onFlip: () => void;
   onAnswer: (known: boolean) => void;
   onToggleGrindMode: (value: boolean) => void;
   setSwipe: (dir: "left" | "right" | null) => void;
};

export default function PracticeView({
   state,
   onFlip,
   onAnswer,
   onToggleGrindMode,
   setSwipe,
}: PracticeViewProps) {
   const {
      currentCard,
      practiceQueue,
      cooldownList,
      showBack,
      swipeDirection,
      isPracticing,
      grindMode,
   } = state;

   // Current index in the practice queue (for "Card X of Y")
   const currentIndex =
      currentCard && practiceQueue.length > 0
         ? practiceQueue.findIndex((c) => c.id === currentCard.id)
         : -1;

   const cardPosition =
      currentIndex >= 0 ? currentIndex + 1 : currentCard ? 1 : 0;
   const queueLength = practiceQueue.length;

   // Compute nearest cooldown finish
   const now = Date.now();
   const nextCooldownTs = cooldownList
      .map((c) => c.cooldownUntil ?? Infinity)
      .reduce((min, ts) => Math.min(min, ts), Infinity);

   const nextCooldownMs =
      nextCooldownTs === Infinity ? null : Math.max(0, nextCooldownTs - now);

   const allOnCooldown =
      isPracticing &&
      !currentCard &&
      practiceQueue.length === 0 &&
      cooldownList.length > 0 &&
      !grindMode;

   // Helper to trigger answer with animation (used by swipe, buttons, keyboard)
   const triggerAnswer = useCallback(
      (known: boolean) => {
         if (!isPracticing || !currentCard) return;
         if (swipeDirection) return; // ignore if already animating

         setSwipe(known ? "right" : "left");

         setTimeout(() => {
            onAnswer(known);
            setSwipe(null);
         }, 200);
      },
      [isPracticing, currentCard, swipeDirection, onAnswer, setSwipe]
   );

   // Keyboard shortcuts: Space = flip, ← = don't know, → = know
   useEffect(() => {
      if (!isPracticing) return;

      const handler = (e: KeyboardEvent) => {
         if (!currentCard) return;

         if (e.key === " ") {
            e.preventDefault();
            onFlip();
         } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            triggerAnswer(false);
         } else if (e.key === "ArrowRight") {
            e.preventDefault();
            triggerAnswer(true);
         }
      };

      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
   }, [isPracticing, currentCard, onFlip, triggerAnswer]);

   if (!isPracticing) return null;

   return (
      <div className="space-y-6">
         {/* Grind mode toggle */}
         <label className="inline-flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
               type="checkbox"
               checked={grindMode}
               onChange={(e) => onToggleGrindMode(e.target.checked)}
               className="cursor-pointer rounded"
            />
            <span>Grind mode (ignore 5-minute cooldown)</span>
         </label>

         {/* When all cards are cooling down */}
         {allOnCooldown && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-center text-slate-300">
               <p>All cards are on a 5-minute break.</p>
               {nextCooldownMs !== null && (
                  <p className="mt-2 text-lg font-semibold text-emerald-400">
                     Next card in {formatCooldown(nextCooldownMs)}
                  </p>
               )}
               <p className="mt-3 text-xs text-slate-500">
                  You can also enable{" "}
                  <span className="text-emerald-400">Grind mode</span> to keep
                  practicing without breaks.
               </p>
            </div>
         )}

         {/* Active card view */}
         {currentCard && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-6">
               <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                     Card {cardPosition > 0 ? cardPosition : 1} of{" "}
                     {Math.max(queueLength, 1)}
                  </span>
                  <span className="hidden sm:block">
                     ← Don&apos;t know &nbsp;&nbsp; → I know &nbsp;&nbsp; Space
                     = Flip
                  </span>
               </div>

               <Flashcard
                  card={currentCard}
                  showBack={showBack}
                  swipeDirection={swipeDirection}
                  onFlip={onFlip}
                  onSwipeLeft={() => triggerAnswer(false)}
                  onSwipeRight={() => triggerAnswer(true)}
               />

               {/* Health bar under the card */}
               <HealthBar value={currentCard.health} max={4} />

               {/* Controls */}
               <div className="flex flex-col sm:flex-row gap-4 items-center justify-between mt-4">
                  <button
                     onClick={onFlip}
                     className="cursor-pointer px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-full text-sm text-slate-100 transition">
                     {showBack ? "Show word" : "Show definition"}
                  </button>

                  <div className="flex gap-3">
                     <button
                        onClick={() => triggerAnswer(false)}
                        className="cursor-pointer px-5 py-2 rounded-full border border-red-500/60 text-red-300 hover:bg-red-500/10 text-sm transition">
                        Don&apos;t know
                     </button>
                     <button
                        onClick={() => triggerAnswer(true)}
                        className="cursor-pointer px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-medium text-sm transition">
                        I know
                     </button>
                  </div>
               </div>
            </div>
         )}
      </div>
   );
}
