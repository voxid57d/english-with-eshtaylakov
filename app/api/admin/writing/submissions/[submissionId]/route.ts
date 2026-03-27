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
   context: { params: Promise<{ submissionId: string }> }
) {
   try {
      const adminUser = await requireAdminUser(req);
      const { submissionId } = await context.params;
      const body = await req.json();
      const feedbackText =
         typeof body?.feedbackText === "string" ? body.feedbackText.trim() : "";
      const feedbackImages = Array.isArray(body?.feedbackImages)
         ? body.feedbackImages.filter(
              (value: unknown): value is string =>
                 typeof value === "string" && value.trim().length > 0
           )
         : [];

      if (!feedbackText && feedbackImages.length === 0) {
         throw new Error("Add feedback text or at least one image.");
      }

      const { data, error } = await supabaseAdmin
         .from("writing_submissions")
         .update({
            status: "feedback_ready",
            feedback_text: feedbackText || null,
            feedback_images: feedbackImages,
            feedback_given_by: adminUser.id,
            feedback_given_at: new Date().toISOString(),
         })
         .eq("id", submissionId)
         .select("id")
         .maybeSingle<{ id: string }>();

      if (error || !data) {
         throw new Error("Failed to save writing feedback.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to save writing feedback.");
   }
}
