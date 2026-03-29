export const READING_MOCK_DURATION_SECONDS = 20 * 60;

export const READING_MOCK_THEME_OPTIONS = [
   {
      id: "night",
      label: "Dark",
      shellClass: "bg-slate-950 text-slate-100 border-slate-800/90",
      panelClass: "border-slate-800 bg-slate-900/75 text-slate-100",
      mutedClass: "text-slate-400",
      accentClass: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
   },
   {
      id: "paper",
      label: "Light",
      shellClass: "bg-stone-100 text-stone-900 border-stone-300/90",
      panelClass: "border-stone-300 bg-white/95 text-stone-900",
      mutedClass: "text-stone-500",
      accentClass: "border-sky-500/30 bg-sky-500/10 text-sky-700",
   },
   {
      id: "forest",
      label: "Focus",
      shellClass: "bg-[#0f1a16] text-emerald-50 border-emerald-950/90",
      panelClass: "border-emerald-950/80 bg-[#16241f]/95 text-emerald-50",
      mutedClass: "text-emerald-200/60",
      accentClass: "border-amber-400/30 bg-amber-400/10 text-amber-200",
   },
] as const;

export type ReadingMockThemeId =
   (typeof READING_MOCK_THEME_OPTIONS)[number]["id"];

export type ReadingPassageBlock =
   | { id: string; type: "heading"; text: string; level?: "h2" | "h3" }
   | { id: string; type: "paragraph"; text: string; label?: string }
   | { id: string; type: "note"; text: string };

export type ReadingMockPassage = {
   id: string;
   test_id?: string;
   passage_number: number;
   label: string;
   title: string;
   subtitle: string | null;
   content_blocks: ReadingPassageBlock[];
   created_at?: string;
};

export type ReadingMockQuestionType =
   | "true_false_not_given"
   | "yes_no_not_given"
   | "matching_headings"
   | "gap_fill"
   | "gap_fill_options"
   | "matching_information"
   | "multiple_choice"
   | "multiple_choice_shared";

export type ReadingMockBlockType =
   | "true_false_not_given_block"
   | "yes_no_not_given_block"
   | "notes_completion_block"
   | "summary_completion_block"
   | "matching_information_block"
   | "matching_people_block"
   | "matching_headings_block"
   | "multiple_choice_block";

export type ReadingMockQuestionBlock = {
   id: string;
   test_id?: string;
   passage_id: string;
   order_index: number;
   type: ReadingMockBlockType;
   title: string;
   instructions: string[];
   shared_content: Record<string, unknown>;
   meta: Record<string, unknown>;
   created_at?: string;
};

export type ReadingMockQuestion = {
   id: string;
   test_id?: string;
   passage_id: string;
   block_id: string;
   question_number: number;
   order_index: number;
   type: ReadingMockQuestionType;
   prompt: string;
   answer_key: string | string[] | null;
   meta: Record<string, unknown> | null;
   created_at?: string;
};

export type ReadingMockOption = {
   id: string;
   question_id: string;
   label: string;
   text: string;
   order_index: number;
};

export type ReadingMockTest = {
   id: string;
   slug: string;
   title: string;
   description: string | null;
   is_premium: boolean;
   is_published: boolean;
   created_at?: string;
};

export type ReadingMockAnswerMap = Record<string, string>;

export type ReadingMockAttemptSummary = {
   answeredCount: number;
   correctCount: number;
   totalQuestions: number;
   unansweredNumbers: number[];
};

