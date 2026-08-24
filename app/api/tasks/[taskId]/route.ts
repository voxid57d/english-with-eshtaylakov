import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   canAccessAssignee,
   canEditTask,
   ensureTaskMember,
   getVisibleMembers,
   type TaskTemplate,
} from "@/lib/taskTracker";

type RouteContext = {
   params: Promise<{
      taskId: string;
   }>;
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

function cleanString(value: unknown) {
   return typeof value === "string" ? value.trim() : "";
}

function normalizeNumberList(value: unknown, min: number, max: number) {
   if (!Array.isArray(value)) return [];

   return Array.from(
      new Set(
         value
            .map((entry) => Number(entry))
            .filter((entry) => Number.isInteger(entry) && entry >= min && entry <= max),
      ),
   ).sort((a, b) => a - b);
}

function isDate(value: string) {
   return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getBranchForAssignee(
   visibleMembers: Awaited<ReturnType<typeof getVisibleMembers>>,
   assigneeId: string,
) {
   return (
      visibleMembers.find((member) => member.user_id === assigneeId)?.primary_branch_id ||
      null
   );
}

async function loadTask(taskId: string) {
   const { data, error } = await supabaseAdmin
      .from("task_templates")
      .select(
         "id, title, description, created_by, assigned_to, branch_id, frequency_type, weekdays, month_days, start_date, end_date, active, created_at, updated_at",
      )
      .eq("id", taskId)
      .maybeSingle();

   if (error || !data) {
      throw new Error("Task not found.");
   }

   return data as TaskTemplate;
}

export async function PATCH(req: Request, context: RouteContext) {
   try {
      const user = await requireAuthenticatedUser(req);
      const member = await ensureTaskMember(user);
      const { taskId } = await context.params;
      const task = await loadTask(taskId);

      if (!canEditTask(member, task)) {
         throw new Error("Forbidden.");
      }

      const body = await req.json();
      const title = cleanString(body?.title);
      const description = cleanString(body?.description);
      const assignedTo = cleanString(body?.assignedTo) || task.assigned_to;
      const frequencyType = cleanString(body?.frequencyType);
      const startDate = cleanString(body?.startDate);
      const endDate = cleanString(body?.endDate);

      if (!title) {
         throw new Error("Task title is required.");
      }

      if (!["daily", "weekly", "monthly", "once"].includes(frequencyType)) {
         throw new Error("Choose a valid repeat type.");
      }

      if (!isDate(startDate)) {
         throw new Error("Start date is required.");
      }

      if (endDate && !isDate(endDate)) {
         throw new Error("End date must be a valid date.");
      }

      if (!canAccessAssignee(member, assignedTo)) {
         throw new Error("Forbidden.");
      }

      const visibleMembers = await getVisibleMembers(member);
      if (!visibleMembers.some((entry) => entry.user_id === assignedTo)) {
         throw new Error("Assignee is not in your task team.");
      }

      const weekdays = normalizeNumberList(body?.weekdays, 0, 6);
      const monthDays = normalizeNumberList(body?.monthDays, 1, 31);

      if (frequencyType === "weekly" && weekdays.length === 0) {
         throw new Error("Choose at least one weekday.");
      }

      if (frequencyType === "monthly" && monthDays.length === 0) {
         throw new Error("Choose at least one day of the month.");
      }

      const { data, error } = await supabaseAdmin
         .from("task_templates")
         .update({
            title,
            description: description || null,
            assigned_to: assignedTo,
            branch_id: getBranchForAssignee(visibleMembers, assignedTo),
            frequency_type: frequencyType,
            weekdays: frequencyType === "weekly" ? weekdays : null,
            month_days: frequencyType === "monthly" ? monthDays : null,
            start_date: startDate,
            end_date: endDate || null,
            updated_at: new Date().toISOString(),
         })
         .eq("id", taskId)
         .select(
            "id, title, description, created_by, assigned_to, branch_id, frequency_type, weekdays, month_days, start_date, end_date, active, created_at, updated_at",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to update task.");
      }

      return NextResponse.json({ task: data });
   } catch (error) {
      return jsonError(error, "Failed to update task.");
   }
}

export async function DELETE(req: Request, context: RouteContext) {
   try {
      const user = await requireAuthenticatedUser(req);
      const member = await ensureTaskMember(user);
      const { taskId } = await context.params;
      const task = await loadTask(taskId);

      if (!canEditTask(member, task)) {
         throw new Error("Forbidden.");
      }

      const { error } = await supabaseAdmin
         .from("task_templates")
         .update({
            active: false,
            updated_at: new Date().toISOString(),
         })
         .eq("id", taskId);

      if (error) {
         throw new Error("Failed to archive task.");
      }

      return NextResponse.json({ ok: true });
   } catch (error) {
      return jsonError(error, "Failed to archive task.");
   }
}
