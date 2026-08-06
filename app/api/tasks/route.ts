import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   buildOccurrences,
   canAccessAssignee,
   ensureTaskMember,
   getMonthRange,
   getVisibleMembers,
   summarizeProgress,
   type TaskComment,
   type TaskCompletion,
   type TaskTemplate,
} from "@/lib/taskTracker";

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

export async function GET(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const member = await ensureTaskMember(user);
      const visibleMembers = await getVisibleMembers(member);
      const visibleMemberIds = visibleMembers.map((entry) => entry.user_id);

      const url = new URL(req.url);
      const view = url.searchParams.get("view") === "monthly" ? "monthly" : "daily";
      const requestedDate = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
      const assignee = url.searchParams.get("assignee") || "all";

      if (!isDate(requestedDate)) {
         throw new Error("A valid date is required.");
      }

      const range =
         view === "monthly"
            ? getMonthRange(requestedDate)
            : { startDate: requestedDate, endDate: requestedDate };

      const assigneeIds =
         assignee === "all"
            ? visibleMemberIds
            : visibleMemberIds.includes(assignee)
              ? [assignee]
              : [];

      if (assigneeIds.length === 0) {
         throw new Error("Forbidden.");
      }

      const { data: tasks, error: tasksError } = await supabaseAdmin
         .from("task_templates")
         .select(
            "id, title, description, created_by, assigned_to, frequency_type, weekdays, month_days, start_date, end_date, active, created_at, updated_at",
         )
         .in("assigned_to", assigneeIds)
         .lte("start_date", range.endDate)
         .or(`end_date.is.null,end_date.gte.${range.startDate}`)
         .eq("active", true)
         .order("created_at", { ascending: false });

      if (tasksError) {
         throw new Error("Failed to load tasks.");
      }

      const taskRows = (tasks || []) as TaskTemplate[];
      const taskIds = taskRows.map((task) => task.id);

      let completions: TaskCompletion[] = [];
      let comments: TaskComment[] = [];

      if (taskIds.length > 0) {
         const [completionResult, commentResult] = await Promise.all([
            supabaseAdmin
               .from("task_completions")
               .select("id, task_id, occurrence_date, completed_by, completed_at")
               .in("task_id", taskIds)
               .gte("occurrence_date", range.startDate)
               .lte("occurrence_date", range.endDate),
            supabaseAdmin
               .from("task_comments")
               .select("id, task_id, occurrence_date, user_id, body, created_at")
               .in("task_id", taskIds)
               .gte("occurrence_date", range.startDate)
               .lte("occurrence_date", range.endDate)
               .order("created_at", { ascending: true }),
         ]);

         if (completionResult.error || commentResult.error) {
            throw new Error("Failed to load task progress.");
         }

         completions = (completionResult.data || []) as TaskCompletion[];
         comments = (commentResult.data || []) as TaskComment[];
      }

      const occurrences = buildOccurrences({
         tasks: taskRows,
         completions,
         comments,
         startDate: range.startDate,
         endDate: range.endDate,
      });

      return NextResponse.json({
         viewer: member,
         members: visibleMembers,
         range,
         occurrences,
         progress: summarizeProgress(occurrences),
      });
   } catch (error) {
      return jsonError(error, "Failed to load tasks.");
   }
}

export async function POST(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const member = await ensureTaskMember(user);
      const body = await req.json();

      const title = cleanString(body?.title);
      const description = cleanString(body?.description);
      const assignedTo = cleanString(body?.assignedTo) || member.user_id;
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
         .insert({
            title,
            description: description || null,
            assigned_to: assignedTo,
            created_by: member.user_id,
            frequency_type: frequencyType,
            weekdays: frequencyType === "weekly" ? weekdays : null,
            month_days: frequencyType === "monthly" ? monthDays : null,
            start_date: startDate,
            end_date: endDate || null,
         })
         .select(
            "id, title, description, created_by, assigned_to, frequency_type, weekdays, month_days, start_date, end_date, active, created_at, updated_at",
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to create task.");
      }

      return NextResponse.json({ task: data });
   } catch (error) {
      return jsonError(error, "Failed to create task.");
   }
}
