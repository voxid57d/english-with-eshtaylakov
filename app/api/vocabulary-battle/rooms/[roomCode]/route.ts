import { NextResponse } from "next/server";
import {
   buildBattleRoomSnapshot,
   getAuthenticatedUser,
   loadRoomForParticipant,
} from "@/lib/vocabularyBattleServer";

type Context = {
   params: Promise<{ roomCode: string }>;
};

export async function GET(req: Request, context: Context) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const { roomCode } = await context.params;

      await loadRoomForParticipant(roomCode, userId);
      const snapshot = await buildBattleRoomSnapshot(roomCode, userId);

      if (!snapshot) {
         return NextResponse.json({ error: "Room not found." }, { status: 404 });
      }

      return NextResponse.json(snapshot);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to load room.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
