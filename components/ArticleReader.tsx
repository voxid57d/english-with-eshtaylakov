"use client";

import { useState, useRef } from "react";

type Meaning = {
   partOfSpeech: string;
   definitions: {
      definition: string;
      example: string | null;
   }[];
};

type DictionaryResult = {
   word: string;
   phonetic: string | null;
   meanings: Meaning[];
};

type PopupPosition = {
   x: number;
   y: number;
};

export default function ArticleReader({
   text,
   onSaveWord,
   saveStatus,
   showHelper = true,
}: {
   text: string;
   onSaveWord?: (data: {
      word: string;
      definition: string;
      example: string | null;
   }) => void;
   saveStatus?: {
      word: string;
      state: "saving" | "saved" | "exists" | "error";
      message: string;
   } | null;
   showHelper?: boolean;
}) {
   const containerRef = useRef<HTMLDivElement | null>(null);
   const [selectedWord, setSelectedWord] = useState<string | null>(null);
   const [data, setData] = useState<DictionaryResult | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [popupPos, setPopupPos] = useState<PopupPosition | null>(null);

   const handleWordClick = async (
      rawWord: string,
      event: React.MouseEvent<HTMLButtonElement>
   ) => {
      const cleaned = rawWord.replace(/^[^\w'-]+|[^\w'-]+$/g, "");
      if (!cleaned) return;

      if (!containerRef.current) return;

      const wordRect = event.currentTarget.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      const containerWidth = containerRect.width;
      const isMobile = containerWidth < 768;

      const viewportHeight = window.innerHeight;
      const containerTopOnPage = containerRect.top;

      let yWithin = wordRect.bottom - containerRect.top;

      const estimatedPopupHeight = 220;
      const marginY = 16;

      const maxVisibleYWithin = viewportHeight - containerTopOnPage - marginY;

      if (yWithin + estimatedPopupHeight > maxVisibleYWithin) {
         yWithin = wordRect.top - containerRect.top - estimatedPopupHeight - 8;
         if (yWithin < marginY) yWithin = marginY;
      }

      let xWithin: number;

      if (isMobile) {
         xWithin = containerWidth / 2;
      } else {
         const marginX = 16;
         let center = wordRect.left + wordRect.width / 2 - containerRect.left;

         if (center < marginX) center = marginX;
         if (center > containerWidth - marginX)
            center = containerWidth - marginX;

         xWithin = center;
      }

      setPopupPos({ x: xWithin, y: yWithin });

      setSelectedWord(cleaned);
      setLoading(true);
      setError(null);
      setData(null);

      try {
         const res = await fetch(
            `/api/dictionary?word=${encodeURIComponent(cleaned)}`
         );

         if (!res.ok) {
            const errJson = await res.json().catch(() => null);
            setError(errJson?.error ?? "No definition found");
            setLoading(false);
            return;
         }

         const json = await res.json();
         setData(json);
      } catch (err) {
         console.error(err);
         setError("Failed to load definition");
      } finally {
         setLoading(false);
      }
   };

   return (
      <div ref={containerRef} className="relative space-y-6">
         <div className="bg-slate-900/60 rounded-xl p-4 md:p-6 leading-relaxed text-lg md:text-xl space-y-3">
            {text.split(/\n\s*\n/).map((paragraph, pIndex) => {
               const tokens = paragraph.split(/(\s+|[,.!?;:"()]+)/);

               return (
                  <p key={pIndex}>
                     {tokens.map((token, index) => {
                        if (/^\s+$/.test(token)) {
                           return <span key={index}>{token}</span>;
                        }

                        if (/^[,.!?;:"()]+$/.test(token)) {
                           return <span key={index}>{token}</span>;
                        }

                        return (
                           <button
                              key={index}
                              type="button"
                              onClick={(e) => handleWordClick(token, e)}
                              className="hover:text-emerald-300 transition-colors cursor-pointer">
                              {token}
                           </button>
                        );
                     })}
                  </p>
               );
            })}
         </div>

         {/* Helper text if nothing clicked yet */}
         {showHelper && !selectedWord && (
            <p className="text-slate-400 text-sm">
               Click any word in the text to see its definition.
            </p>
         )}

         {selectedWord && popupPos && (
            <div
               className="
                  absolute z-50
                  w-[calc(100vw-2.5rem)] max-w-xs
                  md:w-auto md:max-w-sm
                  bg-slate-900/95 border border-slate-700
                  rounded-xl p-3 shadow-xl
               "
               style={{
                  top: popupPos.y + 8,
                  left: popupPos.x,
                  transform: "translateX(-50%)",
               }}>
               <div className="flex justify-between items-center mb-2 gap-2">
                  <div>
                     <h2 className="text-base font-semibold text-emerald-300">
                        {selectedWord}
                     </h2>
                     {data?.phonetic && (
                        <span className="text-slate-400 text-xs">
                           {data.phonetic}
                        </span>
                     )}
                  </div>
                  <button
                     onClick={() => {
                        setSelectedWord(null);
                        setData(null);
                        setError(null);
                     }}
                     className="text-slate-500 hover:text-slate-300 text-xs cursor-pointer">
                     ✕
                  </button>
               </div>

               {loading && <p className="text-slate-400 text-xs">Loading…</p>}

               {error && !loading && (
                  <p className="text-red-400 text-xs">{error}</p>
               )}

               {!loading && !error && data && (
                  <div className="space-y-2">
                     {data.meanings.slice(0, 2).map((meaning, i) => (
                        <div key={i} className="space-y-1">
                           <p className="text-emerald-200 text-xs font-medium">
                              {meaning.partOfSpeech}
                           </p>
                           <ul className="list-disc list-inside space-y-1 text-xs text-slate-200">
                              {meaning.definitions.slice(0, 2).map((def, j) => (
                                 <li key={j}>
                                    <span>{def.definition}</span>
                                    {def.example && (
                                       <div className="text-slate-400 text-[10px] mt-1">
                                          Example: {def.example}
                                       </div>
                                    )}
                                 </li>
                              ))}
                           </ul>
                        </div>
                     ))}

                     {(() => {
                        const statusForThisWord =
                           saveStatus &&
                           selectedWord &&
                           saveStatus.word.toLowerCase() ===
                              selectedWord.toLowerCase()
                              ? saveStatus
                              : null;

                        let label = "Add to my deck";
                        let disabled = !onSaveWord;

                        if (statusForThisWord) {
                           if (statusForThisWord.state === "saving") {
                              label = `Saving "${selectedWord}"...`;
                              disabled = true;
                           } else if (statusForThisWord.state === "saved") {
                              label = `Saved ✓`;
                              disabled = true;
                           } else if (statusForThisWord.state === "exists") {
                              label = "Already in your deck";
                              disabled = true;
                           } else if (statusForThisWord.state === "error") {
                              label = "Try again";
                              disabled = false;
                           }
                        }

                        return (
                           <button
                              onClick={() => {
                                 if (disabled || !onSaveWord) return;

                                 const firstMeaning = data.meanings[0];
                                 const firstDef = firstMeaning?.definitions[0];

                                 if (firstDef) {
                                    onSaveWord({
                                       word: selectedWord!,
                                       definition: firstDef.definition,
                                       example: firstDef.example ?? null,
                                    });
                                 }
                              }}
                              disabled={disabled}
                              className={`mt-2 w-full text-xs py-1.5 rounded-md transition-colors ${
                                 disabled
                                    ? "bg-slate-700 text-slate-300 cursor-not-allowed"
                                    : "bg-emerald-500 hover:bg-emerald-600 text-white cursor-pointer"
                              }`}>
                              {label}
                           </button>
                        );
                     })()}
                  </div>
               )}
            </div>
         )}
      </div>
   );
}
