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

export async function GET(
   req: Request,
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;

      if (!deckId) {
         throw new Error("Deck id is required.");
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_cards")
         .select("id, front, back, example_sentence, transcription")
         .eq("deck_id", deckId)
         .order("id", { ascending: true });

      if (error) {
         throw new Error("Failed to load cards.");
      }

      return NextResponse.json({ cards: data || [] });
   } catch (error) {
      return jsonError(error, "Failed to load cards.");
   }
}

export async function POST(
   req: Request,
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;
      const body = await req.json();

      const front = typeof body?.front === "string" ? body.front.trim() : "";
      const back = typeof body?.back === "string" ? body.back.trim() : "";
      const exampleSentence =
         typeof body?.exampleSentence === "string"
            ? body.exampleSentence.trim()
            : "";
      const transcription =
         typeof body?.transcription === "string" ? body.transcription.trim() : "";

      if (!deckId || !front || !back) {
         throw new Error("Deck id, front, and back are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_cards")
         .insert({
            deck_id: deckId,
            front,
            back,
            example_sentence: exampleSentence || null,
            transcription: transcription || null,
         })
         .select("id, front, back, example_sentence, transcription")
         .single();

      if (error || !data) {
         throw new Error("Failed to create card.");
      }

      return NextResponse.json({ card: data }, { status: 201 });
   } catch (error) {
      return jsonError(error, "Failed to create card.");
   }
}
