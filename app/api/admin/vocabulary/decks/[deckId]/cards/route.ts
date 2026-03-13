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

export async function DELETE(
   req: Request,
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;
      const { searchParams } = new URL(req.url);
      const cardId = searchParams.get("cardId")?.trim() || "";

      if (!deckId || !cardId) {
         throw new Error("Deck id and card id are required.");
      }

      const { error } = await supabaseAdmin
         .from("vocabulary_cards")
         .delete()
         .eq("id", cardId)
         .eq("deck_id", deckId);

      if (error) {
         throw new Error("Failed to delete card.");
      }

      return NextResponse.json({ success: true });
   } catch (error) {
      return jsonError(error, "Failed to delete card.");
   }
}

export async function PATCH(
   req: Request,
   context: { params: Promise<{ deckId: string }> }
) {
   try {
      await requireAdminUser(req);
      const { deckId } = await context.params;
      const { searchParams } = new URL(req.url);
      const cardId = searchParams.get("cardId")?.trim() || "";
      const body = await req.json();

      const front = typeof body?.front === "string" ? body.front.trim() : "";
      const back = typeof body?.back === "string" ? body.back.trim() : "";
      const exampleSentence =
         typeof body?.exampleSentence === "string"
            ? body.exampleSentence.trim()
            : "";
      const transcription =
         typeof body?.transcription === "string" ? body.transcription.trim() : "";

      if (!deckId || !cardId || !front || !back) {
         throw new Error("Deck id, card id, front, and back are required.");
      }

      const { data, error } = await supabaseAdmin
         .from("vocabulary_cards")
         .update({
            front,
            back,
            example_sentence: exampleSentence || null,
            transcription: transcription || null,
         })
         .eq("id", cardId)
         .eq("deck_id", deckId)
         .select("id, front, back, example_sentence, transcription")
         .single();

      if (error || !data) {
         throw new Error("Failed to update card.");
      }

      return NextResponse.json({ card: data });
   } catch (error) {
      return jsonError(error, "Failed to update card.");
   }
}
