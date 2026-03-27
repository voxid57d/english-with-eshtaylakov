import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WritingTaskNumber } from "@/lib/writing";

type WritingPromptRow = {
   id: string;
   task_number: number;
   title: string;
   prompt_text: string;
   image_url: string | null;
   sort_order: number | null;
   updated_at: string;
};

type PendingSubmissionRow = {
   id: string;
   user_id: string;
   prompt_id: string;
   task_number: number;
   answer_text: string;
   submitted_for_feedback_at: string | null;
   created_at: string;
};

type ProfileRow = {
   id: string;
   username: string | null;
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

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);

      const [{ data: prompts, error: promptsError }, { data: submissions, error: submissionsError }] =
         await Promise.all([
            supabaseAdmin
               .from("writing_prompts")
               .select(
                  "id, task_number, title, prompt_text, image_url, sort_order, updated_at"
               )
               .order("task_number", { ascending: true })
               .order("sort_order", { ascending: true })
               .order("created_at", { ascending: true }),
            supabaseAdmin
               .from("writing_submissions")
               .select(
                  "id, user_id, prompt_id, task_number, answer_text, submitted_for_feedback_at, created_at"
               )
               .eq("status", "pending_feedback")
               .order("submitted_for_feedback_at", { ascending: true }),
         ]);

      if (promptsError || submissionsError) {
         throw new Error("Failed to load writing admin.");
      }

      const pendingRows = (submissions || []) as PendingSubmissionRow[];
      const userIds = Array.from(new Set(pendingRows.map((row) => row.user_id)));

      let usernameMap = new Map<string, string | null>();
      if (userIds.length > 0) {
         const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("id, username")
            .in("id", userIds);

         if (profilesError) {
            throw new Error("Failed to load writing admin.");
         }

         usernameMap = new Map(
            ((profiles || []) as ProfileRow[]).map((profile) => [
               profile.id,
               profile.username?.trim() || null,
            ])
         );
      }

      return NextResponse.json({
         prompts: (prompts || []) as WritingPromptRow[],
         pendingSubmissions: pendingRows.map((submission) => ({
            id: submission.id,
            userId: submission.user_id,
            promptId: submission.prompt_id,
            taskNumber: submission.task_number as WritingTaskNumber,
            answerText: submission.answer_text,
            submittedForFeedbackAt: submission.submitted_for_feedback_at,
            createdAt: submission.created_at,
            username: usernameMap.get(submission.user_id) || null,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load writing admin.");
   }
}

export async function POST(req: Request) {
   try {
      await requireAdminUser(req);
      const body = await req.json();
      const taskNumber = normalizeTaskNumber(body?.taskNumber);
      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const promptText =
         typeof body?.promptText === "string" ? body.promptText.trim() : "";
      const imageUrl =
         typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
      const sortOrder =
         typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)
            ? Math.trunc(body.sortOrder)
            : null;

      if (!title || !promptText) {
         throw new Error("Title and prompt text are required.");
      }

      let nextSortOrder = sortOrder;
      if (nextSortOrder === null) {
         const { data: lastPrompt, error: lastPromptError } = await supabaseAdmin
            .from("writing_prompts")
            .select("sort_order")
            .eq("task_number", taskNumber)
            .order("sort_order", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle<{ sort_order: number | null }>();

         if (lastPromptError) {
            throw new Error("Failed to create writing prompt.");
         }

         nextSortOrder = (lastPrompt?.sort_order ?? 0) + 1;
      }

      const { data, error } = await supabaseAdmin
         .from("writing_prompts")
         .insert({
            task_number: taskNumber,
            title,
            prompt_text: promptText,
            image_url: imageUrl || null,
            sort_order: nextSortOrder,
         })
         .select(
            "id, task_number, title, prompt_text, image_url, sort_order, updated_at"
         )
         .single<WritingPromptRow>();

      if (error || !data) {
         throw new Error("Failed to create writing prompt.");
      }

      return NextResponse.json({ prompt: data }, { status: 201 });
   } catch (error) {
      return jsonError(error, "Failed to create writing prompt.");
   }
}
