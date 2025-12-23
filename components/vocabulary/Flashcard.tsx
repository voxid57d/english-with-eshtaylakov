"use client";

import React, { useState } from "react";
// motion and AnimatePresence are for the animations
import { motion, AnimatePresence } from "framer-motion";
import { CardWithHealth } from "../../app/hooks/useSRS";

type Props = {
   card: CardWithHealth | null;
   showBack: boolean;
   onFlip: () => void;
   onAnswer: (known: boolean) => void;
};

export default function Flashcard({ card, showBack, onFlip, onAnswer }: Props) {
   // We use this to tell the "exit" animation which way the user swiped
   const [swipeDir, setSwipeDir] = useState(0);

   if (!card) return null;

   // This defines how the card enters, stays, and leaves correctly for TypeScript
   const cardVariants = {
      enter: { opacity: 0, scale: 0.9 },
      center: { opacity: 1, scale: 1, x: 0 },
      exit: (direction: number) => ({
         opacity: 0,
         // Fly 300 pixels Right if positive, Left if negative
         x: direction > 0 ? 300 : direction < 0 ? -300 : 0,
         transition: { duration: 0.2 },
      }),
   };

   return (
      <div className="relative w-full min-h-[280px] flex items-center justify-center">
         {/* AnimatePresence handles the 'exit' animation when the card changes */}
         <AnimatePresence mode="wait" custom={swipeDir}>
            <motion.div
               // The 'key' must change for the animation to trigger
               key={card.id + (showBack ? "-back" : "-front")}
               // Use the variants defined above
               custom={swipeDir}
               variants={cardVariants}
               initial="enter"
               animate="center"
               exit="exit"
               // Enable dragging
               drag="x"
               dragConstraints={{ left: 0, right: 0 }}
               onDragEnd={(_, info) => {
                  const threshold = 100;
                  if (info.offset.x > threshold) {
                     setSwipeDir(1); // Swiped Right
                     onAnswer(true);
                  } else if (info.offset.x < -threshold) {
                     setSwipeDir(-1); // Swiped Left
                     onAnswer(false);
                  } else {
                     onFlip(); // Just a tap/click
                  }
               }}
               whileDrag={{ scale: 1.05 }}
               className="
                  w-full max-w-md rounded-2xl bg-slate-950 border border-slate-800
                  p-10 text-center cursor-grab active:cursor-grabbing select-none
                  shadow-2xl shadow-emerald-900/20
               ">
               {!showBack ? (
                  <>
                     <p className="text-sm text-slate-400 mb-2">Word</p>
                     <p className="text-3xl font-bold text-white tracking-tight">
                        {card.front}
                     </p>
                     {card.transcription && (
                        <p className="mt-3 text-xl text-emerald-400">
                           /{card.transcription}/
                        </p>
                     )}
                  </>
               ) : (
                  <>
                     <p className="text-sm text-slate-400 mb-2">Definition</p>
                     <p className="text-lg text-slate-200 leading-relaxed">
                        {card.back}
                     </p>
                     {card.example_sentence && (
                        <p className="mt-6 text-sm italic text-slate-400 border-t border-slate-800 pt-4">
                           "{card.example_sentence}"
                        </p>
                     )}
                  </>
               )}
            </motion.div>
         </AnimatePresence>
      </div>
   );
}
