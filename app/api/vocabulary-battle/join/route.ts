import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BATTLE_START_COUNTDOWN_SECONDS,
   normalizeRoomCode,
} from "@/lib/vocabularyBattle";
import {
   cleanupBattleRooms,
   getAuthenticatedUser,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      await cleanupBattleRooms();
      const { userId, username } = await getAuthenticatedUser(req);
      const body = await req.json();
      const roomCode =
         typeof body?.roomCode === "string" ? normalizeRoomCode(body.roomCode) : "";

      if (!roomCode) {
         return NextResponse.json(
            { error: "Missing roomCode." },
            { status: 400 },
         );
      }

      const { data: room, error: roomError } = await supabaseAdmin
         .from("vocab_battle_rooms")
         .select(
            "id, code, status, current_question_started_at, question_count, current_question_index",
         )
         .eq("code", roomCode)
         .maybeSingle();

      if (roomError || !room) {
         return NextResponse.json({ error: "Room not found." }, { status: 404 });
      }

      const { data: players, error: playersError } = await supabaseAdmin
         .from("vocab_battle_players")
         .select("user_id")
         .eq("room_id", room.id)
         .order("joined_at", { ascending: true });

      if (playersError) {
         throw new Error("Failed to load room participants.");
      }

      const participantIds = new Set((players || []).map((player) => player.user_id));
      if (participantIds.has(userId)) {
         return NextResponse.json({ roomCode: room.code });
      }

      if ((players || []).length >= 2) {
         return NextResponse.json(
            { error: "This room already has two players." },
            { status: 409 },
         );
      }

      if (room.status === "finished") {
         return NextResponse.json(
            { error: "This battle has already finished." },
            { status: 409 },
         );
      }

      const { error: joinError } = await supabaseAdmin
         .from("vocab_battle_players")
         .insert({
            room_id: room.id,
            user_id: userId,
            username,
            score: 0,
         });

      if (joinError) {
         throw new Error("Failed to join the room.");
      }

      await supabaseAdmin
         .from("vocab_battle_rooms")
         .update({
            status: "active",
            current_question_started_at: new Date(
               Date.now() + BATTLE_START_COUNTDOWN_SECONDS * 1000,
            ).toISOString(),
         })
         .eq("id", room.id);

      return NextResponse.json({ roomCode: room.code });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to join battle.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
