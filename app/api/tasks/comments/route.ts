import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canAccessTask, ensureTaskMember, type TaskTemplate } from "@/lib/taskTracker";

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

function isDate(value: string) {
   return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const member = await ensureTaskMember(user);
      const body = await req.json();
      const taskId = typeof body?.taskId === "string" ? body.taskId.trim() : "";
      const occurrenceDate =
         typeof body?.occurrenceDate === "string" ? body.occurrenceDate.trim() : "";
      const comment = typeof body?.comment === "string" ? body.comment.trim() : "";

      if (!taskId || !isDate(occurrenceDate)) {
         throw new Error("Task and date are required.");
      }

      if (!comment) {
         throw new Error("Comment is required.");
      }

      const { data: task, error: taskError } = await supabaseAdmin
         .from("task_templates")
         .select(
            "id, title, description, created_by, assigned_to, branch_id, frequency_type, weekdays, month_days, start_date, end_date, active, created_at, updated_at",
         )
         .eq("id", taskId)
         .maybeSingle();

      if (taskError || !task) {
         throw new Error("Task not found.");
      }

      const taskRow = task as TaskTemplate;
      if (!canAccessTask(member, taskRow)) {
         throw new Error("Forbidden.");
      }

      const { data, error } = await supabaseAdmin
         .from("task_comments")
         .insert({
            task_id: taskId,
            occurrence_date: occurrenceDate,
            user_id: member.user_id,
            body: comment,
         })
         .select("id, task_id, occurrence_date, user_id, body, created_at")
         .single();

      if (error || !data) {
         throw new Error("Failed to add comment.");
      }

      return NextResponse.json({ comment: data });
   } catch (error) {
      return jsonError(error, "Failed to add comment.");
   }
}