export function slugifyMockReadingTitle(value: string) {
   return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

export function createPassageBlock(
   type: ReadingPassageBlock["type"]
): ReadingPassageBlock {
   if (type === "heading") {
      return { id: crypto.randomUUID(), type, text: "", level: "h2" };
   }

   if (type === "note") {
      return { id: crypto.randomUUID(), type, text: "" };
   }

   return { id: crypto.randomUUID(), type: "paragraph", text: "", label: "" };
}

export function createReadingMockPassage(
   passageNumber: number
): ReadingMockPassage {
   return {
      id: crypto.randomUUID(),
      passage_number: passageNumber,
      label: `READING PASSAGE ${passageNumber}`,
      title: "",
      subtitle: "",
      content_blocks: [createPassageBlock("paragraph")],
   };
}

export function createReadingMockBlock(
   passageId: string,
   orderIndex: number
): ReadingMockQuestionBlock {
   return {
      id: crypto.randomUUID(),
      passage_id: passageId,
      order_index: orderIndex,
      type: "true_false_not_given_block",
      title: "",
      instructions: [],
      shared_content: {},
      meta: {},
   };
}

export function blockTypeToQuestionType(
   blockType: ReadingMockBlockType
): ReadingMockQuestionType {
   switch (blockType) {
      case "yes_no_not_given_block":
         return "yes_no_not_given";
      case "notes_completion_block":
      case "summary_completion_block":
         return "gap_fill";
      case "matching_information_block":
         return "matching_information";
      case "matching_people_block":
      case "matching_headings_block":
         return "matching_headings";
      case "multiple_choice_block":
         return "multiple_choice";
      case "true_false_not_given_block":
      default:
         return "true_false_not_given";
   }
}

export function createReadingMockQuestion(
   passageId: string,
   blockId: string,
   questionNumber: number,
   blockType: ReadingMockBlockType
): ReadingMockQuestion {
   return {
      id: crypto.randomUUID(),
      passage_id: passageId,
      block_id: blockId,
      question_number: questionNumber,
      order_index: questionNumber,
      type: blockTypeToQuestionType(blockType),
      prompt: "",
      answer_key: "",
      meta: {},
   };
}

export function normalizePassageBlocks(value: unknown): ReadingPassageBlock[] {
   if (!Array.isArray(value)) return [];

   return value
      .map((item) => {
         if (!item || typeof item !== "object") return null;
         const raw = item as Record<string, unknown>;
         const type = raw.type;
         const id =
            typeof raw.id === "string" && raw.id.trim()
               ? raw.id
               : crypto.randomUUID();
         const text = typeof raw.text === "string" ? raw.text.trim() : "";
         if (!text) return null;

         if (type === "heading") {
            return {
               id,
               type,
               text,
               level: raw.level === "h3" ? "h3" : "h2",
            } satisfies ReadingPassageBlock;
         }

         if (type === "note") {
            return { id, type, text } satisfies ReadingPassageBlock;
         }

         if (type === "paragraph") {
            return {
               id,
               type,
               text,
               label:
                  typeof raw.label === "string" && raw.label.trim()
                     ? raw.label.trim()
                     : undefined,
            } satisfies ReadingPassageBlock;
         }

         return null;
      })
      .filter((item): item is ReadingPassageBlock => item !== null);
}

export function normalizeReadingMockQuestionType(
   value: unknown
): ReadingMockQuestionType {
   switch (value) {
      case "yes_no_not_given":
      case "matching_headings":
      case "gap_fill":
      case "gap_fill_options":
      case "matching_information":
      case "multiple_choice":
      case "multiple_choice_shared":
      case "true_false_not_given":
         return value;
      default:
         return "true_false_not_given";
   }
}

export function normalizeReadingMockBlockType(
   value: unknown
): ReadingMockBlockType {
   switch (value) {
      case "yes_no_not_given_block":
      case "notes_completion_block":
      case "summary_completion_block":
      case "matching_information_block":
      case "matching_people_block":
      case "matching_headings_block":
      case "multiple_choice_block":
      case "true_false_not_given_block":
         return value;
      default:
         return "true_false_not_given_block";
   }
}

export function normalizeAnswerKey(value: unknown): string | string[] | null {
   if (Array.isArray(value)) {
      return value
         .map((item) => (typeof item === "string" ? item.trim() : ""))
         .filter(Boolean);
   }

   if (typeof value === "string") {
      return value.trim();
   }

   return null;
}

export function parseLinesToOptions(value: string, questionId: string) {
   return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
         const [labelPart, ...textParts] = line.split("|");
         const fallbackLabel = String.fromCharCode(65 + index);
         const label = (labelPart || fallbackLabel).trim() || fallbackLabel;
         const text = textParts.join("|").trim() || label;

         return {
            id: crypto.randomUUID(),
            question_id: questionId,
            label,
            text,
            order_index: index,
         } satisfies ReadingMockOption;
      });
}

export function serializeOptionsToLines(options: ReadingMockOption[]) {
   return options
      .sort((a, b) => a.order_index - b.order_index)
      .map((option) => `${option.label}|${option.text}`)
      .join("\n");
}

export function getQuestionAnswerValue(
   answers: ReadingMockAnswerMap,
   questionId: string
) {
   return answers[questionId] ?? "";
}

export function isQuestionAnswered(
   question: ReadingMockQuestion,
   answers: ReadingMockAnswerMap
) {
   return getQuestionAnswerValue(answers, question.id).trim().length > 0;
}

export function evaluateReadingMock(
   questions: ReadingMockQuestion[],
   answers: ReadingMockAnswerMap
): ReadingMockAttemptSummary {
   let answeredCount = 0;
   let correctCount = 0;
   const unansweredNumbers: number[] = [];

   for (const question of questions) {
      const userAnswer = getQuestionAnswerValue(answers, question.id).trim();
      if (!userAnswer) {
         unansweredNumbers.push(question.question_number);
         continue;
      }

      answeredCount += 1;
      const correct = question.answer_key;

      if (Array.isArray(correct)) {
         const userParts = userAnswer
            .split(",")
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
            .sort();
         const correctParts = correct
            .map((item) => item.trim().toLowerCase())
            .filter(Boolean)
            .sort();

         if (
            userParts.length === correctParts.length &&
            userParts.every((item, index) => item === correctParts[index])
         ) {
            correctCount += 1;
         }
      } else if (
         typeof correct === "string" &&
         userAnswer.toLowerCase() === correct.trim().toLowerCase()
      ) {
         correctCount += 1;
      }
   }

   return {
      answeredCount,
      correctCount,
      totalQuestions: questions.length,
      unansweredNumbers,
   };
}

