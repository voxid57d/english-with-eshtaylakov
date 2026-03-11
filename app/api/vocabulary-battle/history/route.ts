import { NextResponse } from "next/server";
import {
   getAuthenticatedUser,
   getBattleHistoryForUser,
} from "@/lib/vocabularyBattleServer";

export async function GET(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const entries = await getBattleHistoryForUser(userId);
      return NextResponse.json({ entries });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to load battle history.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
