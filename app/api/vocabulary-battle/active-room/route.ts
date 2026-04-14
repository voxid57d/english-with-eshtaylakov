import { NextResponse } from "next/server";
import {
   getActiveBattleRoomForUser,
   getAuthenticatedUser,
} from "@/lib/vocabularyBattleServer";

export async function GET(req: Request) {
   try {
      const { userId } = await getAuthenticatedUser(req);
      const room = await getActiveBattleRoomForUser(userId);
      return NextResponse.json({ room });
   } catch (error) {
      const message =
         error instanceof Error ? error.message : "Failed to load active room.";
      const status = message === "Unauthorized." ? 401 : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
