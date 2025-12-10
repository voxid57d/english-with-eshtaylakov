"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// Reuse the same types (simplified)
type ListeningTest = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
};

type ListeningQuestion = {
   id: string;
   section_id: string;
   question_number: number;
   type: string;
   prompt: string | null;
   correct_answer: string | null;
};

type ListeningOption = {
   id: string;
   question_id: string;
   label: string;
   text: string;
};

type ListeningAnswer = {
   id: string;
   attempt_id: string;
   question_id: string;
   answer_text: string | null;
   is_correct: boolean | null;
};

type ListeningAttempt = {
   id: string;
   user_id: string;
   test_id: string;
   score_raw: number | null;
   created_at: string;
};

export default function ListeningResultsPage() {
   const params = useParams();
   const router = useRouter();

   const slug = params.slug as string;
   const attemptId = params.attemptId as string;

   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);

   const [attempt, setAttempt] = useState<ListeningAttempt | null>(null);
   const [test, setTest] = useState<ListeningTest | null>(null);
   const [questions, setQuestions] = useState<ListeningQuestion[]>([]);
   const [options, setOptions] = useState<ListeningOption[]>([]);
   const [answers, setAnswers] = useState<ListeningAnswer[]>([]);

   // Helper maps
   const questionMap: Record<string, ListeningQuestion> = {};
   questions.forEach((q) => {
      questionMap[q.id] = q;
   });

   const optionsByQuestion: Record<string, ListeningOption[]> = {};
   options.forEach((opt) => {
      if (!optionsByQuestion[opt.question_id]) {
         optionsByQuestion[opt.question_id] = [];
      }
      optionsByQuestion[opt.question_id].push(opt);
   });

   const answersByQuestion: Record<string, ListeningAnswer> = {};
   answers.forEach((a) => {
      answersByQuestion[a.question_id] = a;
   });

   useEffect(() => {
      async function load() {
         try {
            setLoading(true);
            setError(null);

            // 1) Ensure user is logged in
            const { data: userData, error: userError } =
               await supabase.auth.getUser();
            if (userError) throw userError;

            const user = userData.user;
            if (!user) {
               router.push("/login");
               return;
            }

            // 2) Load attempt
            const { data: attemptData, error: attemptError } = await supabase
               .from("listening_attempts")
               .select("*")
               .eq("id", attemptId)
               .maybeSingle();

            if (attemptError) throw attemptError;
            if (!attemptData) {
               setError("Attempt not found");
               setLoading(false);
               return;
            }

            // Extra safety: make sure it belongs to this user
            if (attemptData.user_id !== user.id) {
               setError("You are not allowed to view this attempt.");
               setLoading(false);
               return;
            }

            setAttempt(attemptData as ListeningAttempt);

            // 3) Load test (by attempt.test_id)
            const { data: testData, error: testError } = await supabase
               .from("listening_tests")
               .select("*")
               .eq("id", attemptData.test_id)
               .maybeSingle();

            if (testError) throw testError;
            setTest(testData as ListeningTest);

            // 4) Load all questions for this test
            //    (via sections -> questions)
            const { data: sectionsData, error: sectionsError } = await supabase
               .from("listening_sections")
               .select("id")
               .eq("test_id", attemptData.test_id);

            if (sectionsError) throw sectionsError;

            const sectionIds = (sectionsData || []).map(
               (s: any) => s.id as string
            );

            if (sectionIds.length === 0) {
               setError("No sections/questions for this test.");
               setLoading(false);
               return;
            }

            const { data: questionsData, error: questionsError } =
               await supabase
                  .from("listening_questions")
                  .select("*")
                  .in("section_id", sectionIds)
                  .order("question_number", { ascending: true });

            if (questionsError) throw questionsError;
            setQuestions((questionsData || []) as ListeningQuestion[]);

            // 5) Load options for those questions
            const questionIds = (questionsData || []).map(
               (q: any) => q.id as string
            );

            if (questionIds.length > 0) {
               const { data: optionsData, error: optionsError } = await supabase
                  .from("listening_options")
                  .select("*")
                  .in("question_id", questionIds);

               if (optionsError) throw optionsError;
               setOptions((optionsData || []) as ListeningOption[]);
            }

            // 6) Load answers for this attempt
            const { data: answersData, error: answersError } = await supabase
               .from("listening_answers")
               .select("*")
               .eq("attempt_id", attemptId);

            if (answersError) throw answersError;
            setAnswers((answersData || []) as ListeningAnswer[]);

            setLoading(false);
         } catch (err) {
            console.error(err);
            setError("Failed to load results.");
            setLoading(false);
         }
      }

      load();
   }, [attemptId, router]);

   if (loading) {
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
            Loading results…
         </main>
      );
   }

   if (error || !attempt || !test) {
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-red-400">
            {error || "Something went wrong"}
         </main>
      );
   }

   const totalQuestions = questions.length;
   const scoreRaw = attempt.score_raw ?? 0;

   return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
         <div className="max-w-3xl mx-auto px-4 py-6">
            <h1 className="text-2xl font-bold mb-2">{test.title} – Results</h1>

            <p className="mb-4 text-slate-300">
               Score:{" "}
               <span className="font-semibold">
                  {scoreRaw} / {totalQuestions}
               </span>
            </p>

            <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700">
               {questions.map((q) => {
                  const ans = answersByQuestion[q.id];
                  const userAnswer = ans?.answer_text ?? "";
                  const isCorrect = ans?.is_correct ?? false;

                  let correctLabelOrText = q.correct_answer || "";

                  // For MCQ show label + option text
                  if (q.type === "mcq_single") {
                     const opts = optionsByQuestion[q.id] || [];
                     const correctOpt = opts.find(
                        (o) => o.label === q.correct_answer
                     );
                     if (correctOpt) {
                        correctLabelOrText = `${correctOpt.label}. ${correctOpt.text}`;
                     }
                  }

                  return (
                     <div
                        key={q.id}
                        className="mb-4 border-b border-slate-800 pb-3 last:border-b-0">
                        <p className="mb-1 text-slate-100">
                           {q.question_number}. {q.prompt}
                        </p>

                        <p className="text-sm text-slate-300">
                           Your answer:{" "}
                           <span
                              className={
                                 isCorrect
                                    ? "text-emerald-400 font-semibold"
                                    : "text-red-400 font-semibold"
                              }>
                              {userAnswer || "(no answer)"}
                           </span>
                        </p>

                        <p className="text-xs text-slate-400 mt-1">
                           Correct answer:{" "}
                           <span className="font-semibold">
                              {correctLabelOrText}
                           </span>
                        </p>
                     </div>
                  );
               })}
            </div>

            <button
               onClick={() => router.push(`/mock/listening/${slug}`)}
               className="mt-6 inline-flex items-center px-4 py-2 rounded-full
                     bg-slate-800 text-slate-100 text-sm font-medium
                     hover:bg-slate-700 transition">
               Back to test
            </button>
         </div>
      </main>
   );
}
