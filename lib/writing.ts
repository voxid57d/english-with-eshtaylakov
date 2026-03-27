export const WRITING_TASKS = [
   {
      taskNumber: 1,
      title: "Task 1",
      recommendedMinutes: 20,
      minimumWords: 150,
      instructionHeading: "WRITING TASK 1",
      promptIntro: null,
      promptOutro:
         "Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
      requiresImage: true,
   },
   {
      taskNumber: 2,
      title: "Task 2",
      recommendedMinutes: 40,
      minimumWords: 250,
      instructionHeading: "WRITING TASK 2",
      promptIntro: "Write about the following topic:",
      promptOutro:
         "Give reasons for your answer and include any relevant examples from your own knowledge or experience.",
      requiresImage: false,
   },
] as const;

export type WritingTaskNumber = (typeof WRITING_TASKS)[number]["taskNumber"];
export type WritingDisplayMode = "dark" | "light" | "yellow_black";
export type WritingSubmissionStatus =
   | "draft"
   | "pending_feedback"
   | "feedback_ready";

export const WRITING_DISPLAY_MODES: Array<{
   id: WritingDisplayMode;
   label: string;
   shell: string;
   panel: string;
   subtlePanel: string;
   border: string;
   text: string;
   mutedText: string;
   textarea: string;
   textareaMuted: string;
   buttonActive: string;
   buttonIdle: string;
}> = [
   {
      id: "dark",
      label: "Dark",
      shell: "bg-slate-950",
      panel: "bg-slate-900/50",
      subtlePanel: "bg-slate-950/70",
      border: "border-slate-800",
      text: "text-slate-100",
      mutedText: "text-slate-400",
      textarea:
         "border-slate-800 bg-slate-900/60 text-slate-100 focus:border-emerald-500",
      textareaMuted: "text-slate-400",
      buttonActive: "bg-emerald-500 text-slate-950 border-emerald-400",
      buttonIdle: "border-slate-700 text-slate-300 hover:bg-slate-900",
   },
   {
      id: "light",
      label: "Light",
      shell: "bg-stone-100",
      panel: "bg-white",
      subtlePanel: "bg-stone-50",
      border: "border-stone-300",
      text: "text-stone-900",
      mutedText: "text-stone-600",
      textarea:
         "border-stone-300 bg-white text-stone-900 focus:border-sky-500",
      textareaMuted: "text-stone-500",
      buttonActive: "bg-sky-600 text-white border-sky-600",
      buttonIdle: "border-stone-300 text-stone-700 hover:bg-stone-100",
   },
   {
      id: "yellow_black",
      label: "Yellow on Black",
      shell: "bg-black",
      panel: "bg-black",
      subtlePanel: "bg-neutral-950",
      border: "border-yellow-400/40",
      text: "text-yellow-200",
      mutedText: "text-yellow-500",
      textarea:
         "border-yellow-400/40 bg-black text-yellow-200 focus:border-yellow-300",
      textareaMuted: "text-yellow-500",
      buttonActive: "bg-yellow-300 text-black border-yellow-300",
      buttonIdle: "border-yellow-400/40 text-yellow-200 hover:bg-yellow-400/10",
   },
] as const;

export type WritingPrompt = {
   id: string;
   taskNumber: WritingTaskNumber;
   title: string;
   promptText: string;
   imageUrl: string | null;
   sortOrder: number;
   updatedAt: string;
};

export type WritingSubmission = {
   id: string;
   promptId: string;
   taskNumber: WritingTaskNumber;
   answerText: string;
   status: WritingSubmissionStatus;
   submittedForFeedbackAt: string | null;
   feedbackText: string | null;
   feedbackImages: string[];
   feedbackGivenAt: string | null;
   updatedAt: string;
 };

export type WritingTaskPayload = {
   prompts: Array<{
      prompt: WritingPrompt;
      submission: WritingSubmission | null;
   }>;
 };

export function getWritingTaskMeta(taskNumber: WritingTaskNumber) {
   const task = WRITING_TASKS.find((item) => item.taskNumber === taskNumber);
   if (!task) {
      throw new Error(`Unsupported writing task number: ${taskNumber}`);
   }

   return task;
}

export function countWords(text: string) {
   return text.trim().split(/\s+/).filter(Boolean).length;
}
