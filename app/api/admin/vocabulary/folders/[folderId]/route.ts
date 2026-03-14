import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function slugify(value: string) {
   return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
}

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
   context: { params: Promise<{ folderId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { folderId } = await context.params;
      const body = await req.json();

      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const description =
         typeof body?.description === "string" ? body.description.trim() : "";
      const sortOrder = Number.isFinite(body?.sortOrder)
         ? Number(body.sortOrder)
         : 0;
      const rawSlug =
         typeof body?.slug === "string" ? body.slug.trim() : title;
      const slug = slugify(rawSlug);

      if (!folderId || !title || !slug) {
         throw new Error("Folder id, title, and slug are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_folders")
         .update({
            title,
            slug,
            description: description || null,
            sort_order: sortOrder,
         })
         .eq("id", folderId)
         .select("id, slug, title, description, sort_order, created_at")
         .single();

      if (error || !data) {
         throw new Error("Failed to update folder.");
      }

      return NextResponse.json({ folder: data });
   } catch (error) {
      return jsonError(error, "Failed to update folder.");
   }
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
