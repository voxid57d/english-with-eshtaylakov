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

type BattleFoldersBody = {
   folderIds?: unknown[];
};

export async function PATCH(req: Request) {
   try {
      await requireAdminUser(req);
      const body = (await req.json()) as BattleFoldersBody;
      const folderIds = Array.isArray(body.folderIds)
         ? body.folderIds.filter(
              (folderId): folderId is string =>
                 typeof folderId === "string" && folderId.trim().length > 0,
           )
         : [];

      const { error: disableError } = await supabaseAdmin
         .from("vocabulary_folders")
         .update({ is_available_for_battle: false })
         .not("id", "is", null);

      if (disableError) {
         throw new Error("Failed to update battle folders.");
      }

      if (folderIds.length > 0) {
         const { error: enableError } = await supabaseAdmin
            .from("vocabulary_folders")
            .update({ is_available_for_battle: true })
            .in("id", folderIds);

         if (enableError) {
            throw new Error("Failed to update battle folders.");
         }
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_folders")
         .select(
            "id, slug, title, description, sort_order, created_at, is_available_for_battle",
         )
         .order("sort_order", { ascending: true })
         .order("created_at", { ascending: false });

      if (error) {
         throw new Error("Failed to load updated battle folders.");
      }

      return NextResponse.json({ folders: data || [] });
   } catch (error) {
      return jsonError(error, "Failed to update battle folders.");
   }
}
