import { NextResponse } from "next/server";
import {
   BATTLE_DEFAULT_QUESTION_COUNT,
   BATTLE_TIME_LIMIT_SECONDS,
   isBattleQuestionCount,
} from "@/lib/vocabularyBattle";
import {
   createBattleRoom,
   getAuthenticatedUser,
} from "@/lib/vocabularyBattleServer";

type CreateBattleRequestBody = {
   deckId?: string;
   deckIds?: unknown[];
   questionCount?: number;
};

export async function POST(req: Request) {
   try {
      const { userId, username } = await getAuthenticatedUser(req);
      const body = (await req.json()) as CreateBattleRequestBody;
      const deckIds = Array.isArray(body?.deckIds)
         ? body.deckIds
              .filter((value): value is string => typeof value === "string")
              .map((value) => value.trim())
              .filter(Boolean)
         : typeof body?.deckId === "string" && body.deckId.trim()
           ? [body.deckId.trim()]
           : [];
      const rawQuestionCount =
         typeof body?.questionCount === "number" ? body.questionCount : null;
      const questionCount =
         rawQuestionCount && isBattleQuestionCount(rawQuestionCount)
            ? rawQuestionCount
            : BATTLE_DEFAULT_QUESTION_COUNT;

      if (deckIds.length === 0) {
         return NextResponse.json(
            { error: "Choose at least one deck." },
            { status: 400 },
         );
      }

      const room = await createBattleRoom(
         deckIds,
         userId,
         username,
         questionCount,
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
