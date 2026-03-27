import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   countWords,
   getWritingTaskMeta,
   WRITING_TASKS,
   type WritingPrompt,
   type WritingSubmission,
   type WritingTaskNumber,
   type WritingTaskPayload,
} from "@/lib/writing";

type WritingPromptRow = {
   id: string;
   task_number: number;
   title: string;
   prompt_text: string;
   image_url: string | null;
   sort_order: number | null;
   updated_at: string;
};

type WritingSubmissionRow = {
   id: string;
   prompt_id: string;
   task_number: number;
   answer_text: string;
   status: "draft" | "pending_feedback" | "feedback_ready";
   submitted_for_feedback_at: string | null;
   feedback_text: string | null;
   feedback_images: string[] | null;
   feedback_given_at: string | null;
   updated_at: string;
};

function jsonError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const status =
      message === "Missing bearer token." || message === "Unauthorized."
         ? 401
         : message === "Forbidden."
           ? 403
           : 400;

   return NextResponse.json({ error: message || fallback }, { status });
}

function normalizeTaskNumber(value: unknown): WritingTaskNumber {
   if (value === 1 || value === "1") return 1;
   if (value === 2 || value === "2") return 2;
   throw new Error("Task number must be 1 or 2.");
}

function normalizePromptId(value: unknown) {
   const promptId = typeof value === "string" ? value.trim() : "";
   if (!promptId) {
      throw new Error("Prompt ID is required.");
   }

   return promptId;
}

function mapPrompt(row: WritingPromptRow): WritingPrompt {
   return {
      id: row.id,
      taskNumber: row.task_number as WritingTaskNumber,
      title: row.title,
      promptText: row.prompt_text,
      imageUrl: row.image_url,
      sortOrder: row.sort_order ?? 0,
      updatedAt: row.updated_at,
   };
}

function mapSubmission(row: WritingSubmissionRow): WritingSubmission {
   return {
      id: row.id,
      promptId: row.prompt_id,
      taskNumber: row.task_number as WritingTaskNumber,
      answerText: row.answer_text,
      status: row.status,
      submittedForFeedbackAt: row.submitted_for_feedback_at,
      feedbackText: row.feedback_text,
      feedbackImages: row.feedback_images || [],
      feedbackGivenAt: row.feedback_given_at,
      updatedAt: row.updated_at,
   };
}

async function getPromptById(promptId: string) {
   const { data, error } = await supabaseAdmin
      .from("writing_prompts")
      .select(
         "id, task_number, title, prompt_text, image_url, sort_order, updated_at"
      )
      .eq("id", promptId)
      .maybeSingle<WritingPromptRow>();

   if (error) {
      throw new Error("Failed to load writing prompt.");
   }

   if (!data) {
      throw new Error("Writing prompt not found.");
   }

   return data;
}

export async function GET(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const url = new URL(req.url);
      const taskParam = url.searchParams.get("taskNumber");

      const taskFilter = taskParam ? normalizeTaskNumber(taskParam) : null;

      let promptsQuery = supabaseAdmin
         .from("writing_prompts")
         .select(
            "id, task_number, title, prompt_text, image_url, sort_order, updated_at"
         )
         .order("task_number", { ascending: true })
         .order("sort_order", { ascending: true })
         .order("created_at", { ascending: true });

      if (taskFilter) {
         promptsQuery = promptsQuery.eq("task_number", taskFilter);
      }

      const { data: prompts, error: promptsError } = await promptsQuery;

      if (promptsError) {
         throw new Error("Failed to load writing tasks.");
      }

      const promptRows = (prompts || []) as WritingPromptRow[];
      const promptIds = promptRows.map((prompt) => prompt.id);

      let submissionRows: WritingSubmissionRow[] = [];
      if (promptIds.length > 0) {
         const { data: submissions, error: submissionsError } = await supabaseAdmin
            .from("writing_submissions")
            .select(
               "id, prompt_id, task_number, answer_text, status, submitted_for_feedback_at, feedback_text, feedback_images, feedback_given_at, updated_at"
            )
            .eq("user_id", user.id)
            .in("prompt_id", promptIds);

         if (submissionsError) {
            throw new Error("Failed to load your writing drafts.");
         }

         submissionRows = (submissions || []) as WritingSubmissionRow[];
      }

      const submissionByPromptId = new Map<string, WritingSubmission>(
         submissionRows.map((row) => [row.prompt_id, mapSubmission(row)])
      );

      const grouped = new Map<WritingTaskNumber, WritingTaskPayload>();
      for (const task of WRITING_TASKS) {
         grouped.set(task.taskNumber, { prompts: [] });
      }

      promptRows.forEach((row) => {
         const prompt = mapPrompt(row);
         const bucket = grouped.get(prompt.taskNumber);
         if (!bucket) return;

         bucket.prompts.push({
            prompt,
            submission: submissionByPromptId.get(prompt.id) || null,
         });
      });

      const tasks = WRITING_TASKS.filter((task) =>
         taskFilter ? task.taskNumber === taskFilter : true
      ).map((task) => ({
         taskNumber: task.taskNumber,
         prompts: grouped.get(task.taskNumber)?.prompts || [],
      }));

      return NextResponse.json({ tasks });
   } catch (error) {
      return jsonError(error, "Failed to load writing tasks.");
   }
}

