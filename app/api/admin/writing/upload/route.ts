import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/adminAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const WRITING_BUCKET = "writing-feedback";

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

function getFileExtension(fileName: string) {
   const parts = fileName.split(".");
   return parts.length > 1 ? parts.at(-1)?.toLowerCase() || "bin" : "bin";
}

export async function POST(req: Request) {
   try {
      await requireAdminUser(req);

      const formData = await req.formData();
      const file = formData.get("file");
      const folder = formData.get("folder");

      if (!(file instanceof File)) {
         throw new Error("No file was uploaded.");
      }

      const safeFolder =
         typeof folder === "string" && folder.trim() ? folder.trim() : "general";
      const fileExt = getFileExtension(file.name);
      const filePath = `${safeFolder}/${Date.now()}-${randomUUID()}.${fileExt}`;
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadError } = await supabaseAdmin.storage
         .from(WRITING_BUCKET)
         .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
         });

      if (uploadError) {
         throw new Error(uploadError.message || "Failed to upload file.");
      }

      const { data } = supabaseAdmin.storage
         .from(WRITING_BUCKET)
         .getPublicUrl(filePath);

      return NextResponse.json({ url: data.publicUrl });
   } catch (error) {
      return jsonError(error, "Failed to upload file.");
   }
}
