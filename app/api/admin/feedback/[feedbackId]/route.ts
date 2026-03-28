import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

export async function PATCH(
   req: Request,
   context: { params: Promise<{ feedbackId: string }> }
) {
   try {
      const adminUser = await requireAdminUser(req);
      const body = await req.json();
      const { feedbackId } = await context.params;
      const status = body?.status === "reviewed" ? "reviewed" : "new";

      const { data, error } = await supabaseAdmin
         .from("user_feedback")
         .update({
            status,
            reviewed_by: status === "reviewed" ? adminUser.id : null,
            reviewed_at: status === "reviewed" ? new Date().toISOString() : null,
         })
         .eq("id", feedbackId)
         .select("id")
         .maybeSingle<{ id: string }>();

      if (error || !data) {
         throw new Error("Failed to update feedback.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to update feedback.");
   }
}
