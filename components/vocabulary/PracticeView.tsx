"use client";

import React, { useCallback, useEffect, useState } from "react";
import Flashcard from "./Flashcard";

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

export default function PracticeView({
   state,
   onFlip,
   onAnswer,
   onToggleGrindMode,
   setSwipe,
}: any) {
   const {
      currentCard,
      practiceQueue,
      cooldownList,
      showBack,
      swipeDirection,
      isPracticing,
      grindMode,
   } = state;
   const [isAudioOn, setIsAudioOn] = useState(false);

   const speak = useCallback((text: string) => {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
   }, []);

   useEffect(() => {
      if (isAudioOn && currentCard && !showBack) {
         speak(currentCard.front);
      }
   }, [currentCard?.id, isAudioOn, showBack, speak]);

   // Trigger logic for keyboard and drag
   const triggerAnswer = useCallback(
      (known: boolean) => {
         if (!isPracticing || !currentCard || swipeDirection) return;
         setSwipe(known ? "right" : "left");
         // Delay allows the exit animation to play before logic swaps the card
         setTimeout(() => {
            onAnswer(known);
         }, 200);
      },
      [isPracticing, currentCard, swipeDirection, onAnswer, setSwipe]
   );

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
         <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
               <input
                  type="checkbox"
                  checked={grindMode}
                  onChange={(e) => onToggleGrindMode(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-900"
               />
               <span>Grind mode</span>
            </label>
         </div>

         {currentCard ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-6">
               <Flashcard
                  card={currentCard}
                  showBack={showBack}
                  onFlip={onFlip}
                  onAnswer={triggerAnswer}
                  swipeDirection={swipeDirection}
                  isAudioOn={isAudioOn}
                  onToggleAudio={() => setIsAudioOn(!isAudioOn)}
                  speak={speak}
               />
               <div className="pt-4 border-t border-slate-800/40">
                  <HealthBar value={currentCard.health} max={4} />
                  <div className="flex gap-4 mt-6">
                     <button
                        onClick={onFlip}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-full text-sm font-medium transition">
                        {showBack ? "Word" : "Meaning"}
                     </button>
                     <button
                        onClick={() => triggerAnswer(false)}
                        className="flex-1 py-3 rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/5 transition">
                        Don't know
                     </button>
                     <button
                        onClick={() => triggerAnswer(true)}
                        className="flex-1 py-3 rounded-full bg-emerald-500 text-slate-950 font-bold transition">
                        I know it
                     </button>
                  </div>
               </div>
            </div>
         ) : (
            <div className="p-10 text-center border border-dashed border-slate-800 rounded-2xl text-slate-500">
               No cards to practice right now.
            </div>
         )}
      </div>
   );
}
