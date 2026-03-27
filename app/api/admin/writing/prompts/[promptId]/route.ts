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
   context: { params: Promise<{ promptId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { promptId } = await context.params;
      const body = await req.json();

      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const promptText =
         typeof body?.promptText === "string" ? body.promptText.trim() : "";
      const imageUrl =
         typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
      const sortOrder =
         typeof body?.sortOrder === "number" && Number.isFinite(body.sortOrder)
            ? Math.trunc(body.sortOrder)
            : 0;

      if (!title || !promptText) {
         throw new Error("Title and prompt text are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("writing_prompts")
         .update({
            title,
            prompt_text: promptText,
            image_url: imageUrl || null,
            sort_order: sortOrder,
         })
         .eq("id", promptId)
         .select(
            "id, task_number, title, prompt_text, image_url, sort_order, updated_at"
         )
         .maybeSingle();

      if (error || !data) {
         throw new Error("Failed to update writing prompt.");
      }

      return NextResponse.json({ prompt: data });
   } catch (error) {
      return jsonError(error, "Failed to update writing prompt.");
   }
}

export async function DELETE(
   req: Request,
   context: { params: Promise<{ promptId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { promptId } = await context.params;

      const { error } = await supabaseAdmin
         .from("writing_prompts")
         .delete()
         .eq("id", promptId);

      if (error) {
         throw new Error("Failed to delete writing prompt.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to delete writing prompt.");
   }
}
