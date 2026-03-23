import { NextResponse } from "next/server";
import { normalizeRoomCode } from "@/lib/vocabularyBattle";
import { checkRateLimit } from "@/lib/rateLimit";
import {
   getAuthenticatedUser,
   joinBattleRoom,
} from "@/lib/vocabularyBattleServer";

const JOIN_RATE_LIMIT = 12;
const JOIN_RATE_WINDOW_MS = 60 * 1000;

function getClientAddress(req: Request) {
   const forwardedFor = req.headers.get("x-forwarded-for");
   if (forwardedFor) {
      return forwardedFor.split(",")[0]?.trim() || "unknown";
   }

   return req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
   try {
      const { userId, username } = await getAuthenticatedUser(req);
      const clientAddress = getClientAddress(req);
      const rateLimitKey = `battle-join:${userId}:${clientAddress}`;

      if (!checkRateLimit(rateLimitKey, JOIN_RATE_LIMIT, JOIN_RATE_WINDOW_MS)) {
         return NextResponse.json(
            { error: "Too many join attempts. Please wait a minute and try again." },
            { status: 429 },
         );
      }

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
              : message.includes("expired")
                ? 409
                : 400;
      return NextResponse.json({ error: message }, { status });
   }
}