export function getThemeConfig(themeId: ReadingMockThemeId) {
   return (
      READING_MOCK_THEME_OPTIONS.find((theme) => theme.id === themeId) ??
      READING_MOCK_THEME_OPTIONS[0]
   );
}

export function getQuestionsForBlock(
   questions: ReadingMockQuestion[],
   blockId: string
) {
   return questions
      .filter((question) => question.block_id === blockId)
      .sort((a, b) => a.question_number - b.question_number);
}

export function splitLines(value: string) {
   return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
}

export function getBlockTemplate(blockType: ReadingMockBlockType) {
   switch (blockType) {
      case "notes_completion_block":
         return {
            title: "Questions 1-7",
            instructions: [
               "Complete the notes below.",
               "Choose ONE WORD ONLY from the passage for each answer.",
               "Write your answers in boxes on your answer sheet.",
            ],
            sharedContent: {
               heading: "Notes heading",
               body: "- first note with [[1]]\n- second note with [[2]]\n- third note with [[3]]",
            },
            meta: {
               placeholder: "ONE WORD ONLY",
            },
         };
      case "summary_completion_block":
         return {
            title: "Questions 37-40",
            instructions: [
               "Complete the summary below.",
               "Choose ONE WORD ONLY from the passage for each answer.",
               "Write your answers in boxes on your answer sheet.",
            ],
            sharedContent: {
               heading: "Summary heading",
               body: "This is a summary sentence with [[37]].\nAnother sentence with [[38]] and [[39]].\nFinal sentence with [[40]].",
            },
            meta: {
               placeholder: "ONE WORD ONLY",
            },
         };
      case "matching_information_block":
         return {
            title: "Questions 14-17",
            instructions: [
               "Reading Passage has paragraphs A-F.",
               "Which paragraph contains the following information?",
               "Write the correct letter, A-F, in boxes on your answer sheet.",
            ],
            sharedContent: {
               heading: "Available paragraphs",
               options: [
                  { label: "A", text: "Paragraph A" },
                  { label: "B", text: "Paragraph B" },
                  { label: "C", text: "Paragraph C" },
                  { label: "D", text: "Paragraph D" },
                  { label: "E", text: "Paragraph E" },
                  { label: "F", text: "Paragraph F" },
               ],
            },
            meta: {},
         };
      case "matching_people_block":
         return {
            title: "Questions 23-26",
            instructions: [
               "Look at the following statements and the list of people below.",
               "Match each statement with the correct person.",
               "Write the correct letter, A-E, in boxes on your answer sheet.",
            ],
            sharedContent: {
               heading: "List of People",
               options: [
                  { label: "A", text: "Person A" },
                  { label: "B", text: "Person B" },
                  { label: "C", text: "Person C" },
                  { label: "D", text: "Person D" },
                  { label: "E", text: "Person E" },
               ],
            },
            meta: {},
         };
      case "matching_headings_block":
         return {
            title: "Questions 18-22",
            instructions: [
               "The reading passage has several sections.",
               "Choose the correct heading for each section from the list of headings below.",
            ],
            sharedContent: {
               heading: "List of Headings",
               options: [
                  { label: "i", text: "Heading i" },
                  { label: "ii", text: "Heading ii" },
                  { label: "iii", text: "Heading iii" },
                  { label: "iv", text: "Heading iv" },
                  { label: "v", text: "Heading v" },
               ],
            },
            meta: {},
         };
      case "multiple_choice_block":
         return {
            title: "Questions 27-30",
            instructions: [
               "Choose the correct letter, A, B, C or D.",
               "Write the correct letter in boxes on your answer sheet.",
            ],
            sharedContent: {},
            meta: {},
         };
      case "yes_no_not_given_block":
         return {
            title: "Questions 8-13",
            instructions: [
               "Do the following statements agree with the claims of the writer?",
               "In boxes on your answer sheet, write",
               "YES if the statement agrees with the claims of the writer",
               "NO if the statement contradicts the claims of the writer",
               "NOT GIVEN if it is impossible to say what the writer thinks about this",
            ],
            sharedContent: {},
            meta: {},
         };
      case "true_false_not_given_block":
      default:
         return {
            title: "Questions 8-13",
            instructions: [
               "Do the following statements agree with the information given in Reading Passage?",
               "In boxes on your answer sheet, write",
               "TRUE if the statement agrees with the information",
               "FALSE if the statement contradicts the information",
               "NOT GIVEN if there is no information on this",
            ],
            sharedContent: {},
            meta: {},
         };
   }
}
