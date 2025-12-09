"use client";

import React, { useState } from "react";
import { CardWithHealth } from "../../app/hooks/useSRS";

type Props = {
   card: CardWithHealth | null;
   showBack: boolean;
   swipeDirection: "left" | "right" | null;
   onFlip: () => void;
   onSwipeLeft: () => void;
   onSwipeRight: () => void;
};

export default function Flashcard({
   card,
   showBack,
   swipeDirection,
   onFlip,
   onSwipeLeft,
   onSwipeRight,
}: Props) {
   const [touchStartX, setTouchStartX] = useState<number | null>(null);

   if (!card) return null;

   // --- MOBILE TOUCH HANDLERS ---
   const handleTouchStart = (e: React.TouchEvent) => {
      setTouchStartX(e.touches[0].clientX);
   };

   const handleTouchEnd = (e: React.TouchEvent) => {
      if (touchStartX === null) return;
      const diff = e.changedTouches[0].clientX - touchStartX;

      if (Math.abs(diff) > 50) {
         if (diff > 0) onSwipeRight();
         else onSwipeLeft();
      } else {
         onFlip();
      }
      setTouchStartX(null);
   };

   // --- ANKI STYLE ANIMATION ---
   const animationClass =
      swipeDirection === "left"
         ? "opacity-0 translate-x-[-40px]"
         : swipeDirection === "right"
         ? "opacity-0 translate-x-[40px]"
         : "opacity-100 translate-x-0";

   return (
      <div className="relative w-full">
         {/* Slide hints (mobile) */}
         <div className="absolute inset-0 flex items-center justify-between px-4 text-2xl text-slate-600 opacity-40 pointer-events-none sm:hidden">
            <span>←</span>
            <span>→</span>
         </div>

         <div
            onClick={onFlip}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className={`
               rounded-2xl bg-slate-950 border border-slate-800
               p-10 text-center cursor-pointer select-none
               transition-all duration-300 ease-out
               ${animationClass}
            `}>
            {/* FRONT SIDE */}
            {!showBack ? (
               <>
                  <p className="text-sm text-slate-400 mb-2">Word</p>
                  <p className="text-3xl font-bold text-white">{card.front}</p>

                  {card.transcription && (
                     <p className="mt-3 text-xl text-emerald-400">
                        /{card.transcription}/
                     </p>
                  )}
               </>
            ) : (
               // BACK SIDE
               <>
                  <p className="text-sm text-slate-400 mb-2">Definition</p>
                  <p className="text-lg text-slate-200">{card.back}</p>

                  {card.example_sentence && (
                     <p className="mt-4 text-sm italic text-slate-400">
                        {card.example_sentence}
                     </p>
                  )}
               </>
            )}
         </div>
      </div>
   );
}
