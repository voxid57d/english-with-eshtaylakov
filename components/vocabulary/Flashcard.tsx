"use client";

import React, { useCallback, useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
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

type CardBodyProps = {
   card: CardWithHealth;
   showBack: boolean;
   onFlip: () => void;
   onAnswer: (known: boolean) => void;
   swipeDirection: "left" | "right" | null;
   speak: (text: string) => void;
};

function AnimatedCardBody({
   card,
   showBack,
   onFlip,
   onAnswer,
   swipeDirection,
   speak,
}: CardBodyProps) {
   const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
   const swipeAnimationRef = useRef<ReturnType<typeof animate> | null>(null);
   const dragX = useMotionValue(0);

   const borderColor = useTransform(
      dragX,
      [-160, -40, 0, 40, 160],
      [
         "rgba(248, 113, 113, 0.9)",
         "rgba(248, 113, 113, 0.4)",
         "rgba(51, 65, 85, 1)",
         "rgba(16, 185, 129, 0.4)",
         "rgba(16, 185, 129, 0.9)",
      ]
   );
   const frontBackground = useTransform(
      dragX,
      [-160, -40, 0, 40, 160],
      [
         "rgba(60, 16, 16, 0.96)",
         "rgba(40, 16, 16, 0.98)",
         "rgba(2, 6, 23, 1)",
         "rgba(4, 32, 24, 0.98)",
         "rgba(6, 46, 31, 0.96)",
      ]
   );
   const backBorderColor = useTransform(
      dragX,
      [-160, -40, 0, 40, 160],
      [
         "rgba(248, 113, 113, 0.9)",
         "rgba(248, 113, 113, 0.4)",
         "rgba(71, 85, 105, 1)",
         "rgba(16, 185, 129, 0.4)",
         "rgba(16, 185, 129, 0.9)",
      ]
   );
   const backBackground = useTransform(
      dragX,
      [-160, -40, 0, 40, 160],
      [
         "rgba(56, 20, 20, 0.96)",
         "rgba(38, 20, 20, 0.98)",
         "rgba(15, 23, 42, 1)",
         "rgba(15, 33, 36, 0.98)",
         "rgba(8, 45, 32, 0.96)",
      ]
   );

   const startSwipeAnimation = useCallback(
      (direction: "left" | "right") => {
         swipeAnimationRef.current?.stop();
         swipeAnimationRef.current = animate(
            dragX,
            direction === "right" ? 220 : -220,
            {
               duration: 0.2,
               ease: "easeOut",
            }
         );
      },
      [dragX]
   );

   useEffect(() => {
      if (!swipeDirection) return;
      startSwipeAnimation(swipeDirection);
   }, [startSwipeAnimation, swipeDirection]);

   return (
      <motion.div
         key={card.id}
         initial={{ opacity: 0, scale: 0.9, y: 20 }}
         animate={{ opacity: 1, scale: 1, y: 0 }}
         transition={{ duration: 0.22, ease: "easeOut" }}
         style={{ x: dragX }}
         drag="x"
         dragConstraints={{ left: 0, right: 0 }}
         onDragStart={() => {
            swipeAnimationRef.current?.stop();
         }}
         onDragEnd={(_, info) => {
            const threshold = 100;
            if (info.offset.x > threshold) onAnswer(true);
            else if (info.offset.x < -threshold) onAnswer(false);
            else {
               swipeAnimationRef.current?.stop();
               animate(dragX, 0, { duration: 0.15, ease: "easeOut" });
            }
         }}
         onPointerDown={(event) => {
            pointerStartRef.current = {
               x: event.clientX,
               y: event.clientY,
            };
         }}
         onPointerUp={(event) => {
            const start = pointerStartRef.current;
            pointerStartRef.current = null;
            if (!start) return;

            const deltaX = event.clientX - start.x;
            const deltaY = event.clientY - start.y;
            const travel = Math.hypot(deltaX, deltaY);

            if (travel < 8) {
               onFlip();
            }
         }}
         onPointerCancel={() => {
            pointerStartRef.current = null;
         }}
         whileDrag={{ scale: 1.02 }}
         className="w-full max-w-md cursor-grab select-none active:cursor-grabbing">
         <motion.div
            animate={{ rotateY: showBack ? 180 : 0 }}
            transition={{
               duration: 0.4,
               type: "spring",
               stiffness: 260,
               damping: 20,
            }}
            style={{ transformStyle: "preserve-3d" }}
            className="relative min-h-[260px] w-full">
            <motion.div
               style={{
                  backfaceVisibility: "hidden",
                  borderColor,
                  backgroundColor: frontBackground,
               }}
               className="absolute inset-0 flex h-full w-full flex-col items-center justify-center rounded-2xl border border-slate-800 p-10 text-center shadow-2xl">
               <p className="mb-3 text-xs uppercase tracking-tighter text-slate-500">
                  Word
               </p>
               <p className="text-4xl font-bold text-white">{card.front}</p>
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
                  className="mt-6 cursor-pointer text-[10px] uppercase text-slate-500 transition hover:text-emerald-400">
                  Listen pronunciation
               </button>
            </motion.div>

            <motion.div
               style={{
                  backfaceVisibility: "hidden",
                  borderColor: backBorderColor,
                  backgroundColor: backBackground,
                  transform: "rotateY(180deg)",
               }}
               className="absolute inset-0 flex h-full w-full flex-col items-center justify-center rounded-2xl border border-slate-700 p-8 text-center shadow-2xl">
               <p className="mb-3 text-xs uppercase tracking-tighter text-slate-500">
                  Meaning
               </p>
               <p className="text-xl leading-relaxed text-slate-200">
                  {card.back}
               </p>
               {card.example_sentence && (
                  <p className="mt-6 border-t border-slate-800 px-2 pt-4 text-sm italic text-slate-400">
                     &ldquo;{card.example_sentence}&rdquo;
                  </p>
               )}
            </motion.div>
         </motion.div>
      </motion.div>
   );
}

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

   return (
      <div className="relative flex min-h-[340px] w-full flex-col items-center justify-center">
         <button
            onClick={(e) => {
               e.stopPropagation();
               onToggleAudio();
            }}
            className={`
               mb-6 flex items-center gap-2 rounded-full border px-4 py-2 transition-all
               ${
                  isAudioOn
                     ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                     : "border-slate-700 bg-slate-900 text-slate-500"
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

         <AnimatedCardBody
            key={card.id}
            card={card}
            showBack={showBack}
            onFlip={onFlip}
            onAnswer={onAnswer}
            swipeDirection={swipeDirection}
            speak={speak}
         />
      </div>
   );
}
