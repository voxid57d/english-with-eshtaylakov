"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import Link from "next/link";

type Test = {
   id: string;
   slug: string;
   title: string;
   level: string;
   audio_url: string;
   transcript: string | null;
   is_podcast: boolean;
   requires_premium: boolean;
};

type Question = {
   id: string;
   question_order: number;
   type: string;
   prompt: string;
   options: string[] | null;
   correct_answer: string;
};

export default function ListeningTestPage() {
   const params = useParams();
   const slug = params.slug as string;

   const [loading, setLoading] = useState(true);
   const [test, setTest] = useState<Test | null>(null);
   const [questions, setQuestions] = useState<Question[]>([]);
   const [answers, setAnswers] = useState<Record<string, string>>({});
   const [showResults, setShowResults] = useState(false);
   const [showTranscript, setShowTranscript] = useState(false);
   const [audioSpeed, setAudioSpeed] = useState(1);
   const [isPremium, setIsPremium] = useState(false);
   const [isCompleted, setIsCompleted] = useState(false);

   const audioRef = useRef<HTMLAudioElement | null>(null);

   useEffect(() => {
      async function load() {
         setLoading(true);

         const { data: userData, error: userError } =
            await supabase.auth.getUser();
         if (userError || !userData?.user) {
            window.location.href = "/login";
            return;
         }
         const user = userData.user;

         const premium = await getPremiumStatus(user.id);
         setIsPremium(premium);

         const { data: testData, error: testError } = await supabase
            .from("gl_tests")
            .select("*")
            .eq("slug", slug)
            .maybeSingle();

         if (testError || !testData) {
            console.error("Test not found", testError);
            setLoading(false);
            return;
         }

         setTest(testData);

         if (testData.requires_premium && !premium) {
            setLoading(false);
            return;
         }

         const { data: qData } = await supabase
            .from("gl_questions")
            .select("*")
            .eq("test_id", testData.id)
            .order("question_order", { ascending: true });

         setQuestions(qData || []);

         const { data: attempt } = await supabase
            .from("gl_attempts")
            .select("answers")
            .eq("test_id", testData.id)
            .eq("user_id", user.id)
            .maybeSingle();

         if (attempt) {
            setAnswers(attempt.answers || {});
            setShowResults(true);
            setIsCompleted(true);
         }

         setLoading(false);
      }

      load();
   }, [slug]);

   useEffect(() => {
      if (audioRef.current) {
         audioRef.current.playbackRate = audioSpeed;
      }
   }, [audioSpeed]);

   async function handleSubmit() {
      if (!test) return;

      setShowResults(true);

      const { data: userData, error: userError } =
         await supabase.auth.getUser();
      if (userError || !userData?.user) {
         console.error("No user found while submitting answers", userError);
         return;
      }
      const user = userData.user;

      await supabase.from("gl_attempts").insert({
         user_id: user.id,
         test_id: test.id,
         answers,
         is_completed: true,
      });

      setIsCompleted(true);
   }

   if (loading) {
      return (
         <div
            aria-live="polite"
            aria-busy="true"
            className="space-y-6 pb-24">
            <div className="space-y-3">
               <div className="h-8 w-80 max-w-full rounded-full bg-slate-700/80 skeleton-shimmer" />
               <div className="h-4 w-32 rounded-full bg-slate-800 skeleton-shimmer" />
            </div>

            <section className="space-y-3">
               <div className="h-12 w-full rounded-xl border border-slate-800 bg-slate-900/70 skeleton-shimmer" />
               <div className="flex gap-2">
                  {[0, 1, 2, 3].map((index) => (
                     <div
                        key={index}
                        className="h-9 w-14 rounded-lg border border-slate-800 bg-slate-900/70 skeleton-shimmer"
                     />
                  ))}
               </div>
            </section>

            <section className="space-y-3">
               <div className="h-10 w-32 rounded-lg border border-slate-800 bg-slate-900/70 skeleton-shimmer" />
               <div className="space-y-3 rounded border border-slate-800 bg-slate-900/70 p-4">
                  <div className="h-4 rounded-full bg-slate-800 skeleton-shimmer" />
                  <div className="h-4 w-11/12 rounded-full bg-slate-800/80 skeleton-shimmer" />
                  <div className="h-4 w-8/12 rounded-full bg-slate-800/70 skeleton-shimmer" />
               </div>
            </section>

            <section className="space-y-6">
               {Array.from({ length: 3 }).map((_, questionIndex) => (
                  <div key={questionIndex} className="space-y-3">
                     <div className="h-5 w-3/4 rounded-full bg-slate-700/80 skeleton-shimmer" />
                     <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, optionIndex) => (
                           <div
                              key={optionIndex}
                              className="h-11 rounded border border-slate-800 bg-slate-900/70 skeleton-shimmer"
                           />
                        ))}
                     </div>
                  </div>
               ))}
            </section>

            <div className="h-12 w-full rounded-lg bg-slate-900/70 skeleton-shimmer" />
         </div>
      );
   }

   if (!test) {
      return <div className="p-4 text-red-400">Test not found.</div>;
   }

   if (test.requires_premium && !isPremium) {
      return (
         <div className="space-y-4 p-6">
            <h1 className="text-xl font-semibold">Premium Content</h1>
            <p className="text-slate-300">
               This listening exercise is available only for premium users.
            </p>
            <Link
               href="/premium"
               className="rounded-lg bg-emerald-600 px-4 py-2 text-white">
               Upgrade to Premium
            </Link>
         </div>
      );
   }

   return (
      <div className="space-y-6 pb-24">
         <div>
            <h1 className="text-xl font-semibold text-slate-100">
               {test.title}
            </h1>
            <p className="text-sm text-slate-400">{test.level} Listening</p>
         </div>

         <div className="space-y-2">
            <audio
               ref={audioRef}
               controls
               className="w-full"
               src={test.audio_url}
               onLoadedMetadata={(e) => {
                  e.currentTarget.playbackRate = audioSpeed;
               }}
               onPlay={(e) => {
                  e.currentTarget.playbackRate = audioSpeed;
               }}
            />

            <div className="flex gap-2 text-sm">
               {[0.75, 1, 1.25, 1.5].map((speed) => (
                  <button
                     key={speed}
                     onClick={() => setAudioSpeed(speed)}
                     className={`rounded border px-3 py-1 ${
                        audioSpeed === speed
                           ? "border-emerald-500 bg-emerald-600 text-white"
                           : "border-slate-600 bg-slate-800 text-slate-300"
                     }`}>
                     {speed}x
                  </button>
               ))}
            </div>
         </div>

         <div className="space-y-2">
            <button
               onClick={() => setShowTranscript((v) => !v)}
               className="rounded border border-slate-600 bg-slate-800 px-4 py-2 text-slate-200">
               {showTranscript ? "Hide Script" : "Show Script"}
            </button>

            {showTranscript && (
               <div className="whitespace-pre-line rounded border border-slate-700 bg-slate-900 p-4 text-slate-300">
                  {test.transcript}
               </div>
            )}
         </div>

         {!test.is_podcast && (
            <div className="space-y-6">
               {questions.map((q) => (
                  <div key={q.id} className="space-y-2">
                     <p className="font-medium text-slate-100">
                        {q.question_order}. {q.prompt}
                     </p>

                     {q.type === "multiple_choice" && (
                        <div className="space-y-2">
                           {q.options?.map((opt) => {
                              const isCorrect =
                                 showResults && opt === q.correct_answer;
                              const isWrong =
                                 showResults &&
                                 answers[q.id] === opt &&
                                 opt !== q.correct_answer;

                              return (
                                 <label
                                    key={opt}
                                    className={`
                          block px-3 py-2 rounded border cursor-pointer
                          ${
                             isCorrect
                                ? "border-emerald-500 bg-emerald-500/20"
                                : isWrong
                                  ? "border-red-500 bg-red-500/20"
                                  : "border-slate-700 bg-slate-800"
                          }
                        `}>
                                    <input
                                       type="radio"
                                       name={q.id}
                                       value={opt}
                                       disabled={showResults}
                                       checked={answers[q.id] === opt}
                                       onChange={() =>
                                          setAnswers({
                                             ...answers,
                                             [q.id]: opt,
                                          })
                                       }
                                       className="mr-2"
                                    />
                                    {opt}
                                 </label>
                              );
                           })}
                        </div>
                     )}
                  </div>
               ))}
            </div>
         )}

         {!test.is_podcast && !showResults && (
            <button
               onClick={handleSubmit}
               className="w-full rounded-lg bg-emerald-600 py-3 text-lg text-white">
               Submit Answers
            </button>
         )}

         {showResults && isCompleted && (
            <p className="font-medium text-emerald-400">
               You have completed this test.
            </p>
         )}
      </div>
   );
}
