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

export async function GET(req: Request) {
   try {
      await requireAdminUser(req);

      const [foldersResult, decksResult] = await Promise.all([
         supabaseAdmin
            .from("vocabulary_folders")
            .select(
               "id, slug, title, description, sort_order, created_at, is_available_for_battle",
            )
            .order("sort_order", { ascending: true })
            .order("created_at", { ascending: false }),
         supabaseAdmin
            .from("vocabulary_decks")
            .select(
               "id, title, description, is_public, requires_premium, created_at, folder_id, folder:vocabulary_folders(id, title, slug)"
            )
            .order("created_at", { ascending: false }),
      ]);

      if (foldersResult.error || decksResult.error) {
         throw new Error("Failed to load admin vocabulary data.");
      }

      return NextResponse.json({
         folders: foldersResult.data || [],
         decks: decksResult.data || [],
      });
   } catch (error) {
      return jsonError(error, "Failed to load admin vocabulary data.");
   }
}

export async function POST(req: Request) {
   try {
      await requireAdminUser(req);
      const body = await req.json();
      const type = typeof body?.type === "string" ? body.type.trim() : "";

      if (type === "folder") {
         const title = typeof body?.title === "string" ? body.title.trim() : "";
         const description =
            typeof body?.description === "string" ? body.description.trim() : "";
         const sortOrder = Number.isFinite(body?.sortOrder)
            ? Number(body.sortOrder)
            : 0;
         const rawSlug =
            typeof body?.slug === "string" ? body.slug.trim() : title;
         const slug = slugify(rawSlug);

         if (!title || !slug) {
            throw new Error("Folder title and slug are required.");
         }

         const { data, error } = await supabaseAdmin
            .from("vocabulary_folders")
            .insert({
               title,
               slug,
               description: description || null,
               sort_order: sortOrder,
            })
            .select(
               "id, slug, title, description, sort_order, created_at, is_available_for_battle",
            )
            .single();

         if (error || !data) {
            throw new Error("Failed to create folder.");
         }

         return NextResponse.json({ folder: data }, { status: 201 });
      }

      if (type === "deck") {
         const title = typeof body?.title === "string" ? body.title.trim() : "";
         const description =
            typeof body?.description === "string" ? body.description.trim() : "";
         const folderId =
            typeof body?.folderId === "string" && body.folderId.trim()
               ? body.folderId.trim()
               : null;
         const isPublic = body?.isPublic !== false;
         const requiresPremium = body?.requiresPremium === true;

         if (!title) {
            throw new Error("Deck title is required.");
         }

         const { data, error } = await supabaseAdmin
            .from("vocabulary_decks")
            .insert({
               title,
               description: description || null,
               is_public: isPublic,
               requires_premium: requiresPremium,
               folder_id: isPublic ? folderId : null,
            })
            .select(
               "id, title, description, is_public, requires_premium, created_at, folder_id, folder:vocabulary_folders(id, title, slug)"
            )
            .single();

         if (error || !data) {
            throw new Error("Failed to create deck.");
         }

         return NextResponse.json({ deck: data }, { status: 201 });
      }

      throw new Error("Unsupported admin action.");
   } catch (error) {
      return jsonError(error, "Failed to create admin vocabulary item.");
   }
}
