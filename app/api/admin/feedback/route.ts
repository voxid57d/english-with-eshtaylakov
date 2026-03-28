import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type FeedbackRow = {
   id: string;
   user_id: string;
   message: string;
   status: "new" | "reviewed";
   reviewed_at: string | null;
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

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);

      const { data, error } = await supabaseAdmin
         .from("user_feedback")
         .select("id, user_id, message, status, reviewed_at, created_at")
         .order("created_at", { ascending: false });

      if (error) {
         throw new Error("Failed to load feedback.");
      }

      const feedbackRows = (data || []) as FeedbackRow[];
      const userIds = Array.from(new Set(feedbackRows.map((entry) => entry.user_id)));

      let usernameMap = new Map<string, string | null>();
      if (userIds.length > 0) {
         const { data: profiles, error: profilesError } = await supabaseAdmin
            .from("profiles")
            .select("id, username")
            .in("id", userIds);

         if (profilesError) {
            throw new Error("Failed to load feedback.");
         }

         usernameMap = new Map(
            ((profiles || []) as ProfileRow[]).map((profile) => [
               profile.id,
               profile.username?.trim() || null,
            ])
         );
      }

      return NextResponse.json({
         feedback: feedbackRows.map((entry) => ({
            id: entry.id,
            userId: entry.user_id,
            username: usernameMap.get(entry.user_id) || null,
            message: entry.message,
            status: entry.status,
            reviewedAt: entry.reviewed_at,
            createdAt: entry.created_at,
         })),
      });
   } catch (error) {
      return jsonError(error, "Failed to load feedback.");
   }
}
