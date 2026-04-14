import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BATTLE_FREE_ROUNDS_PER_ROOM,
   BATTLE_MINIMUM_CARD_COUNT,
   BATTLE_READY_COUNTDOWN_SECONDS,
   BattleHistoryEntry,
   BattleQuestionCount,
   BattleQuestionPayload,
   BattleQuestionReview,
   BattleRoomPlayerSnapshot,
   BattleRoomSnapshot,
   BattleRoundPlayerSnapshot,
   BattleRoundRewardSnapshot,
   BattleRoundSnapshot,
   BattleSubmissionAnswer,
   createRoomCode,
   normalizeRoomCode,
   shuffleArray,
} from "@/lib/vocabularyBattle";

type DeckRow = {
   id: string;
   title: string;
   is_public: boolean;
   folder_id: string | null;
};

type CardRow = {
   id: string;
   deck_id?: string;
   front: string;
   back: string;
};

type RoomRow = {
   id: string;
   code: string;
   host_user_id: string;
   deck_id: string;
   deck_ids: string[] | null;
   deck_title: string | null;
   status: "open" | "expired";
   question_count: number;
   time_limit_seconds: number;
   completed_round_count: number | null;
   expires_at: string | null;
   expiration_reason: string | null;
   created_at: string;
};

type RoomPlayerRow = {
   room_id?: string;
   user_id: string;
   username: string | null;
   joined_at: string;
};

type RoundRow = {
   id: string;
   room_id: string;
   round_number: number;
   status: "waiting" | "active" | "finished";
   deck_id: string;
   deck_ids: string[] | null;
   deck_title: string | null;
   question_count: number;
   time_limit_seconds: number;
   battle_starts_at: string | null;
   winner_user_id: string | null;
   created_at: string;
   finished_at: string | null;
};

type RoundPlayerRow = {
   round_id?: string;
   user_id: string;
   username: string | null;
   score: number | null;
   joined_at: string;
   total_response_ms: number | null;
   is_ready: boolean | null;
   ready_at: string | null;
   submitted_at: string | null;
};

type ProfilePremiumRow = {
   id: string;
   is_premium: boolean | null;
};

type QuestionRow = {
   round_id?: string;
   question_index: number;
   prompt: string;
   options: string[];
   correct_option_index: number;
};

type AnswerRow = {
   round_id?: string;
   question_index: number;
   user_id: string;
   selected_option_index: number | null;
   is_correct: boolean;
   response_ms: number | null;
};

type FolderBattleAccessRow = {
   id: string;
   is_available_for_battle: boolean | null;
};

type ActiveBattleRoomSummary = {
   roomCode: string;
   deckTitle: string;
   playerCount: number;
   currentRoundStatus: "waiting" | "active" | "finished" | null;
   roundNumber: number | null;
};

const WAITING_ROUND_TTL_HOURS = 6;
const ACTIVE_ROUND_TTL_HOURS = 2;
const ROOM_MAX_AGE_HOURS = 12;
const EXPIRED_ROOM_TTL_HOURS = 24;
const CURIOSITY_POINT_REWARDS = [20, 10] as const;
const NON_PREMIUM_ROOM_EXPIRATION_REASON =
   "This room reached 5 rounds. Premium is required for every player to continue. Upgrade to Premium or create a new room.";
const ROOM_MAX_AGE_EXPIRATION_REASON =
   "This room expired after 12 hours. Create a new room to continue playing.";
const ROOM_SELECT =
   "id, code, host_user_id, deck_id, deck_ids, deck_title, status, question_count, time_limit_seconds, completed_round_count, expires_at, expiration_reason, created_at";
const ROUND_SELECT =
   "id, room_id, round_number, status, deck_id, deck_ids, deck_title, question_count, time_limit_seconds, battle_starts_at, winner_user_id, created_at, finished_at";

export async function getAuthenticatedUser(req: Request) {
   const authHeader = req.headers.get("authorization");
   const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

   if (!token) {
      throw new Error("Missing bearer token.");
   }

   const { data, error } = await supabaseAdmin.auth.getUser(token);
   if (error || !data.user) {
      throw new Error("Unauthorized.");
   }

   const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", data.user.id)
      .maybeSingle();

   return {
      userId: data.user.id,
      username:
         typeof profile?.username === "string" && profile.username.trim()
            ? profile.username.trim()
            : "Player",
   };
}

export async function createUniqueBattleRoomCode() {
   for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = createRoomCode();
      const { data } = await supabaseAdmin
         .from("vocab_battle_rooms")
         .select("id")
         .eq("code", code)
         .maybeSingle();

      if (!data) {
         return code;
      }
   }

   throw new Error("Failed to generate a unique room code.");
}

function getDeckIds(deckId: string, deckIds: string[] | null) {
   return deckIds?.length ? deckIds : [deckId];
}

function formatBattleDeckTitle(decks: DeckRow[]) {
   if (decks.length === 1) {
      return decks[0].title;
   }

   if (decks.length === 2) {
      return `${decks[0].title} + ${decks[1].title}`;
   }

   return `${decks[0].title} + ${decks[1].title} + ${decks.length - 2} more`;
}

function getCuriosityRewards(
   players: BattleRoundPlayerSnapshot[],
   winnerUserId: string | null,
): BattleRoundRewardSnapshot[] {
   if (!winnerUserId) {
      return [];
   }

   return players
      .slice(0, CURIOSITY_POINT_REWARDS.length)
      .map((player, index) => ({
         userId: player.userId,
         curiosityPoints: CURIOSITY_POINT_REWARDS[index],
         place: index + 1,
      }));
}

function mapQuestionBank(questions: QuestionRow[]): BattleQuestionPayload[] {
   return questions.map((question) => ({
      questionIndex: question.question_index,
      prompt: question.prompt,
      options: question.options,
   }));
}

