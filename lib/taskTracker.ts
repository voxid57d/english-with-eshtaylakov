import type { User } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TaskRole = "manager" | "report" | "coordinator";

export type TaskMember = {
   user_id: string;
   role: TaskRole;
   manager_id: string | null;
   display_name: string | null;
   active: boolean;
};

export type TaskTemplate = {
   id: string;
   title: string;
   description: string | null;
   created_by: string;
   assigned_to: string;
   frequency_type: "daily" | "weekly" | "monthly" | "once";
   weekdays: number[] | null;
   month_days: number[] | null;
   start_date: string;
   end_date: string | null;
   active: boolean;
   created_at: string;
   updated_at: string;
};

export type TaskCompletion = {
   id: string;
   task_id: string;
   occurrence_date: string;
   completed_by: string;
   completed_at: string | null;
};

export type TaskComment = {
   id: string;
   task_id: string;
   occurrence_date: string;
   user_id: string;
   body: string;
   created_at: string;
};

export type TaskOccurrence = {
   task: TaskTemplate;
   date: string;
   isCompleted: boolean;
   completedAt: string | null;
   completedBy: string | null;
   comments: TaskComment[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getManagerUserIds() {
   return new Set(
      [
         ...(process.env.TASK_MANAGER_USER_IDS || "").split(","),
         ...(process.env.ADMIN_USER_IDS || "").split(","),
      ]
         .map((value) => value.trim())
         .filter(Boolean),
   );
}

function parseLocalDate(value: string) {
   const [year, month, day] = value.split("-").map(Number);
   return new Date(Date.UTC(year, month - 1, day));
}

function formatLocalDate(date: Date) {
   return date.toISOString().slice(0, 10);
}

export function getMonthRange(anchorDate: string) {
   const date = parseLocalDate(anchorDate);
   const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
   const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

   return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
   };
}

export function eachDate(startDate: string, endDate: string) {
   const dates: string[] = [];
   const start = parseLocalDate(startDate);
   const end = parseLocalDate(endDate);

   for (let time = start.getTime(); time <= end.getTime(); time += DAY_MS) {
      dates.push(formatLocalDate(new Date(time)));
   }

   return dates;
}

export function taskOccursOn(task: TaskTemplate, dateValue: string) {
   if (!task.active) return false;
   if (dateValue < task.start_date) return false;
   if (task.end_date && dateValue > task.end_date) return false;

   const date = parseLocalDate(dateValue);

   if (task.frequency_type === "daily") {
      return true;
   }

   if (task.frequency_type === "once") {
      return task.start_date === dateValue;
   }

   if (task.frequency_type === "weekly") {
      return (task.weekdays || []).includes(date.getUTCDay());
   }

   if (task.frequency_type === "monthly") {
      return (task.month_days || []).includes(date.getUTCDate());
   }

   return false;
}

export function buildOccurrences(params: {
   tasks: TaskTemplate[];
   completions: TaskCompletion[];
   comments: TaskComment[];
   startDate: string;
   endDate: string;
}) {
   const completionMap = new Map<string, TaskCompletion>();
   const commentMap = new Map<string, TaskComment[]>();

   for (const completion of params.completions) {
      completionMap.set(`${completion.task_id}:${completion.occurrence_date}`, completion);
   }

   for (const comment of params.comments) {
      const key = `${comment.task_id}:${comment.occurrence_date}`;
      const existing = commentMap.get(key) || [];
      existing.push(comment);
      commentMap.set(key, existing);
   }

   const occurrences: TaskOccurrence[] = [];
   for (const date of eachDate(params.startDate, params.endDate)) {
      for (const task of params.tasks) {
         if (!taskOccursOn(task, date)) continue;

         const completion = completionMap.get(`${task.id}:${date}`);
         occurrences.push({
            task,
            date,
            isCompleted: Boolean(completion),
            completedAt: completion?.completed_at ?? null,
            completedBy: completion?.completed_by ?? null,
            comments: commentMap.get(`${task.id}:${date}`) || [],
         });
      }
   }

   return occurrences.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.task.title.localeCompare(b.task.title);
   });
}

export function summarizeProgress(occurrences: TaskOccurrence[]) {
   const total = occurrences.length;
   const completed = occurrences.filter((occurrence) => occurrence.isCompleted).length;
   const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);

   return { total, completed, percentage };
}

export async function ensureTaskMember(user: User) {
   const managerUserIds = getManagerUserIds();
   const isConfiguredManager = managerUserIds.has(user.id);

   const { data: existing, error: existingError } = await supabaseAdmin
      .from("task_members")
      .select("user_id, role, manager_id, display_name, active")
      .eq("user_id", user.id)
      .maybeSingle();

   if (existingError) {
      throw new Error("Failed to load task member.");
   }

   if (existing) {
      if (existing.active !== true) {
         throw new Error("Task access is disabled for this account.");
      }

      if (isConfiguredManager && existing.role !== "manager") {
         const { data, error } = await supabaseAdmin
            .from("task_members")
            .update({
               role: "manager",
               manager_id: null,
            })
            .eq("user_id", user.id)
            .select("user_id, role, manager_id, display_name, active")
            .single();

         if (error || !data) {
            throw new Error("Failed to update task member.");
         }

         return data as TaskMember;
      }

      return existing as TaskMember;
   }

   if (!isConfiguredManager) {
      throw new Error("Task access is not enabled for this account.");
   }

   const displayName =
      typeof user.user_metadata?.username === "string"
         ? user.user_metadata.username
         : user.email ?? "New user";

   const { data, error } = await supabaseAdmin
      .from("task_members")
      .insert({
         user_id: user.id,
         role: "manager",
         manager_id: null,
         display_name: displayName,
      })
      .select("user_id, role, manager_id, display_name, active")
      .single();

   if (error || !data) {
      throw new Error("Failed to create task member.");
   }

   return data as TaskMember;
}

export async function getVisibleMembers(member: TaskMember) {
   if (member.role === "manager") {
      const { data, error } = await supabaseAdmin
         .from("task_members")
         .select("user_id, role, manager_id, display_name, active")
         .eq("active", true)
         .order("role", { ascending: true })
         .order("display_name", { ascending: true });

      if (error) {
         throw new Error("Failed to load team members.");
      }

      return (data || []) as TaskMember[];
   }

   return [member];
}

export function canAccessAssignee(member: TaskMember, assigneeId: string) {
   return member.user_id === assigneeId || member.role === "manager";
}

export function canEditTask(member: TaskMember, task: TaskTemplate) {
   return member.role === "manager" || task.created_by === member.user_id;
}
