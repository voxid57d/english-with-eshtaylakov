"use client";

export default function ExercisePanel({ selectedExercises }: any) {
   return (
      <div className="rounded-xl border border-slate-800 p-4">
         {selectedExercises === "vocabulary" && (
            <>
               <h2 className="text-xl font-semibold mb-2">Vocabulary</h2>
               <p className="text-slate-300 text-sm">
                  Your vocabulary exercises will appear here.
               </p>
            </>
         )}

         {selectedExercises === "reading" && (
            <>
               <h2 className="text-xl font-semibold mb-2">Reading</h2>
               <p className="text-slate-300 text-sm">
                  Your reading exercises will appear here.
               </p>
            </>
         )}

         {selectedExercises === "listening" && (
            <>
               <h2 className="text-xl font-semibold mb-2">Listening</h2>
               <p className="text-slate-300 text-sm">
                  Your listening exercises will appear here.
               </p>
            </>
         )}
      </div>
   );
}