function buildQuestionReviews(
   questions: QuestionRow[],
   answers: AnswerRow[],
): BattleQuestionReview[] {
   const answerMap = new Map<number, AnswerRow[]>();

   answers.forEach((answer) => {
      const existing = answerMap.get(answer.question_index) || [];
      existing.push(answer);
      answerMap.set(answer.question_index, existing);
   });

   return questions.map((question) => ({
      questionIndex: question.question_index,
      prompt: question.prompt,
      options: question.options,
      correctOptionIndex: question.correct_option_index,
      answers: (answerMap.get(question.question_index) || []).map((answer) => ({
         userId: answer.user_id,
         selectedOptionIndex: answer.selected_option_index,
         isCorrect: answer.is_correct,
         responseMs: answer.response_ms || 0,
      })),
   }));
}

function sortRoundPlayersForWinner(players: RoundPlayerRow[]) {
   return [...players].sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const timeDiff = (a.total_response_ms || 0) - (b.total_response_ms || 0);
      if (timeDiff !== 0) return timeDiff;

      return a.joined_at.localeCompare(b.joined_at);
   });
}

function mapRoomPlayerSnapshots(
   players: RoomPlayerRow[],
   premiumMap: Map<string, boolean>,
): BattleRoomPlayerSnapshot[] {
   return players.map((player) => ({
      userId: player.user_id,
      username: player.username?.trim() || "Player",
      isPremium: premiumMap.get(player.user_id) === true,
      joinedAt: player.joined_at,
   }));
}

function mapRoundPlayerSnapshots(
   players: RoundPlayerRow[],
   premiumMap: Map<string, boolean>,
): BattleRoundPlayerSnapshot[] {
   return players
      .map((player) => ({
         userId: player.user_id,
         username: player.username?.trim() || "Player",
         isPremium: premiumMap.get(player.user_id) === true,
         score: player.score ?? 0,
         joinedAt: player.joined_at,
         totalResponseMs: player.total_response_ms ?? 0,
         isReady: player.is_ready === true,
         readyAt: player.ready_at,
         submittedAt: player.submitted_at,
      }))
      .sort((a, b) => {
         if (b.score !== a.score) return b.score - a.score;
         if (a.totalResponseMs !== b.totalResponseMs) {
            return a.totalResponseMs - b.totalResponseMs;
         }
         return a.joinedAt.localeCompare(b.joinedAt);
      });
}

async function getPremiumMap(userIds: string[]) {
   const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

   if (uniqueUserIds.length === 0) {
      return new Map<string, boolean>();
   }

   const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, is_premium")
      .in("id", uniqueUserIds);

   if (error) {
      throw new Error("Failed to load player premium status.");
   }

   return new Map(
      ((data || []) as ProfilePremiumRow[]).map((profile) => [
         profile.id,
         profile.is_premium === true,
      ]),
   );
}

async function getRoomByCode(roomCode: string) {
   const normalizedCode = normalizeRoomCode(roomCode);
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select(ROOM_SELECT)
      .eq("code", normalizedCode)
      .maybeSingle();

   if (error || !data) {
      return null;
   }

   return data as RoomRow;
}

async function getRoomById(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select(ROOM_SELECT)
      .eq("id", roomId)
      .maybeSingle();

   if (error || !data) {
      return null;
   }

   return data as RoomRow;
}

async function getRoomMembers(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .select("room_id, user_id, username, joined_at")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

   if (error) {
      throw new Error("Failed to load room players.");
   }

   return (data || []) as RoomPlayerRow[];
}

async function getLatestRoundForRoom(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select(ROUND_SELECT)
      .eq("room_id", roomId)
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

   if (error || !data) {
      return null;
   }

   return data as RoundRow;
}

async function getUnfinishedRoundForRoom(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select(ROUND_SELECT)
      .eq("room_id", roomId)
      .in("status", ["waiting", "active"])
      .order("round_number", { ascending: false })
      .limit(1)
      .maybeSingle();

   if (error || !data) {
      return null;
   }

   return data as RoundRow;
}

async function getFinishedRoundsForRoom(roomId: string, limit: number) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select(ROUND_SELECT)
      .eq("room_id", roomId)
      .eq("status", "finished")
      .order("round_number", { ascending: false })
      .limit(limit);

   if (error) {
      throw new Error("Failed to load room rounds.");
   }

   return (data || []) as RoundRow[];
}

async function getRoundById(roundId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select(ROUND_SELECT)
      .eq("id", roundId)
      .maybeSingle();

   if (error || !data) {
      return null;
   }

   return data as RoundRow;
}

async function getRoundPlayers(roundId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .select(
         "round_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
      )
      .eq("round_id", roundId)
      .order("joined_at", { ascending: true });

   if (error) {
      throw new Error("Failed to load round players.");
   }

   return (data || []) as RoundPlayerRow[];
}

async function getRoundQuestions(roundId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_round_questions")
      .select("round_id, question_index, prompt, options, correct_option_index")
      .eq("round_id", roundId)
      .order("question_index", { ascending: true });

   if (error) {
      throw new Error("Failed to load round questions.");
   }

   return (data || []) as QuestionRow[];
}

async function getRoundAnswers(roundId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_round_answers")
      .select(
         "round_id, question_index, user_id, selected_option_index, is_correct, response_ms",
      )
      .eq("round_id", roundId)
      .order("question_index", { ascending: true });

   if (error) {
      throw new Error("Failed to load round answers.");
   }

   return (data || []) as AnswerRow[];
}

