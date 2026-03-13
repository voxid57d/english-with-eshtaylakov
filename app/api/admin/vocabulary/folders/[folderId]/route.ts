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

export async function DELETE(
   req: Request,
   context: { params: Promise<{ folderId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { folderId } = await context.params;

      if (!folderId) {
         throw new Error("Folder id is required.");
      }

      const { error } = await supabaseAdmin
         .from("vocabulary_folders")
         .delete()
         .eq("id", folderId);

      if (error) {
         throw new Error("Failed to delete folder.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to delete folder.");
   }
}
