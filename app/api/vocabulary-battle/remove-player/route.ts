import { NextResponse } from "next/server";
import {
   buildBattleRoomSnapshot,
   getAuthenticatedUser,
   removePlayerFromBattleRoom,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const body = await req.json();
      const roomCode =
         typeof body?.roomCode === "string" ? body.roomCode.trim() : "";
      const targetUserId =
         typeof body?.targetUserId === "string" ? body.targetUserId.trim() : "";

      if (!roomCode || !targetUserId) {
         return NextResponse.json(
            { error: "Missing player removal payload." },
            { status: 400 },
         );
      }

      await removePlayerFromBattleRoom(roomCode, userId, targetUserId);
      const snapshot = await buildBattleRoomSnapshot(roomCode, userId);
      return NextResponse.json(snapshot);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to remove player.";
      const status =
         message === "Unauthorized."
            ? 401
            : message === "Room not found."
              ? 404
              : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
