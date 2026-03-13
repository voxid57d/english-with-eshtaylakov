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
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;
      const body = await req.json();

      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const description =
         typeof body?.description === "string" ? body.description.trim() : "";
      const isPublic = body?.isPublic === true;
      const requiresPremium = body?.requiresPremium === true;
      const folderId =
         typeof body?.folderId === "string" && body.folderId.trim()
            ? body.folderId.trim()
            : null;

      if (!deckId || !title) {
         throw new Error("Deck id and title are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_decks")
         .update({
            title,
            description: description || null,
            is_public: isPublic,
            requires_premium: requiresPremium,
            folder_id: isPublic ? folderId : null,
         })
         .eq("id", deckId)
         .select(
            "id, title, description, is_public, requires_premium, created_at, folder_id, folder:vocabulary_folders(id, title, slug)"
         )
         .single();

      if (error || !data) {
         throw new Error("Failed to update deck.");
      }

      return NextResponse.json({ deck: data });
   } catch (error) {
      return jsonError(error, "Failed to update deck.");
   }
}

export async function DELETE(
   req: Request,
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;

      if (!deckId) {
         throw new Error("Deck id is required.");
      }

      const { error } = await supabaseAdmin
         .from("vocabulary_decks")
         .delete()
         .eq("id", deckId);

      if (error) {
         throw new Error("Failed to delete deck.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to delete deck.");
   }
}
