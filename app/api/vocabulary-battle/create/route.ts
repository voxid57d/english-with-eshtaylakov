import { NextResponse } from "next/server";
import {
   BATTLE_QUESTION_COUNT,
   BATTLE_TIME_LIMIT_SECONDS,
} from "@/lib/vocabularyBattle";
import {
   createBattleRoom,
   getAuthenticatedUser,
} from "@/lib/vocabularyBattleServer";

export async function POST(req: Request) {
   try {
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

      const room = await createBattleRoom(
         deckId,
         userId,
         username,
         BATTLE_QUESTION_COUNT,
         BATTLE_TIME_LIMIT_SECONDS,
      );

      return NextResponse.json(room);
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to create battle.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
