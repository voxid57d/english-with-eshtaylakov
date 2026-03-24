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

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);

      const { data, error } = await supabaseAdmin
         .from("reading_articles")
         .select(
            "id, title, slug, short_summary, content, content_blocks, cover_image_url, level, is_premium, created_at"
         )
         .order("created_at", { ascending: false });

      if (error) {
         throw new Error("Failed to load reading articles.");
      }

      return NextResponse.json({ articles: data || [] });
   } catch (error) {
      return jsonError(error, "Failed to load reading articles.");
   }
}

export async function POST(req: Request) {
   try {
      await requireAdminUser(req);
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

      if (!title || !slug || !level) {
         throw new Error("Title, slug, and level are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("reading_articles")
         .insert({
            title,
            slug,
            short_summary: shortSummary || null,
            content: content || "",
            content_blocks: contentBlocks.length > 0 ? contentBlocks : null,
            cover_image_url: coverImageUrl || null,
            level,
            is_premium: isPremium,
         })
         .select(
            "id, title, slug, short_summary, content, content_blocks, cover_image_url, level, is_premium, created_at"
         )
         .single();

      if (error || !data) {
         throw new Error(error?.message || "Failed to create reading article.");
      }

      return NextResponse.json({ article: data }, { status: 201 });
   } catch (error) {
      return jsonError(error, "Failed to create reading article.");
   }
}