async function awardCuriosityPoints(players: RoundPlayerRow[]) {
   const rewardedPlayers = players
      .slice(0, CURIOSITY_POINT_REWARDS.length)
      .map((player, index) => ({
         userId: player.user_id,
         reward: CURIOSITY_POINT_REWARDS[index],
      }));

   if (rewardedPlayers.length === 0) {
      return;
   }

   const userIds = rewardedPlayers.map((player) => player.userId);
   const { data: existingStats, error: statsError } = await supabaseAdmin
      .from("user_stats")
      .select("user_id, curiosity_points")
      .in("user_id", userIds);

   if (statsError) {
      console.error("Curiosity points stats lookup failed:", statsError);
      throw new Error("Failed to award curiosity points.");
   }

   const currentPointsByUser = new Map(
      (existingStats || []).map((row) => [
         row.user_id as string,
         Number(row.curiosity_points || 0),
      ]),
   );

   for (const player of rewardedPlayers) {
      const nextPoints =
         (currentPointsByUser.get(player.userId) || 0) + player.reward;

      if (currentPointsByUser.has(player.userId)) {
         const { error: updateError } = await supabaseAdmin
            .from("user_stats")
            .update({
               curiosity_points: nextPoints,
            })
            .eq("user_id", player.userId);

         if (updateError) {
            console.error("Curiosity points update failed:", updateError, {
               userId: player.userId,
               nextPoints,
            });
            throw new Error("Failed to award curiosity points.");
         }

         continue;
      }

      const { error: insertError } = await supabaseAdmin
         .from("user_stats")
         .insert({
            user_id: player.userId,
            streak: 0,
            last_active_date: null,
            curiosity_points: nextPoints,
         });

      if (insertError) {
         console.error("Curiosity points insert failed:", insertError, {
            userId: player.userId,
            nextPoints,
         });
         throw new Error("Failed to award curiosity points.");
      }
   }
}

async function expireRoom(roomId: string, reason: string) {
   const nowIso = new Date().toISOString();
   const { error } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .update({
         status: "expired",
         expires_at: nowIso,
         expiration_reason: reason,
      })
      .eq("id", roomId)
      .neq("status", "expired");

   if (error) {
      throw new Error("Failed to expire room.");
   }
}