export async function PUT(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const body = await req.json();
      const promptId = normalizePromptId(body?.promptId);
      const answerText =
         typeof body?.answerText === "string" ? body.answerText : "";
      const prompt = await getPromptById(promptId);

      const { data: existing, error: existingError } = await supabaseAdmin
         .from("writing_submissions")
         .select(
            "id, prompt_id, task_number, answer_text, status, submitted_for_feedback_at, feedback_text, feedback_images, feedback_given_at, updated_at"
         )
         .eq("user_id", user.id)
         .eq("prompt_id", prompt.id)
         .maybeSingle<WritingSubmissionRow>();

      if (existingError) {
         throw new Error("Failed to save your writing.");
      }

      const answerChanged = existing ? existing.answer_text !== answerText : true;
      let nextStatus: WritingSubmissionRow["status"] = "draft";

      if (existing) {
         if (!answerChanged) {
            nextStatus = existing.status;
         } else if (existing.status === "pending_feedback") {
            nextStatus = "draft";
         } else {
            nextStatus = existing.status;
         }
      }

      const { data, error } = await supabaseAdmin
         .from("writing_submissions")
         .upsert(
            {
               user_id: user.id,
               prompt_id: prompt.id,
               task_number: prompt.task_number,
               answer_text: answerText,
               status: nextStatus,
               submitted_for_feedback_at:
                  nextStatus === "pending_feedback"
                     ? existing?.submitted_for_feedback_at || null
                     : null,
               feedback_text:
                  nextStatus === "feedback_ready"
                     ? existing?.feedback_text || null
                     : null,
               feedback_images:
                  nextStatus === "feedback_ready"
                     ? existing?.feedback_images || []
                     : [],
               feedback_given_at:
                  nextStatus === "feedback_ready"
                     ? existing?.feedback_given_at || null
                     : null,
            },
            {
               onConflict: "user_id,prompt_id",
            }
         )
         .select(
            "id, prompt_id, task_number, answer_text, status, submitted_for_feedback_at, feedback_text, feedback_images, feedback_given_at, updated_at"
         )
         .single<WritingSubmissionRow>();

      if (error || !data) {
         throw new Error("Failed to save your writing.");
      }

      return NextResponse.json({ submission: mapSubmission(data) });
   } catch (error) {
      return jsonError(error, "Failed to save your writing.");
   }
}

export async function POST(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const body = await req.json();
      const promptId = normalizePromptId(body?.promptId);
      const prompt = await getPromptById(promptId);
      const taskMeta = getWritingTaskMeta(prompt.task_number as WritingTaskNumber);

      const { data: profile, error: profileError } = await supabaseAdmin
         .from("profiles")
         .select("is_premium")
         .eq("id", user.id)
         .maybeSingle<{ is_premium: boolean | null }>();

      if (profileError) {
         throw new Error("Failed to verify premium access.");
      }

      if (profile?.is_premium !== true) {
         throw new Error("Forbidden.");
      }

      const { data: existing, error: existingError } = await supabaseAdmin
         .from("writing_submissions")
         .select(
            "id, prompt_id, task_number, answer_text, status, submitted_for_feedback_at, feedback_text, feedback_images, feedback_given_at, updated_at"
         )
         .eq("user_id", user.id)
         .eq("prompt_id", prompt.id)
         .maybeSingle<WritingSubmissionRow>();

      if (existingError) {
         throw new Error("Failed to submit writing for feedback.");
      }

      const answerText =
         typeof body?.answerText === "string"
            ? body.answerText
            : existing?.answer_text || "";

      if (!answerText.trim()) {
         throw new Error("Write your answer before sending it for feedback.");
      }

      if (countWords(answerText) < Math.min(30, taskMeta.minimumWords)) {
         throw new Error("Your draft is still too short to submit for feedback.");
      }

      const { data, error } = await supabaseAdmin
         .from("writing_submissions")
         .upsert(
            {
               user_id: user.id,
               prompt_id: prompt.id,
               task_number: prompt.task_number,
               answer_text: answerText,
               status: "pending_feedback",
               submitted_for_feedback_at: new Date().toISOString(),
               feedback_text: null,
               feedback_images: [],
               feedback_given_by: null,
               feedback_given_at: null,
            },
            {
               onConflict: "user_id,prompt_id",
            }
         )
         .select(
            "id, prompt_id, task_number, answer_text, status, submitted_for_feedback_at, feedback_text, feedback_images, feedback_given_at, updated_at"
         )
         .single<WritingSubmissionRow>();

      if (error || !data) {
         throw new Error("Failed to submit writing for feedback.");
      }

      return NextResponse.json({ submission: mapSubmission(data) });
   } catch (error) {
      return jsonError(error, "Failed to submit writing for feedback.");
   }
}
