import type { User } from "@supabase/supabase-js";
import { ERP_ROLE_LABELS, type ErpStaffRole } from "@/lib/erp";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type TaskRole = ErpStaffRole;

export type TaskMember = {
   user_id: string;
   role: TaskRole;
   manager_id: string | null;
   display_name: string | null;
   primary_branch_id: string | null;
   branch_name: string | null;
   active: boolean;
};

export type TaskTemplate = {
   id: string;
   title: string;
   description: string | null;
   created_by: string;
   assigned_to: string;
   branch_id: string | null;
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

function getDisplayName(user: User) {
   const metadataName =
      typeof user.user_metadata?.full_name === "string"
         ? user.user_metadata.full_name
         : typeof user.user_metadata?.name === "string"
           ? user.user_metadata.name
           : typeof user.user_metadata?.username === "string"
             ? user.user_metadata.username
             : "";

   return metadataName.trim() || user.email || "New staff member";
}

function isTaskManagerRole(role: TaskRole) {
   return role === "admin" || role === "branch_manager" || role === "sales_manager";
}

function toTaskMember(row: {
   user_id: string;
   role: TaskRole;
   full_name?: string | null;
   display_name?: string | null;
   primary_branch_id?: string | null;
   active: boolean;
   branches?: { name?: string | null } | null;
}): TaskMember {
   return {
      user_id: row.user_id,
      role: row.role,
      manager_id: null,
      display_name: row.full_name || row.display_name || ERP_ROLE_LABELS[row.role],
      primary_branch_id: row.primary_branch_id ?? null,
      branch_name: row.branches?.name ?? null,
      active: row.active,
   };
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
      .from("staff_profiles")
      .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
      .eq("user_id", user.id)
      .maybeSingle();

   if (existingError) {
      throw new Error("Failed to load Amir Temur staff profile. Apply supabase/erp_core_schema.sql first.");
   }

   if (existing) {
      if (existing.active !== true) {
         throw new Error("Amir Temur access is disabled for this account.");
      }

      if (isConfiguredManager && existing.role !== "admin") {
         const { data, error } = await supabaseAdmin
            .from("staff_profiles")
            .update({
               role: "admin",
            })
            .eq("user_id", user.id)
            .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
            .single();

         if (error || !data) {
            throw new Error("Failed to update Amir Temur staff profile.");
         }

         return toTaskMember(data as unknown as Parameters<typeof toTaskMember>[0]);
      }

      return toTaskMember(existing as unknown as Parameters<typeof toTaskMember>[0]);
   }

   if (!isConfiguredManager) {
      throw new Error("Amir Temur staff access is not enabled for this account.");
   }

   const { data, error } = await supabaseAdmin
      .from("staff_profiles")
      .insert({
         user_id: user.id,
         role: "admin",
         full_name: getDisplayName(user),
         primary_branch_id: null,
      })
      .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
      .single();

   if (error || !data) {
      throw new Error("Failed to create Amir Temur staff profile.");
   }

   return toTaskMember(data as unknown as Parameters<typeof toTaskMember>[0]);
}

export async function getVisibleMembers(member: TaskMember) {
   if (!isTaskManagerRole(member.role)) {
      return [member];
   }

   let query = supabaseAdmin
      .from("staff_profiles")
      .select("user_id, full_name, role, primary_branch_id, active, branches:primary_branch_id(name)")
      .eq("active", true)
      .order("role", { ascending: true })
      .order("full_name", { ascending: true });

   if (member.role === "branch_manager" && member.primary_branch_id) {
      query = query.eq("primary_branch_id", member.primary_branch_id);
   }

   const { data, error } = await query;

   if (error) {
      throw new Error("Failed to load Amir Temur staff.");
   }

   const visibleMembers = ((data || []) as unknown as Parameters<typeof toTaskMember>[0][])
      .map(toTaskMember);

   if (!visibleMembers.some((entry) => entry.user_id === member.user_id)) {
      visibleMembers.push(member);
   }

   return visibleMembers;
}

export function canAccessAssignee(member: TaskMember, assigneeId: string) {
   return member.user_id === assigneeId || isTaskManagerRole(member.role);
}

export function canAccessTask(member: TaskMember, task: TaskTemplate) {
   if (member.user_id === task.assigned_to || member.user_id === task.created_by) {
      return true;
   }

   if (member.role === "admin" || member.role === "sales_manager") {
      return true;
   }

   if (member.role === "branch_manager") {
      return !task.branch_id || task.branch_id === member.primary_branch_id;
   }

   return false;
}

export function canEditTask(member: TaskMember, task: TaskTemplate) {
   if (task.created_by === member.user_id) {
      return true;
   }

   if (member.role === "admin" || member.role === "sales_manager") {
      return true;
   }

   if (member.role === "branch_manager") {
      return !task.branch_id || task.branch_id === member.primary_branch_id;
   }

   return false;
}
