import { NextResponse } from "next/server";
import {
   buildBattleRoomSnapshot,
   getAuthenticatedUser,
   submitBattleResults,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const body = await req.json();
      const roomCode =
         typeof body?.roomCode === "string" ? body.roomCode.trim() : "";

      if (!roomCode || !Array.isArray(body?.answers)) {
         return NextResponse.json(
            { error: "Missing submission payload." },
            { status: 400 },
         );
      }

      await submitBattleResults(roomCode, userId, {
         answers: body.answers,
         totalResponseMs: Number(body?.totalResponseMs || 0),
      });

      const snapshot = await buildBattleRoomSnapshot(roomCode, userId);
      return NextResponse.json(snapshot);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to submit battle.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
