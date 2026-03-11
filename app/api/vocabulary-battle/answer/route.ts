import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   buildBattleRoomSnapshot,
   getAuthenticatedUser,
   loadRoomForParticipant,
   reconcileBattleRoom,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const body = await req.json();

      const roomCode =
         typeof body?.roomCode === "string" ? body.roomCode.trim() : "";
      const selectedOptionIndex = Number(body?.selectedOptionIndex);

      if (!roomCode || !Number.isInteger(selectedOptionIndex)) {
         return NextResponse.json(
            { error: "Missing answer payload." },
            { status: 400 },
         );
      }

      const room = await loadRoomForParticipant(roomCode, userId);
      const activeRoom = await reconcileBattleRoom(room.code);

      if (!activeRoom || activeRoom.status !== "active") {
         return NextResponse.json(
            { error: "This battle is no longer active." },
            { status: 409 },
         );
      }

      const phaseStartedAt = activeRoom.current_question_started_at
         ? new Date(activeRoom.current_question_started_at).getTime()
         : Date.now();
      const elapsedMs = Math.max(0, Date.now() - phaseStartedAt);

      if (elapsedMs > activeRoom.time_limit_seconds * 1000) {
         const snapshot = await buildBattleRoomSnapshot(activeRoom.code, userId);
         return NextResponse.json(snapshot, { status: 409 });
      }

      const { data: question, error: questionError } = await supabaseAdmin
         .from("vocab_battle_questions")
         .select("correct_option_index")
         .eq("room_id", activeRoom.id)
         .eq("question_index", activeRoom.current_question_index)
         .single();

      if (questionError || !question) {
         throw new Error("Question not found.");
      }

      const isCorrect = selectedOptionIndex === question.correct_option_index;

      const { error: answerError } = await supabaseAdmin
         .from("vocab_battle_answers")
         .insert({
            room_id: activeRoom.id,
            question_index: activeRoom.current_question_index,
            user_id: userId,
            selected_option_index: selectedOptionIndex,
            is_correct: isCorrect,
            response_ms: elapsedMs,
         });

      if (answerError) {
         return NextResponse.json(
            { error: "You already answered this question." },
            { status: 409 },
         );
      }

      if (isCorrect) {
         const { data: player } = await supabaseAdmin
            .from("vocab_battle_players")
            .select("score")
            .eq("room_id", activeRoom.id)
            .eq("user_id", userId)
            .single();

         await supabaseAdmin
            .from("vocab_battle_players")
            .update({ score: (player?.score || 0) + 1 })
            .eq("room_id", activeRoom.id)
            .eq("user_id", userId);
      }

      const snapshot = await buildBattleRoomSnapshot(activeRoom.code, userId);
      return NextResponse.json(snapshot);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to submit answer.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
