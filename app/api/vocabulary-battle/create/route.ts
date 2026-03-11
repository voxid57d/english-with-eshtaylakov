import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BATTLE_QUESTION_COUNT,
   BATTLE_TIME_LIMIT_SECONDS,
} from "@/lib/vocabularyBattle";
import {
   buildBattleQuestions,
   cleanupBattleRooms,
   createUniqueBattleRoomCode,
   getAuthenticatedUser,
   loadPublicDeck,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      await cleanupBattleRooms();
      const { userId, username } = await getAuthenticatedUser(req);
      const body = await req.json();
      const deckId =
         typeof body?.deckId === "string" ? body.deckId.trim() : "";

      if (!deckId) {
         return NextResponse.json(
            { error: "Missing deckId." },
            { status: 400 },
         );
      }

      const deck = await loadPublicDeck(deckId);
      const questions = await buildBattleQuestions(deck.id);
      const roomCode = await createUniqueBattleRoomCode();

      const { data: room, error: roomError } = await supabaseAdmin
         .from("vocab_battle_rooms")
         .insert({
            code: roomCode,
            deck_id: deck.id,
            host_user_id: userId,
            status: "waiting",
            question_count: Math.min(questions.length, BATTLE_QUESTION_COUNT),
            time_limit_seconds: BATTLE_TIME_LIMIT_SECONDS,
            current_question_index: 0,
         })
         .select("id, code")
         .single();

      if (roomError || !room) {
         throw new Error("Failed to create room.");
      }

      const { error: playerError } = await supabaseAdmin
         .from("vocab_battle_players")
         .insert({
            room_id: room.id,
            user_id: userId,
            username,
            score: 0,
         });

      if (playerError) {
         throw new Error("Failed to add the host to the room.");
      }

      const questionRows = questions.map((question) => ({
         room_id: room.id,
         ...question,
      }));

      const { error: questionError } = await supabaseAdmin
         .from("vocab_battle_questions")
         .insert(questionRows);

      if (questionError) {
         throw new Error("Failed to save battle questions.");
      }

      return NextResponse.json({ roomCode: room.code, deckTitle: deck.title });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to create battle.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
