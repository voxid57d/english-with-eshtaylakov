"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
export default function Page() {
   const fullText = "Learn English with Confidence";
   const [typedText, setTypedText] = useState("");

   useEffect(() => {
      const interval = setInterval(() => {
         setTypedText((prev) => {
            // If we've already typed everything, stop updating
            if (prev.length >= fullText.length) {
               clearInterval(interval);
               return prev;
            }
            // Take one more character from fullText
            return fullText.slice(0, prev.length + 1);
         });
      }, 40); // speed: 80ms per character

      // Cleanup if the component unmounts
      return () => clearInterval(interval);
   }, []);

   return (
      <main className="min-h-screen bg-slate-950 text-white px-4 flex items-center">
         <section className="max-w-5xl mx-auto w-full flex flex-col md:flex-row items-center justify-between gap-12">
            {/* LEFT */}
            <div className="space-y-6">
               <Image
                  src="/logo-text-white.png"
                  alt="TalkTime logo"
                  width={200}
                  height={60}
                  className="w-auto h-12"
               />

               <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  {typedText || fullText}
                  <span className="border-r-2 border-emerald-400 ml-1 animate-pulse" />
               </h1>

               <p className="text-lg text-slate-300 max-w-md">
                  Personalized exercises, vocabulary practice, and daily
                  progress—all in one place.
               </p>

               <Link
                  href="/login"
                  className="inline-block px-6 py-3 rounded-full text-slate-900 bg-emerald-400 hover:bg-emerald-300 font-medium transition duration-200 ease-in-out shadow-lg">
                  Log in
               </Link>
            </div>

            {/* RIGHT */}
            {/* RIGHT */}
            <div className="w-full md:w-[380px]">
               <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-xl space-y-5">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                     <h2 className="text-sm font-semibold text-slate-200">
                        Student dashboard
                     </h2>
                     <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        Preview
                     </span>
                  </div>

                  {/* Progress */}
                  <div className="space-y-2">
                     <div className="flex items-center justify-between text-xs text-slate-300">
                        <span>Weekly progress</span>
                        <span>72%</span>
                     </div>
                     <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full w-3/4 bg-emerald-500" />
                     </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                     <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1">
                        <p className="text-xs text-slate-400">Words learned</p>
                        <p className="text-lg font-semibold">182</p>
                     </div>
                     <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-1">
                        <p className="text-xs text-slate-400">Current streak</p>
                        <p className="text-lg font-semibold">7 days 🔥</p>
                     </div>
                  </div>

                  {/* Upcoming lesson */}
                  <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-2">
                     <p className="text-xs text-slate-400">Next up</p>
                     <p className="text-sm font-medium">
                        Listening: Daily conversations
                     </p>
                     <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
                        <li>5 new phrases</li>
                        <li>Short listening quiz</li>
                        <li>Vocabulary review</li>
                     </ul>
                  </div>
               </div>
            </div>
         </section>
      </main>
   );
}
