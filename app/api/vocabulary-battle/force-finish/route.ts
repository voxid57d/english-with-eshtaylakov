import { NextResponse } from "next/server";
import {
   buildBattleRoomSnapshot,
   forceFinishBattleRound,
   getAuthenticatedUser,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const body = await req.json();
      const roomCode =
         typeof body?.roomCode === "string" ? body.roomCode.trim() : "";

      if (!roomCode) {
         return NextResponse.json(
            { error: "Missing roomCode." },
            { status: 400 },
         );
      }

      await forceFinishBattleRound(roomCode, userId);
      const snapshot = await buildBattleRoomSnapshot(roomCode, userId);
      return NextResponse.json(snapshot);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to force-finish round.";
      const status =
         message === "Unauthorized."
            ? 401
            : message === "Room not found."
              ? 404
              : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
