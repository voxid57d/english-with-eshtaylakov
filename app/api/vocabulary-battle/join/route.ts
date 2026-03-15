import { NextResponse } from "next/server";
import { normalizeRoomCode } from "@/lib/vocabularyBattle";
import {
   getAuthenticatedUser,
   joinBattleRoom,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
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

      const joinedRoomCode = await joinBattleRoom(roomCode, userId, username);
      return NextResponse.json({ roomCode: joinedRoomCode });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to join battle.";
      const status =
         message === "Unauthorized."
            ? 401
            : message === "Room not found."
              ? 404
              : message === "This battle has already finished." ||
                  message === "This battle has already started."
                ? 409
                : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
