import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   serializeReadingContentBlocks,
   slugifyReadingTitle,
} from "@/lib/readingContent";

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

function normalizeLevel(value: unknown) {
   if (typeof value !== "string") return null;

   const level = value.trim().toUpperCase();
   return ["A1", "A2", "B1", "B2", "C1"].includes(level) ? level : null;
}

export async function PATCH(
   req: Request,
   context: { params: Promise<{ articleId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { articleId } = await context.params;
      const body = await req.json();

      const title = typeof body?.title === "string" ? body.title.trim() : "";
      const shortSummary =
         typeof body?.shortSummary === "string" ? body.shortSummary.trim() : "";
      const content =
         typeof body?.content === "string" ? body.content.trim() : "";
      const coverImageUrl =
         typeof body?.coverImageUrl === "string" ? body.coverImageUrl.trim() : "";
      const rawSlug =
         typeof body?.slug === "string" && body.slug.trim()
            ? body.slug.trim()
            : title;
      const slug = slugifyReadingTitle(rawSlug);
      const level = normalizeLevel(body?.level);
      const isPremium = body?.isPremium === true;
      const contentBlocks = serializeReadingContentBlocks(
         Array.isArray(body?.contentBlocks) ? body.contentBlocks : []
      );

      if (!articleId || !title || !slug || !level) {
         throw new Error("Title, slug, and level are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("reading_articles")
         .update({
            title,
            slug,
            short_summary: shortSummary || null,
            content: content || "",
            content_blocks: contentBlocks.length > 0 ? contentBlocks : null,
            cover_image_url: coverImageUrl || null,
            level,
            is_premium: isPremium,
         })
         .eq("id", articleId)
         .select(
            "id, title, slug, short_summary, content, content_blocks, cover_image_url, level, is_premium, created_at"
         )
         .single();

      if (error || !data) {
         throw new Error(error?.message || "Failed to update reading article.");
      }

      return NextResponse.json({ article: data });
   } catch (error) {
      return jsonError(error, "Failed to update reading article.");
   }
}

export async function DELETE(
   req: Request,
   context: { params: Promise<{ articleId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { articleId } = await context.params;

      if (!articleId) {
         throw new Error("Article id is required.");
      }

      const { error } = await supabaseAdmin
         .from("reading_articles")
         .delete()
         .eq("id", articleId);

      if (error) {
         throw new Error(error.message || "Failed to delete reading article.");
      }

      return NextResponse.json({ ok: true });
   } catch (error) {
      return jsonError(error, "Failed to delete reading article.");
   }
}
