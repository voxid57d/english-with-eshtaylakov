"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CardWithHealth } from "../../app/hooks/useSRS";
import { PiSpeakerHighLight, PiSpeakerSlashLight } from "react-icons/pi";

type Props = {
   card: CardWithHealth | null;
   showBack: boolean;
   onFlip: () => void;
   onAnswer: (known: boolean) => void;
   swipeDirection: "left" | "right" | null;
   isAudioOn: boolean;
   onToggleAudio: () => void;
   speak: (text: string) => void;
};

export default function Flashcard({
   card,
   showBack,
   onFlip,
   onAnswer,
   swipeDirection,
   isAudioOn,
   onToggleAudio,
   speak,
}: Props) {
   if (!card) return null;

   // Direction logic for exit animation
   const directionValue =
      swipeDirection === "right" ? 1 : swipeDirection === "left" ? -1 : 0;

   const cardVariants = {
      enter: { opacity: 0, scale: 0.9, y: 20 },
      center: { opacity: 1, scale: 1, x: 0, y: 0 },
      exit: (customDir: number) => ({
         opacity: 0,
         x: customDir > 0 ? 500 : customDir < 0 ? -500 : 0,
         transition: { duration: 0.25 },
      }),
   };

   return (
      <div className="relative w-full min-h-[340px] flex flex-col items-center justify-center">
         {/* Audio Toggle */}
         <button
            onClick={(e) => {
               e.stopPropagation();
               onToggleAudio();
            }}
            className={`
               mb-6 flex items-center gap-2 px-4 py-2 rounded-full border transition-all
               ${
                  isAudioOn
                     ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                     : "bg-slate-900 border-slate-700 text-slate-500"
               }
            `}>
            {isAudioOn ? (
               <PiSpeakerHighLight size={20} />
            ) : (
               <PiSpeakerSlashLight size={20} />
            )}
            <span className="text-xs font-bold uppercase tracking-widest">
               {isAudioOn ? "Audio On" : "Audio Off"}
            </span>
         </button>

         {/* Animation wrapper */}
         <AnimatePresence mode="wait" custom={directionValue}>
            <motion.div
               key={card.id} // ✅ ONLY key on ID, so flipping doesn't trigger slide
               custom={directionValue}
               variants={cardVariants}
               initial="enter"
               animate="center"
               exit="exit"
               drag="x"
               dragConstraints={{ left: 0, right: 0 }}
               onDragEnd={(_, info) => {
                  const threshold = 100;
                  if (info.offset.x > threshold) onAnswer(true);
                  else if (info.offset.x < -threshold) onAnswer(false);
                  else onFlip();
               }}
               whileDrag={{ scale: 1.02 }}
               className="w-full max-w-md cursor-grab active:cursor-grabbing select-none">
               {/* 3D Flip Container */}
               <motion.div
                  animate={{ rotateY: showBack ? 180 : 0 }}
                  transition={{
                     duration: 0.4,
                     type: "spring",
                     stiffness: 260,
                     damping: 20,
                  }}
                  style={{ transformStyle: "preserve-3d" }}
                  className="relative w-full min-h-[260px]">
                  {/* FRONT */}
                  <div
                     style={{ backfaceVisibility: "hidden" }}
                     className="absolute inset-0 w-full h-full rounded-2xl bg-slate-950 border border-slate-800 p-10 text-center shadow-2xl flex flex-col justify-center items-center">
                     <p className="text-xs text-slate-500 mb-3 uppercase tracking-tighter">
                        Word
                     </p>
                     <p className="text-4xl font-bold text-white">
                        {card.front}
                     </p>
                     {card.transcription && (
                        <p className="mt-3 text-xl text-emerald-400">
                           /{card.transcription}/
                        </p>
                     )}
                     <button
                        onClick={(e) => {
                           e.stopPropagation();
                           speak(card.front);
                        }}
                        className="mt-6 text-[10px] text-slate-500 uppercase hover:text-emerald-400 transition">
                        Listen again
                     </button>
                  </div>

                  {/* BACK */}
                  <div
                     style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                     }}
                     className="absolute inset-0 w-full h-full rounded-2xl bg-slate-900 border border-slate-700 p-8 text-center shadow-2xl flex flex-col justify-center items-center">
                     <p className="text-xs text-slate-500 mb-3 uppercase tracking-tighter">
                        Meaning
                     </p>
                     <p className="text-xl text-slate-200 leading-relaxed">
                        {card.back}
                     </p>
                     {card.example_sentence && (
                        <p className="mt-6 text-sm italic text-slate-400 border-t border-slate-800 pt-4 px-2">
                           "{card.example_sentence}"
                        </p>
                     )}
                  </div>
               </motion.div>
            </motion.div>
         </AnimatePresence>
      </div>
   );
}