async function enforceRoomMaxAgeExpiration(roomId: string) {
   const room = await getRoomById(roomId);
   if (!room || room.status === "expired") {
      return room;
   }

   const roomAgeMs = Date.now() - new Date(room.created_at).getTime();
   if (roomAgeMs < ROOM_MAX_AGE_HOURS * 60 * 60 * 1000) {
      return room;
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (currentRound?.status === "active") {
      await finalizeRound(currentRound.id);
   }

   await expireRoom(room.id, ROOM_MAX_AGE_EXPIRATION_REASON);
   return getRoomById(room.id);
}

async function enforceRoomExpirationAfterPremiumCheck(roomId: string) {
   const room = await enforceRoomMaxAgeExpiration(roomId);
   if (!room || room.status === "expired") {
      return room;
   }

   const completedRoundCount = room.completed_round_count ?? 0;
   if (completedRoundCount < BATTLE_FREE_ROUNDS_PER_ROOM) {
      return room;
   }

   const unfinishedRound = await getUnfinishedRoundForRoom(roomId);
   if (unfinishedRound) {
      return room;
   }

   const members = await getRoomMembers(roomId);
   const premiumMap = await getPremiumMap(members.map((player) => player.user_id));
   const hasNonPremiumPlayer = members.some(
      (player) => premiumMap.get(player.user_id) !== true,
   );

   if (!hasNonPremiumPlayer) {
      return room;
   }

   await expireRoom(roomId, NON_PREMIUM_ROOM_EXPIRATION_REASON);
   return getRoomById(roomId);
}

async function finalizeRound(roundId: string) {
   const round = await getRoundById(roundId);
   if (!round) {
      throw new Error("Round not found.");
   }

   if (round.status === "finished") {
      return round;
   }

   const players = await getRoundPlayers(roundId);
   const ranked = sortRoundPlayersForWinner(players);
   const top = ranked[0];
   const isTie =
      ranked.length > 1 &&
      (ranked[1].score || 0) === (top?.score || 0) &&
      (ranked[1].total_response_ms || 0) === (top?.total_response_ms || 0);
   const winnerUserId = top && !isTie ? top.user_id : null;

   if (!isTie) {
      await awardCuriosityPoints(ranked);
   }

   const finishedAt = new Date().toISOString();
   const { data: finalizedRound, error: finalizeError } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .update({
         status: "finished",
         winner_user_id: winnerUserId,
         finished_at: finishedAt,
      })
      .eq("id", roundId)
      .neq("status", "finished")
      .select("id, room_id")
      .maybeSingle();

   if (finalizeError) {
      console.error("Battle round finalize failed:", finalizeError, { roundId });
      throw new Error("Failed to finalize battle round.");
   }

   if (finalizedRound?.room_id) {
      const room = await getRoomById(finalizedRound.room_id as string);
      if (room) {
         const { error: roomError } = await supabaseAdmin
            .from("vocab_battle_rooms")
            .update({
               completed_round_count: (room.completed_round_count ?? 0) + 1,
            })
            .eq("id", room.id);

         if (roomError) {
            throw new Error("Failed to update room progress.");
         }
      }

      await enforceRoomExpirationAfterPremiumCheck(finalizedRound.room_id as string);
   }

   return getRoundById(roundId);
}

async function deleteRoom(roomId: string) {
   await supabaseAdmin.from("vocab_battle_rooms").delete().eq("id", roomId);
}

export async function cleanupBattleRooms() {
   const now = Date.now();
   const activeCutoff = new Date(
      now - ACTIVE_ROUND_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();
   const waitingCutoff = new Date(
      now - WAITING_ROUND_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();
   const expiredCutoff = new Date(
      now - EXPIRED_ROOM_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();
   const roomMaxAgeCutoff = new Date(
      now - ROOM_MAX_AGE_HOURS * 60 * 60 * 1000,
   ).toISOString();

   const { data: staleActiveRounds } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select("id")
      .eq("status", "active")
      .lt("battle_starts_at", activeCutoff)
      .is("finished_at", null);

   for (const round of staleActiveRounds || []) {
      await finalizeRound(round.id as string);
   }

   const { data: staleWaitingRounds } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .select("id, room_id")
      .eq("status", "waiting")
      .lt("created_at", waitingCutoff);

   for (const round of staleWaitingRounds || []) {
      await expireRoom(
         round.room_id as string,
         "This room expired because the next round did not start in time.",
      );
   }

   const { data: staleRooms } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select("id")
      .eq("status", "open")
      .lt("created_at", roomMaxAgeCutoff);

   for (const room of staleRooms || []) {
      await enforceRoomMaxAgeExpiration(room.id as string);
   }

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .delete()
      .eq("status", "expired")
      .lt("expires_at", expiredCutoff);
}

export async function loadBattleDecks(deckIds: string[]) {
   const uniqueDeckIds = Array.from(
      new Set(deckIds.map((deckId) => deckId.trim()).filter(Boolean)),
   );

   if (uniqueDeckIds.length === 0) {
      throw new Error("Choose at least one deck.");
   }

   const { data, error } = await supabaseAdmin
      .from("vocabulary_decks")
      .select("id, title, is_public, folder_id")
      .in("id", uniqueDeckIds);

   if (error) {
      throw new Error("Failed to load selected decks.");
   }

   const decks = (data || []) as DeckRow[];
   if (decks.length !== uniqueDeckIds.length) {
      throw new Error("One or more selected decks were not found.");
   }

   const deckMap = new Map(decks.map((deck) => [deck.id, deck]));
   const orderedDecks = uniqueDeckIds.map((deckId) => deckMap.get(deckId)!);
   const folderIds = Array.from(
      new Set(
         orderedDecks
            .map((deck) => deck.folder_id)
            .filter((folderId): folderId is string => Boolean(folderId)),
      ),
   );

   const { data: folderRows, error: folderError } = await supabaseAdmin
      .from("vocabulary_folders")
      .select("id, is_available_for_battle")
      .in("id", folderIds);

   if (folderError) {
      throw new Error("Failed to load battle folder settings.");
   }

   const folderMap = new Map(
      ((folderRows || []) as FolderBattleAccessRow[]).map((folder) => [
         folder.id,
         folder.is_available_for_battle === true,
      ]),
   );

   for (const deck of orderedDecks) {
      if (!deck.is_public) {
         throw new Error("Only public decks can be used in battle mode.");
      }

      if (!deck.folder_id) {
         throw new Error("Battle mode only supports decks inside folders.");
      }

      if (!folderMap.get(deck.folder_id)) {
         throw new Error("One or more selected folders are not available for battle.");
      }
   }

   return orderedDecks;
}

export async function buildBattleQuestions(
   deckIds: string[],
   questionCount: BattleQuestionCount,
) {
   const { data, error } = await supabaseAdmin
      .from("vocabulary_cards")
      .select("id, deck_id, front, back")
      .in("deck_id", deckIds);

   if (error) {
      throw new Error("Failed to load selected deck cards.");
   }

   const cards = ((data || []) as CardRow[]).filter(
      (card) => card.front?.trim() && card.back?.trim(),
   );

   if (cards.length < BATTLE_MINIMUM_CARD_COUNT) {
      throw new Error(
         `Selected decks need at least ${BATTLE_MINIMUM_CARD_COUNT} usable cards.`,
      );
   }

   if (cards.length < questionCount) {
      throw new Error(
         `Selected decks need at least ${questionCount} usable cards for this battle length.`,
      );
   }

   const selectedCards = shuffleArray(cards).slice(0, questionCount);

   return selectedCards.map((card, questionIndex) => {
      const distractorPool = shuffleArray(
         cards.filter(
            (candidate) =>
               candidate.id !== card.id &&
               candidate.back.trim().toLowerCase() !==
                  card.back.trim().toLowerCase(),
         ),
      );

      if (distractorPool.length < 3) {
         throw new Error("Deck does not have enough distinct meanings.");
      }

      const options = shuffleArray([
         card.back,
         ...distractorPool.slice(0, 3).map((candidate) => candidate.back),
      ]);

      return {
         question_index: questionIndex,
         card_id: card.id,
         prompt: card.front,
         options,
         correct_option_index: options.findIndex(
            (option) => option === card.back,
         ),
      };
   });
}

async function addUserToRoomIfNeeded(roomId: string, userId: string, username: string) {
   const { data: existingMember } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .select("user_id")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

   if (!existingMember) {
      const { error } = await supabaseAdmin
         .from("vocab_battle_room_players")
         .insert({
            room_id: roomId,
            user_id: userId,
            username,
         });

      if (error) {
         throw new Error("Failed to join the room.");
      }
   }
}

async function addUserToWaitingRoundIfNeeded(
   roundId: string,
   userId: string,
   username: string,
) {
   const { data: existingPlayer } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .select("user_id")
      .eq("round_id", roundId)
      .eq("user_id", userId)
      .maybeSingle();

   if (!existingPlayer) {
      const { error } = await supabaseAdmin
         .from("vocab_battle_round_players")
         .insert({
            round_id: roundId,
            user_id: userId,
            username,
            score: 0,
            total_response_ms: 0,
            is_ready: false,
         });

      if (error) {
         throw new Error("Failed to join the current round.");
      }
   }
}

async function createRoundForRoom(room: RoomRow, roundNumber: number) {
   return createRoundForRoomWithDecks(
      room,
      roundNumber,
      getDeckIds(room.deck_id, room.deck_ids),
      room.deck_title || "Battle deck",
      room.deck_id,
   );
}

async function createRoundForRoomWithDecks(
   room: RoomRow,
   roundNumber: number,
   deckIds: string[],
   deckTitle: string,
   primaryDeckId: string,
) {
   const unfinishedRound = await getUnfinishedRoundForRoom(room.id);
   if (unfinishedRound) {
      throw new Error("A round is already in progress for this room.");
   }

   const questions = await buildBattleQuestions(
      deckIds,
      room.question_count as BattleQuestionCount,
   );

   const { data: createdRound, error: roundError } = await supabaseAdmin
      .from("vocab_battle_rounds")
      .insert({
         room_id: room.id,
         round_number: roundNumber,
         status: "waiting",
         deck_id: primaryDeckId,
         deck_ids: deckIds,
         deck_title: deckTitle,
         question_count: room.question_count,
         time_limit_seconds: room.time_limit_seconds,
      })
      .select("id")
      .single();

   if (roundError || !createdRound) {
      throw new Error("Failed to create battle round.");
   }

   const members = await getRoomMembers(room.id);
   if (members.length === 0) {
      await supabaseAdmin
         .from("vocab_battle_rounds")
         .delete()
         .eq("id", createdRound.id);
      throw new Error("A room needs at least one player.");
   }

   const { error: roundPlayersError } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .insert(
         members.map((player) => ({
            round_id: createdRound.id,
            user_id: player.user_id,
            username: player.username,
            score: 0,
            total_response_ms: 0,
            is_ready: false,
         })),
      );

   if (roundPlayersError) {
      await supabaseAdmin
         .from("vocab_battle_rounds")
         .delete()
         .eq("id", createdRound.id);
      throw new Error("Failed to add players to the battle round.");
   }

   const { error: questionError } = await supabaseAdmin
      .from("vocab_battle_round_questions")
      .insert(
         questions.map((question) => ({
            round_id: createdRound.id,
            ...question,
         })),
      );

   if (questionError) {
      await supabaseAdmin
         .from("vocab_battle_rounds")
         .delete()
         .eq("id", createdRound.id);
      throw new Error("Failed to save battle questions.");
   }

   return createdRound.id as string;
}

async function buildRoundSnapshot(
   round: RoundRow,
   viewerUserId: string,
): Promise<BattleRoundSnapshot> {
   const [players, questions, answers] = await Promise.all([
      getRoundPlayers(round.id),
      getRoundQuestions(round.id),
      round.status === "finished" ? getRoundAnswers(round.id) : Promise.resolve([]),
   ]);
   const premiumMap = await getPremiumMap(players.map((player) => player.user_id));
   const viewer = players.find((player) => player.user_id === viewerUserId);
   const roundPlayers = mapRoundPlayerSnapshots(players, premiumMap);
   const rewards = getCuriosityRewards(roundPlayers, round.winner_user_id);

   return {
      roundId: round.id,
      roundNumber: round.round_number,
      status: round.status,
      deckId: round.deck_id,
      deckIds: getDeckIds(round.deck_id, round.deck_ids),
      deckTitle: round.deck_title || "Battle deck",
      questionCount: round.question_count,
      timeLimitSeconds: round.time_limit_seconds,
      battleStartsAt: round.battle_starts_at,
      winnerUserId: round.winner_user_id,
      createdAt: round.created_at,
      finishedAt: round.finished_at,
      viewerReady: viewer?.is_ready === true,
      viewerSubmitted: Boolean(viewer?.submitted_at),
      viewerIsParticipant: Boolean(viewer),
      players: roundPlayers,
      questionBank: mapQuestionBank(questions),
      completedQuestions:
         round.status === "finished" ? buildQuestionReviews(questions, answers) : [],
      rewards,
   };
}

async function mapRoundsToHistoryEntries(
   roomCode: string,
   roomStatus: "open" | "expired",
   rounds: RoundRow[],
): Promise<BattleHistoryEntry[]> {
   const roundIds = rounds.map((round) => round.id);
   if (roundIds.length === 0) {
      return [];
   }

   const [roundPlayersResult, premiumMap] = await Promise.all([
      supabaseAdmin
         .from("vocab_battle_round_players")
         .select(
            "round_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
         )
         .in("round_id", roundIds)
         .order("joined_at", { ascending: true }),
      (async () => {
         const { data } = await supabaseAdmin
            .from("vocab_battle_round_players")
            .select("user_id")
            .in("round_id", roundIds);

         const userIds = (data || []).map((row) => row.user_id as string);
         return getPremiumMap(userIds);
      })(),
   ]);

   if (roundPlayersResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const playersByRound = new Map<string, RoundPlayerRow[]>();
   ((roundPlayersResult.data || []) as RoundPlayerRow[]).forEach((player) => {
      const roundId = player.round_id as string;
      const existing = playersByRound.get(roundId) || [];
      existing.push(player);
      playersByRound.set(roundId, existing);
   });

   return rounds.map((round) => {
      const roundPlayers = mapRoundPlayerSnapshots(
         playersByRound.get(round.id) || [],
         premiumMap,
      );

      return {
         roundId: round.id,
         roundNumber: round.round_number,
         roomCode,
         deckTitle: round.deck_title || "Battle deck",
         roomStatus,
         status: round.status,
         createdAt: round.created_at,
         finishedAt: round.finished_at,
         winnerUserId: round.winner_user_id,
         questionCount: round.question_count,
         players: roundPlayers,
         rewards: getCuriosityRewards(roundPlayers, round.winner_user_id),
      };
   });
}

export async function loadRoomForParticipant(roomCode: string, userId: string) {
   const room = await getRoomByCode(roomCode);
   if (!room) {
      throw new Error("Room not found.");
   }

   const { data } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .select("user_id")
      .eq("room_id", room.id)
      .eq("user_id", userId)
      .maybeSingle();

   if (!data) {
      throw new Error("You are not a participant in this room.");
   }

   return room;
}

export async function buildBattleRoomSnapshot(
   roomCode: string,
   viewerUserId: string,
): Promise<BattleRoomSnapshot | null> {
   let room = await getRoomByCode(roomCode);
   if (!room) {
      return null;
   }

   room = (await enforceRoomExpirationAfterPremiumCheck(room.id)) || room;

   const [members, latestRound, recentFinishedRounds] = await Promise.all([
      getRoomMembers(room.id),
      getLatestRoundForRoom(room.id),
      getFinishedRoundsForRoom(room.id, 5),
   ]);
   const premiumMap = await getPremiumMap(members.map((player) => player.user_id));
   const memberSnapshots = mapRoomPlayerSnapshots(members, premiumMap);
   const viewerIsRoomMember = members.some((player) => player.user_id === viewerUserId);
   const currentRound = latestRound
      ? await buildRoundSnapshot(latestRound, viewerUserId)
      : null;
   const recentRounds = await mapRoundsToHistoryEntries(
      room.code,
      room.status,
      recentFinishedRounds,
   );

   return {
      roomId: room.id,
      roomCode: room.code,
      roomStatus: room.status,
      hostUserId: room.host_user_id,
      deckId: room.deck_id,
      deckIds: getDeckIds(room.deck_id, room.deck_ids),
      deckTitle: room.deck_title || "Battle deck",
      questionCount: room.question_count,
      timeLimitSeconds: room.time_limit_seconds,
      createdAt: room.created_at,
      completedRoundCount: room.completed_round_count ?? 0,
      expiresAt: room.expires_at,
      expirationReason: room.expiration_reason,
      viewerUserId,
      viewerIsHost: room.host_user_id === viewerUserId,
      viewerIsRoomMember,
      players: memberSnapshots,
      currentRound,
      recentRounds,
   };
}

export async function markPlayerReady(
   roomCode: string,
   userId: string,
   username?: string,
) {
   const room = await loadRoomForParticipant(roomCode, userId);

   if (room.status === "expired") {
      throw new Error(
         room.expiration_reason || "This room has expired. Create a new room to continue.",
      );
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (!currentRound) {
      throw new Error("There is no round in this room.");
   }

   if (currentRound.status !== "waiting") {
      throw new Error("This round has already started.");
   }

   await addUserToWaitingRoundIfNeeded(
      currentRound.id,
      userId,
      username || "Player",
   );

   const { error } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .update({
         is_ready: true,
         ready_at: new Date().toISOString(),
      })
      .eq("round_id", currentRound.id)
      .eq("user_id", userId);

   if (error) {
      throw new Error("Failed to update ready state.");
   }

   const players = await getRoundPlayers(currentRound.id);
   const everyoneReady =
      players.length >= 2 && players.every((player) => player.is_ready === true);

   if (everyoneReady && !currentRound.battle_starts_at) {
      const { error: roundError } = await supabaseAdmin
         .from("vocab_battle_rounds")
         .update({
            status: "active",
            battle_starts_at: new Date(
               Date.now() + BATTLE_READY_COUNTDOWN_SECONDS * 1000,
            ).toISOString(),
         })
         .eq("id", currentRound.id)
         .eq("status", "waiting");

      if (roundError) {
         throw new Error("Failed to start the round.");
      }
   }
}

export async function joinBattleRoom(
   roomCode: string,
   userId: string,
   username: string,
) {
   await cleanupBattleRooms();

   let room = await getRoomByCode(roomCode);
   if (!room) {
      throw new Error("Room not found.");
   }

   if (room.status === "expired") {
      throw new Error(
         room.expiration_reason || "This room has expired. Create a new room to continue.",
      );
   }

   await addUserToRoomIfNeeded(room.id, userId, username);
   room = (await enforceRoomExpirationAfterPremiumCheck(room.id)) || room;

   if (room.status === "expired") {
      throw new Error(
         room.expiration_reason || "This room has expired. Create a new room to continue.",
      );
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (currentRound?.status === "waiting") {
      await addUserToWaitingRoundIfNeeded(currentRound.id, userId, username);
   }

   return room.code;
}

export async function submitBattleResults(
   roomCode: string,
   userId: string,
   submission: {
      answers: BattleSubmissionAnswer[];
      totalResponseMs: number;
   },
) {
   const room = await loadRoomForParticipant(roomCode, userId);
   const currentRound = await getLatestRoundForRoom(room.id);

   if (!currentRound) {
      throw new Error("There is no round in this room.");
   }

   if (currentRound.status === "finished") {
      return currentRound;
   }

   if (currentRound.status !== "active") {
      throw new Error("The round has not started yet.");
   }

   const players = await getRoundPlayers(currentRound.id);
   const player = players.find((entry) => entry.user_id === userId);

   if (!player) {
      throw new Error("You are waiting for the next round.");
   }

   if (player.submitted_at) {
      return currentRound;
   }

   const battleStartsAt = currentRound.battle_starts_at
      ? new Date(currentRound.battle_starts_at).getTime()
      : 0;

   if (!battleStartsAt || battleStartsAt > Date.now()) {
      throw new Error("The round has not started yet.");
   }

   const questions = await getRoundQuestions(currentRound.id);
   const answerMap = new Map<number, BattleSubmissionAnswer>();

   submission.answers.forEach((answer) => {
      if (!answerMap.has(answer.questionIndex)) {
         answerMap.set(answer.questionIndex, answer);
      }
   });

   const normalizedAnswers = questions.map((question) => {
      const clientAnswer = answerMap.get(question.question_index);
      const selectedOptionIndex =
         clientAnswer &&
         Number.isInteger(clientAnswer.selectedOptionIndex) &&
         (clientAnswer.selectedOptionIndex as number) >= 0 &&
         (clientAnswer.selectedOptionIndex as number) <= 3
            ? (clientAnswer.selectedOptionIndex as number)
            : null;
      const responseMs = Math.min(
         Math.max(
            Math.round(
               clientAnswer?.responseMs ||
                  currentRound.time_limit_seconds * 1000,
            ),
            0,
         ),
         currentRound.time_limit_seconds * 1000,
      );
      const isCorrect = selectedOptionIndex === question.correct_option_index;

      return {
         round_id: currentRound.id,
         question_index: question.question_index,
         user_id: userId,
         selected_option_index: selectedOptionIndex,
         is_correct: isCorrect,
         response_ms: responseMs,
      };
   });

   const score = normalizedAnswers.filter((answer) => answer.is_correct).length;
   const totalResponseMs = normalizedAnswers.reduce(
      (sum, answer) => sum + answer.response_ms,
      0,
   );

   const { error: answersError } = await supabaseAdmin
      .from("vocab_battle_round_answers")
      .upsert(normalizedAnswers, {
         onConflict: "round_id,question_index,user_id",
      });

   if (answersError) {
      throw new Error("Failed to save battle answers.");
   }

   const { error: playerError } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .update({
         score,
         total_response_ms: totalResponseMs,
         submitted_at: new Date().toISOString(),
      })
      .eq("round_id", currentRound.id)
      .eq("user_id", userId);

   if (playerError) {
      throw new Error("Failed to save battle result.");
   }

   const refreshedPlayers = await getRoundPlayers(currentRound.id);
   const everyoneSubmitted =
      refreshedPlayers.length >= 2 &&
      refreshedPlayers.every((entry) => Boolean(entry.submitted_at));

   if (everyoneSubmitted) {
      await finalizeRound(currentRound.id);
   }

   return currentRound;
}

export async function getBattleHistoryForUser(userId: string) {
   await cleanupBattleRooms();

   const { data: playerRows, error: playerError } = await supabaseAdmin
      .from("vocab_battle_round_players")
      .select(
         "round_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(10);

   if (playerError) {
      throw new Error("Failed to load battle history.");
   }

   const roundIds = Array.from(
      new Set((playerRows || []).map((row) => row.round_id as string)),
   );

   if (roundIds.length === 0) {
      return [] as BattleHistoryEntry[];
   }

   const [roundsResult, allPlayersResult] = await Promise.all([
      supabaseAdmin
         .from("vocab_battle_rounds")
         .select(ROUND_SELECT)
         .in("id", roundIds),
      supabaseAdmin
         .from("vocab_battle_round_players")
         .select(
            "round_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
         )
         .in("round_id", roundIds)
         .order("joined_at", { ascending: true }),
   ]);

   if (roundsResult.error || allPlayersResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const rounds = (roundsResult.data || []) as RoundRow[];
   const roomIds = Array.from(new Set(rounds.map((round) => round.room_id)));
   const roomsResult = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select(ROOM_SELECT)
      .in("id", roomIds);

   if (roomsResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const roomsById = new Map(
      ((roomsResult.data || []) as RoomRow[]).map((room) => [room.id, room]),
   );
   const premiumMap = await getPremiumMap(
      ((allPlayersResult.data || []) as RoundPlayerRow[]).map(
         (player) => player.user_id,
      ),
   );
   const playersByRound = new Map<string, RoundPlayerRow[]>();

   ((allPlayersResult.data || []) as RoundPlayerRow[]).forEach((player) => {
      const roundId = player.round_id as string;
      const existing = playersByRound.get(roundId) || [];
      existing.push(player);
      playersByRound.set(roundId, existing);
   });

   return rounds
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((round) => {
         const room = roomsById.get(round.room_id);
         const players = mapRoundPlayerSnapshots(
            playersByRound.get(round.id) || [],
            premiumMap,
         );

         return {
            roundId: round.id,
            roundNumber: round.round_number,
            roomCode: room?.code || "------",
            deckTitle: round.deck_title || room?.deck_title || "Battle deck",
            roomStatus: room?.status || "expired",
            status: round.status,
            createdAt: round.created_at,
            finishedAt: round.finished_at,
            winnerUserId: round.winner_user_id,
            questionCount: round.question_count,
            players,
            rewards: getCuriosityRewards(players, round.winner_user_id),
         };
      });
}

export async function getActiveBattleRoomForUser(
   userId: string,
): Promise<ActiveBattleRoomSummary | null> {
   await cleanupBattleRooms();

   const { data: memberships, error: membershipError } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .select("room_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false });

   if (membershipError) {
      throw new Error("Failed to load your active battle room.");
   }

   const roomIds = Array.from(
      new Set((memberships || []).map((row) => row.room_id as string).filter(Boolean)),
   );

   for (const roomId of roomIds) {
      const room = await getRoomById(roomId);
      if (!room) {
         continue;
      }

      const refreshedRoom = (await enforceRoomExpirationAfterPremiumCheck(room.id)) || room;
      if (refreshedRoom.status !== "open") {
         continue;
      }

      const [members, latestRound] = await Promise.all([
         getRoomMembers(refreshedRoom.id),
         getLatestRoundForRoom(refreshedRoom.id),
      ]);

      return {
         roomCode: refreshedRoom.code,
         deckTitle: refreshedRoom.deck_title || "Battle deck",
         playerCount: members.length,
         currentRoundStatus: latestRound?.status ?? null,
         roundNumber: latestRound?.round_number ?? null,
      };
   }

   return null;
}

export async function createBattleRoom(
   deckIds: string[],
   userId: string,
   username: string,
   questionCount: BattleQuestionCount,
   timeLimitSeconds: number,
) {
   await cleanupBattleRooms();

   const decks = await loadBattleDecks(deckIds);
   const roomCode = await createUniqueBattleRoomCode();
   const deckTitle = formatBattleDeckTitle(decks);

   const { data: room, error: roomError } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .insert({
         code: roomCode,
         host_user_id: userId,
         deck_id: decks[0].id,
         deck_ids: decks.map((deck) => deck.id),
         deck_title: deckTitle,
         status: "open",
         question_count: questionCount,
         time_limit_seconds: timeLimitSeconds,
         completed_round_count: 0,
      })
      .select(ROOM_SELECT)
      .single();

   if (roomError || !room) {
      throw new Error("Failed to create room.");
   }

   const { error: memberError } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .insert({
         room_id: room.id,
         user_id: userId,
         username,
      });

   if (memberError) {
      await deleteRoom(room.id);
      throw new Error("Failed to add the host to the room.");
   }

   try {
      await createRoundForRoom(room as RoomRow, 1);
   } catch (error) {
      await deleteRoom(room.id);
      throw error;
   }

   return { roomCode: room.code, deckTitle };
}

export async function createNextBattleRound(
   roomCode: string,
   userId: string,
   requestedDeckIds?: string[],
) {
   const room = await loadRoomForParticipant(roomCode, userId);

   if (room.host_user_id !== userId) {
      throw new Error("Only the room host can start the next round.");
   }

   const refreshedRoom =
      (await enforceRoomExpirationAfterPremiumCheck(room.id)) || room;

   if (refreshedRoom.status === "expired") {
      throw new Error(
         refreshedRoom.expiration_reason ||
            "This room has expired. Create a new room to continue.",
      );
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (currentRound && currentRound.status !== "finished") {
      throw new Error("Finish the current round before starting a new one.");
   }

   if (requestedDeckIds?.length) {
      const decks = await loadBattleDecks(requestedDeckIds);
      const nextDeckIds = decks.map((deck) => deck.id);
      const nextDeckTitle = formatBattleDeckTitle(decks);

      const { error: roomUpdateError } = await supabaseAdmin
         .from("vocab_battle_rooms")
         .update({
            deck_id: decks[0].id,
            deck_ids: nextDeckIds,
            deck_title: nextDeckTitle,
         })
         .eq("id", refreshedRoom.id);

      if (roomUpdateError) {
         throw new Error("Failed to update room deck selection.");
      }

      const updatedRoom = await getRoomById(refreshedRoom.id);
      if (!updatedRoom) {
         throw new Error("Room not found.");
      }

      await createRoundForRoomWithDecks(
         updatedRoom,
         (updatedRoom.completed_round_count ?? 0) + 1,
         nextDeckIds,
         nextDeckTitle,
         decks[0].id,
      );
      return;
   }

   await createRoundForRoom(
      refreshedRoom,
      (refreshedRoom.completed_round_count ?? 0) + 1,
   );
}

export async function removePlayerFromBattleRoom(
   roomCode: string,
   hostUserId: string,
   targetUserId: string,
) {
   const room = await loadRoomForParticipant(roomCode, hostUserId);

   if (room.host_user_id !== hostUserId) {
      throw new Error("Only the room host can remove players.");
   }

   if (hostUserId === targetUserId) {
      throw new Error("The host cannot remove themselves from the room.");
   }

   const members = await getRoomMembers(room.id);
   const targetMember = members.find((member) => member.user_id === targetUserId);

   if (!targetMember) {
      throw new Error("Player not found in this room.");
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (currentRound && currentRound.status !== "finished") {
      await supabaseAdmin
         .from("vocab_battle_round_answers")
         .delete()
         .eq("round_id", currentRound.id)
         .eq("user_id", targetUserId);

      const { error: roundPlayerDeleteError } = await supabaseAdmin
         .from("vocab_battle_round_players")
         .delete()
         .eq("round_id", currentRound.id)
         .eq("user_id", targetUserId);

      if (roundPlayerDeleteError) {
         throw new Error("Failed to remove the player from the current round.");
      }
   }

   const { error: memberDeleteError } = await supabaseAdmin
      .from("vocab_battle_room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", targetUserId);

   if (memberDeleteError) {
      throw new Error("Failed to remove the player from the room.");
   }

   const refreshedRound = await getLatestRoundForRoom(room.id);
   if (refreshedRound && refreshedRound.status === "active") {
      const remainingPlayers = await getRoundPlayers(refreshedRound.id);
      const everyoneSubmitted =
         remainingPlayers.length >= 1 &&
         remainingPlayers.every((player) => Boolean(player.submitted_at));

      if (everyoneSubmitted) {
         await finalizeRound(refreshedRound.id);
      }
   }
}

export async function forceFinishBattleRound(roomCode: string, hostUserId: string) {
   const room = await loadRoomForParticipant(roomCode, hostUserId);

   if (room.host_user_id !== hostUserId) {
      throw new Error("Only the room host can force-finish the round.");
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (!currentRound) {
      throw new Error("There is no round in this room.");
   }

   if (currentRound.status === "finished") {
      return currentRound;
   }

   if (currentRound.status !== "active") {
      throw new Error("Only active rounds can be force-finished.");
   }

   return finalizeRound(currentRound.id);
}

export async function endBattleRoom(roomCode: string, hostUserId: string) {
   const room = await loadRoomForParticipant(roomCode, hostUserId);

   if (room.host_user_id !== hostUserId) {
      throw new Error("Only the room host can end the room.");
   }

   if (room.status === "expired") {
      return room;
   }

   const currentRound = await getLatestRoundForRoom(room.id);
   if (currentRound?.status === "active") {
      await finalizeRound(currentRound.id);
   }

   await expireRoom(room.id, "This room was ended by the host.");
   return getRoomById(room.id);
}
