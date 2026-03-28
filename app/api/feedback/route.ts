import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/serverAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function jsonError(error: unknown, fallback: string) {
   const message = error instanceof Error ? error.message : fallback;
   const status =
      message === "Missing bearer token." || message === "Unauthorized."
         ? 401
         : 400;

   return NextResponse.json({ error: message || fallback }, { status });
}

export async function POST(req: Request) {
   try {
      const user = await requireAuthenticatedUser(req);
      const body = await req.json();
      const message = typeof body?.message === "string" ? body.message.trim() : "";

      if (!message) {
         throw new Error("Please enter your feedback before submitting.");
      }

      if (message.length < 5) {
         throw new Error("Please add a little more detail to your feedback.");
      }

      const { data, error } = await supabaseAdmin
         .from("user_feedback")
         .insert({
            user_id: user.id,
            message,
         })
         .select("id")
         .maybeSingle<{ id: string }>();

      if (error || !data) {
         throw new Error("Failed to submit feedback.");
      }

      return NextResponse.json({ success: true, id: data.id }, { status: 201 });
   } catch (error) {
      return jsonError(error, "Failed to submit feedback.");
   }
}
