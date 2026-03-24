"use client";

import Image from "next/image";
import { Fragment, useRef, useState } from "react";
import type { ReadingContentBlock } from "@/lib/readingContent";
import { PiMoonStarsLight, PiSunLight, PiLampLight } from "react-icons/pi";

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

type ReaderTheme = "dark" | "amber" | "paper";

type InlineSegment = {
   text: string;
   bold?: boolean;
   italic?: boolean;
};

const WORD_SPLIT_REGEX = /(\s+|[,.!?;:"()]+)/;
const INLINE_MARK_REGEX = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;

const READER_THEMES: Record<
   ReaderTheme,
   {
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      shell: string;
      text: string;
      mutedText: string;
      heading: string;
      imageFrame: string;
      invalidImage: string;
      caption: string;
      word: string;
      wordHover: string;
      helper: string;
      popup: string;
      popupBorder: string;
      popupHeading: string;
      popupPhonetic: string;
      popupDefinition: string;
      popupExample: string;
      popupButton: string;
      popupButtonDisabled: string;
   }
> = {
   dark: {
      label: "Dark",
      icon: PiMoonStarsLight,
      shell:
         "border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(10,15,30,0.98))] shadow-[0_24px_80px_rgba(2,6,23,0.45)]",
      text: "text-slate-100",
      mutedText: "text-slate-300",
      heading: "text-white",
      imageFrame:
         "border-slate-800/80 bg-slate-950/70 shadow-[0_18px_48px_rgba(2,6,23,0.35)]",
      invalidImage: "bg-slate-900 text-slate-500",
      caption: "text-slate-400",
      word: "text-inherit",
      wordHover: "hover:text-emerald-300",
      helper: "text-slate-400",
      popup:
         "bg-[linear-gradient(180deg,rgba(15,23,42,0.97),rgba(7,10,20,0.98))]",
      popupBorder: "border-slate-700/80",
      popupHeading: "text-emerald-300",
      popupPhonetic: "text-slate-400",
      popupDefinition: "text-slate-200",
      popupExample: "text-slate-400",
      popupButton: "bg-emerald-500 hover:bg-emerald-600 text-white",
      popupButtonDisabled: "bg-slate-700 text-slate-300",
   },
   amber: {
      label: "Amber",
      icon: PiLampLight,
      shell:
         "border-amber-900/40 bg-[linear-gradient(180deg,rgba(24,18,8,0.97),rgba(15,10,4,0.99))] shadow-[0_24px_80px_rgba(0,0,0,0.42)]",
      text: "text-amber-100",
      mutedText: "text-amber-200/80",
      heading: "text-amber-50",
      imageFrame:
         "border-amber-900/35 bg-[#161006] shadow-[0_18px_48px_rgba(0,0,0,0.35)]",
      invalidImage: "bg-[#161006] text-amber-200/45",
      caption: "text-amber-200/65",
      word: "text-inherit",
      wordHover: "hover:text-yellow-300",
      helper: "text-amber-200/75",
      popup:
         "bg-[linear-gradient(180deg,rgba(33,24,9,0.98),rgba(18,12,4,0.99))]",
      popupBorder: "border-amber-900/50",
      popupHeading: "text-yellow-300",
      popupPhonetic: "text-amber-200/65",
      popupDefinition: "text-amber-50",
      popupExample: "text-amber-200/65",
      popupButton: "bg-yellow-400 hover:bg-yellow-300 text-slate-950",
      popupButtonDisabled: "bg-amber-950/80 text-amber-100/60",
   },
   paper: {
      label: "Paper",
      icon: PiSunLight,
      shell:
         "border-[#e6dcc8] bg-[linear-gradient(180deg,rgba(250,245,236,0.98),rgba(244,236,223,0.99))] shadow-[0_24px_80px_rgba(15,23,42,0.08)]",
      text: "text-stone-800",
      mutedText: "text-stone-600",
      heading: "text-stone-900",
      imageFrame:
         "border-[#ddd0b6] bg-[#f6eee0] shadow-[0_18px_48px_rgba(148,127,87,0.12)]",
      invalidImage: "bg-[#efe5d4] text-stone-500",
      caption: "text-stone-500",
      word: "text-inherit",
      wordHover: "hover:text-emerald-700",
      helper: "text-stone-500",
      popup:
         "bg-[linear-gradient(180deg,rgba(255,250,241,0.99),rgba(243,234,219,0.99))]",
      popupBorder: "border-[#d8c9ad]",
      popupHeading: "text-emerald-700",
      popupPhonetic: "text-stone-500",
      popupDefinition: "text-stone-800",
      popupExample: "text-stone-500",
      popupButton: "bg-emerald-600 hover:bg-emerald-700 text-white",
      popupButtonDisabled: "bg-stone-300 text-stone-500",
   },
};

function isValidImageSource(value: string) {
   const src = value.trim();
   if (!src) return false;

   if (src.startsWith("/")) return true;

   try {
      const parsed = new URL(src);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
   } catch {
      return false;
   }
}

function parseInlineSegments(text: string): InlineSegment[] {
   return text
      .split(INLINE_MARK_REGEX)
      .filter(Boolean)
      .map((segment) => {
         if (segment.startsWith("**") && segment.endsWith("**")) {
            return {
               text: segment.slice(2, -2),
               bold: true,
            };
         }

         if (segment.startsWith("*") && segment.endsWith("*")) {
            return {
               text: segment.slice(1, -1),
               italic: true,
            };
         }

         return { text: segment };
      });
}

function getParagraphClasses(block: Extract<ReadingContentBlock, { type: "paragraph" }>) {
   const classes = ["tracking-[0.01em]"];

   if (block.tone === "large") {
      classes.push("text-xl", "md:text-[1.72rem]", "leading-10");
   } else if (block.tone === "small") {
      classes.push("text-[0.98rem]", "md:text-[1.05rem]", "leading-8");
   } else {
      classes.push("text-[1.08rem]", "md:text-[1.18rem]", "leading-9");
   }

   if (block.align === "center") {
      classes.push("text-center");
   }

   if (block.bold) {
      classes.push("font-semibold");
   }

   if (block.italic) {
      classes.push("italic");
   }

   return classes.join(" ");
}

function getHeadingClasses(block: Extract<ReadingContentBlock, { type: "heading" }>) {
   const classes = [
      "font-semibold",
      "tracking-[-0.02em]",
      block.level === "h3"
         ? "text-2xl md:text-[2rem] leading-tight"
         : "text-3xl md:text-[2.65rem] leading-tight",
   ];

   if (block.align === "center") {
      classes.push("text-center");
   }

   return classes.join(" ");
}

export default function ArticleReader({
   text,
   blocks,
   onSaveWord,
   saveStatus,
   showHelper = true,
}: {
   text: string;
   blocks?: ReadingContentBlock[];
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
   const [readerTheme, setReaderTheme] = useState<ReaderTheme>("dark");

   const theme = READER_THEMES[readerTheme];

   const contentBlocks =
      blocks && blocks.length > 0
         ? blocks
         : text
              .split(/\n\s*\n/)
              .map((paragraph, index) => ({
                 id: `legacy-${index + 1}`,
                 type: "paragraph" as const,
                 text: paragraph,
                 tone: "body" as const,
                 align: "left" as const,
              }))
              .filter((block) => block.text.trim().length > 0);

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
         if (center > containerWidth - marginX) {
            center = containerWidth - marginX;
         }

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
      } catch (requestError) {
         console.error(requestError);
         setError("Failed to load definition");
      } finally {
         setLoading(false);
      }
   };

   const renderInteractiveText = (
      textValue: string,
      wrapperClassName?: string,
      keyPrefix?: string
   ) => {
      const inlineSegments = parseInlineSegments(textValue);

      return (
         <span className={wrapperClassName}>
            {inlineSegments.map((segment, segmentIndex) => {
               const tokens = segment.text.split(WORD_SPLIT_REGEX);

               return (
                  <Fragment key={`${keyPrefix || "segment"}-${segmentIndex}`}>
                     {tokens.map((token, tokenIndex) => {
                        if (/^\s+$/.test(token)) {
                           return <span key={tokenIndex}>{token}</span>;
                        }

                        if (/^[,.!?;:"()]+$/.test(token)) {
                           return <span key={tokenIndex}>{token}</span>;
                        }

                        return (
                           <button
                              key={tokenIndex}
                              type="button"
                              onClick={(event) => handleWordClick(token, event)}
                              className={[
                                 "cursor-pointer transition-colors",
                                 theme.word,
                                 theme.wordHover,
                                 segment.bold ? "font-semibold" : "",
                                 segment.italic ? "italic" : "",
                              ].join(" ")}>
                              {token}
                           </button>
                        );
                     })}
                  </Fragment>
               );
            })}
         </span>
      );
   };

   return (
      <div ref={containerRef} className="relative space-y-6">
         <div className={["rounded-[2rem] border", theme.shell].join(" ")}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 px-5 py-4 md:px-8">
               <p className={["text-xs uppercase tracking-[0.24em]", theme.helper].join(" ")}>
                  Reading theme
               </p>
               <div className="flex flex-wrap gap-2">
                  {(["dark", "amber", "paper"] as ReaderTheme[]).map((themeKey) => {
                     const option = READER_THEMES[themeKey];
                     const Icon = option.icon;
                     const active = readerTheme === themeKey;

                     return (
                        <button
                           key={themeKey}
                           type="button"
                           onClick={() => setReaderTheme(themeKey)}
                           className={[
                              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition",
                              active
                                 ? themeKey === "dark"
                                    ? "bg-slate-800 text-white"
                                    : themeKey === "amber"
                                      ? "bg-yellow-400 text-slate-950"
                                      : "bg-white text-stone-900"
                                 : "bg-black/5 text-current hover:bg-black/10",
                              theme.mutedText,
                           ].join(" ")}>
                           <Icon className="text-sm" />
                           <span>{option.label}</span>
                        </button>
                     );
                  })}
               </div>
            </div>
            <div className="space-y-8 px-5 py-6 md:px-8 md:py-8">
               {contentBlocks.map((block) => {
                  if (block.type === "image") {
                     const validImageSource = isValidImageSource(block.url);

                     return (
                        <figure
                           key={block.id}
                           className={[
                              "overflow-hidden rounded-[1.5rem] border",
                              theme.imageFrame,
                              block.width === "narrow"
                                 ? "mx-auto max-w-2xl"
                                 : "w-full",
                           ].join(" ")}>
                           {validImageSource ? (
                              <Image
                                 src={block.url}
                                 alt={block.caption || "Article image"}
                                 width={1600}
                                 height={900}
                                 className="h-auto max-h-[28rem] w-full object-cover"
                              />
                           ) : (
                              <div
                                 className={[
                                    "flex min-h-40 items-center justify-center px-6 py-10 text-center text-sm",
                                    theme.invalidImage,
                                 ].join(" ")}>
                                 This image block has an invalid URL.
                              </div>
                           )}
                           {block.caption && (
                              <figcaption className={["px-4 py-3 text-sm italic", theme.caption].join(" ")}>
                                 {block.caption}
                              </figcaption>
                           )}
                        </figure>
                     );
                  }

                  if (block.type === "heading") {
                     const headingContent = renderInteractiveText(
                        block.text,
                        [getHeadingClasses(block), theme.heading].join(" "),
                        block.id
                     );

                     return block.level === "h3" ? (
                        <h3 key={block.id}>{headingContent}</h3>
                     ) : (
                        <h2 key={block.id}>{headingContent}</h2>
                     );
                  }

                  return (
                     <p
                        key={block.id}
                        className={[
                           getParagraphClasses(block),
                           block.tone === "small" ? theme.mutedText : theme.text,
                        ].join(" ")}>
                        {renderInteractiveText(block.text, undefined, block.id)}
                     </p>
                  );
               })}
            </div>
         </div>

         {showHelper && !selectedWord && (
            <p className={["text-sm", theme.helper].join(" ")}>
               Click any word in the text to see its definition.
            </p>
         )}

         {selectedWord && popupPos && (
            <div
               className={[
                  "absolute z-50 w-[calc(100vw-2.5rem)] max-w-xs rounded-2xl border p-4 shadow-[0_18px_48px_rgba(2,6,23,0.55)] md:w-auto md:max-w-sm",
                  theme.popup,
                  theme.popupBorder,
               ].join(" ")}
               style={{
                  top: popupPos.y + 8,
                  left: popupPos.x,
                  transform: "translateX(-50%)",
               }}>
               <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                     <h2 className={["text-base font-semibold", theme.popupHeading].join(" ")}>
                        {selectedWord}
                     </h2>
                     {data?.phonetic && (
                        <span className={["text-xs", theme.popupPhonetic].join(" ")}>
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
                     className={["cursor-pointer text-xs", theme.popupPhonetic].join(" ")}>
                     x
                  </button>
               </div>

               {loading && <p className={["text-xs", theme.popupPhonetic].join(" ")}>Loading...</p>}

               {error && !loading && (
                  <p className="text-xs text-red-400">{error}</p>
               )}

               {!loading && !error && data && (
                  <div className="space-y-3">
                     {data.meanings.slice(0, 2).map((meaning, i) => (
                        <div key={i} className="space-y-1.5">
                           <p className={["text-xs font-medium uppercase tracking-[0.18em]", theme.popupHeading].join(" ")}>
                              {meaning.partOfSpeech}
                           </p>
                           <ul className={["list-disc list-inside space-y-1.5 text-xs leading-6", theme.popupDefinition].join(" ")}>
                              {meaning.definitions.slice(0, 2).map((def, j) => (
                                 <li key={j}>
                                    <span>{def.definition}</span>
                                    {def.example && (
                                       <div className={["mt-1 text-[10px]", theme.popupExample].join(" ")}>
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
                              label = "Saved";
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
                                       word: selectedWord,
                                       definition: firstDef.definition,
                                       example: firstDef.example ?? null,
                                    });
                                 }
                              }}
                              disabled={disabled}
                              className={`mt-2 w-full rounded-xl py-2 text-xs transition-colors ${
                                 disabled
                                    ? `${theme.popupButtonDisabled} cursor-not-allowed`
                                    : `${theme.popupButton} cursor-pointer`
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
