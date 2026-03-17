import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BATTLE_MINIMUM_CARD_COUNT,
   BATTLE_READY_COUNTDOWN_SECONDS,
   BattleHistoryEntry,
   BattleQuestionCount,
   BattleQuestionPayload,
   BattleQuestionReview,
   BattleRoomSnapshot,
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
   deck_id: string;
   deck_ids?: string[] | null;
   deck_title?: string | null;
   status: "waiting" | "active" | "finished";
   question_count: number;
   time_limit_seconds: number;
   current_question_started_at: string | null;
   winner_user_id: string | null;
   created_at: string;
   finished_at: string | null;
};

type PlayerRow = {
   room_id?: string;
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
   room_id?: string;
   question_index: number;
   prompt: string;
   options: string[];
   correct_option_index: number;
};

type AnswerRow = {
   room_id?: string;
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

const WAITING_ROOM_TTL_HOURS = 6;
const FINISHED_ROOM_TTL_HOURS = 24;
const ACTIVE_ROOM_TTL_HOURS = 2;
const CURIOSITY_POINT_REWARDS = [10, 5] as const;
const ROOM_SELECT_BASE =
   "id, code, deck_id, status, question_count, time_limit_seconds, current_question_started_at, winner_user_id, created_at, finished_at";
const ROOM_SELECT_WITH_MULTI =
   "id, code, deck_id, deck_ids, deck_title, status, question_count, time_limit_seconds, current_question_started_at, winner_user_id, created_at, finished_at";

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

function getRoomDeckIds(room: RoomRow) {
   return room.deck_ids?.length ? room.deck_ids : [room.deck_id];
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

async function getRoomByCode(roomCode: string) {
   const normalizedCode = normalizeRoomCode(roomCode);
   const query = supabaseAdmin
      .from("vocab_battle_rooms")
      .select(ROOM_SELECT_WITH_MULTI)
      .eq("code", normalizedCode)
      .maybeSingle();

   let { data, error } = await query;

   if (error && /deck_ids|deck_title/i.test(error.message)) {
      ({ data, error } = await supabaseAdmin
         .from("vocab_battle_rooms")
         .select(ROOM_SELECT_BASE)
         .eq("code", normalizedCode)
         .maybeSingle());
   }

   if (error || !data) {
      return null;
   }

   return data as RoomRow;
}

async function getRoomPlayers(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_players")
      .select(
         "room_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
      )
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

   if (error) {
      throw new Error("Failed to load room players.");
   }

   return (data || []) as PlayerRow[];
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

async function getRoomQuestions(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_questions")
      .select("question_index, prompt, options, correct_option_index")
      .eq("room_id", roomId)
      .order("question_index", { ascending: true });

   if (error) {
      throw new Error("Failed to load room questions.");
   }

   return (data || []) as QuestionRow[];
}

async function getRoomAnswers(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_answers")
      .select(
         "room_id, question_index, user_id, selected_option_index, is_correct, response_ms",
      )
      .eq("room_id", roomId)
      .order("question_index", { ascending: true });

   if (error) {
      throw new Error("Failed to load room answers.");
   }

   return (data || []) as AnswerRow[];
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

function sortPlayersForWinner(players: PlayerRow[]) {
   return [...players].sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const timeDiff =
         (a.total_response_ms || 0) - (b.total_response_ms || 0);
      if (timeDiff !== 0) return timeDiff;

      return a.joined_at.localeCompare(b.joined_at);
   });
}

async function awardCuriosityPoints(players: PlayerRow[]) {
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

async function finalizeRoom(roomId: string) {
   const players = await getRoomPlayers(roomId);
   const ranked = sortPlayersForWinner(players);
   const top = ranked[0];
   const isTie =
      ranked.length > 1 &&
      (ranked[1].score || 0) === (top?.score || 0) &&
      (ranked[1].total_response_ms || 0) === (top?.total_response_ms || 0);

   const winnerUserId = top && !isTie ? top.user_id : null;

   if (!isTie) {
      await awardCuriosityPoints(ranked);
   }

   const { error: finalizeError } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .update({
         status: "finished",
         winner_user_id: winnerUserId,
         finished_at: new Date().toISOString(),
      })
      .eq("id", roomId)
      .eq("status", "active");

   if (finalizeError) {
      console.error("Battle room finalize failed:", finalizeError, { roomId });
      throw new Error("Failed to finalize battle room.");
   }
}

async function deleteRoom(roomId: string) {
   await supabaseAdmin.from("vocab_battle_rooms").delete().eq("id", roomId);
}

export async function cleanupBattleRooms() {
   const now = Date.now();
   const waitingCutoff = new Date(
      now - WAITING_ROOM_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();
   const finishedCutoff = new Date(
      now - FINISHED_ROOM_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();
   const activeCutoff = new Date(
      now - ACTIVE_ROOM_TTL_HOURS * 60 * 60 * 1000,
   ).toISOString();

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .delete()
      .eq("status", "waiting")
      .lt("created_at", waitingCutoff);

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .delete()
      .eq("status", "finished")
      .lt("finished_at", finishedCutoff);

   const { data: staleActiveRooms } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select("id")
      .eq("status", "active")
      .lt("current_question_started_at", activeCutoff)
      .is("finished_at", null);

   for (const room of staleActiveRooms || []) {
      await finalizeRoom(room.id as string);
   }
}

export async function loadRoomForParticipant(roomCode: string, userId: string) {
   const room = await getRoomByCode(roomCode);
   if (!room) {
      throw new Error("Room not found.");
   }

   const { data } = await supabaseAdmin
      .from("vocab_battle_players")
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
   await cleanupBattleRooms();
   const room = await getRoomByCode(roomCode);
   if (!room) {
      return null;
   }

   const [players, questions] = await Promise.all([
      getRoomPlayers(room.id),
      getRoomQuestions(room.id),
   ]);
   const premiumMap = await getPremiumMap(players.map((player) => player.user_id));

   const viewer = players.find((player) => player.user_id === viewerUserId);
   const completedQuestions =
      room.status === "finished"
         ? buildQuestionReviews(questions, await getRoomAnswers(room.id))
         : [];

   return {
      roomCode: room.code,
      status: room.status,
      deckId: room.deck_id,
      deckIds: getRoomDeckIds(room),
      deckTitle: room.deck_title || "Battle deck",
      questionCount: room.question_count,
      timeLimitSeconds: room.time_limit_seconds,
      battleStartsAt: room.current_question_started_at,
      winnerUserId: room.winner_user_id,
      createdAt: room.created_at,
      finishedAt: room.finished_at,
      viewerUserId,
      viewerReady: viewer?.is_ready === true,
      viewerSubmitted: Boolean(viewer?.submitted_at),
      players: players.map((player) => ({
         userId: player.user_id,
         username: player.username?.trim() || "Player",
         isPremium: premiumMap.get(player.user_id) === true,
         score: player.score ?? 0,
         joinedAt: player.joined_at,
         totalResponseMs: player.total_response_ms ?? 0,
         isReady: player.is_ready === true,
         readyAt: player.ready_at,
         submittedAt: player.submitted_at,
      })),
      questionBank: mapQuestionBank(questions),
      completedQuestions,
   };
}

export async function markPlayerReady(roomCode: string, userId: string) {
   const room = await loadRoomForParticipant(roomCode, userId);

   if (room.status === "finished") {
      throw new Error("This battle has already finished.");
   }

   await supabaseAdmin
      .from("vocab_battle_players")
      .update({
         is_ready: true,
         ready_at: new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("user_id", userId);

   const players = await getRoomPlayers(room.id);
   const everyoneReady =
      players.length >= 2 && players.every((player) => player.is_ready === true);

   if (
      everyoneReady &&
      !room.current_question_started_at &&
      room.status === "waiting"
   ) {
      await supabaseAdmin
         .from("vocab_battle_rooms")
         .update({
            status: "active",
            current_question_started_at: new Date(
               Date.now() + BATTLE_READY_COUNTDOWN_SECONDS * 1000,
            ).toISOString(),
         })
         .eq("id", room.id);
   }
}

export async function joinBattleRoom(
   roomCode: string,
   userId: string,
   username: string,
) {
   await cleanupBattleRooms();

   const room = await getRoomByCode(roomCode);
   if (!room) {
      throw new Error("Room not found.");
   }

   if (room.status === "finished") {
      throw new Error("This battle has already finished.");
   }

   const players = await getRoomPlayers(room.id);
   const participantIds = new Set(players.map((player) => player.user_id));
   if (participantIds.has(userId)) {
      return room.code;
   }

   if (room.status !== "waiting") {
      throw new Error("This battle has already started.");
   }

   const { error: joinError } = await supabaseAdmin
      .from("vocab_battle_players")
      .insert({
         room_id: room.id,
         user_id: userId,
         username,
         score: 0,
         total_response_ms: 0,
         is_ready: false,
      });

   if (joinError) {
      throw new Error("Failed to join the room.");
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
   if (room.status === "finished") {
      return room;
   }

   const players = await getRoomPlayers(room.id);
   const player = players.find((entry) => entry.user_id === userId);

   if (!player) {
      throw new Error("You are not a participant in this room.");
   }

   if (player.submitted_at) {
      return room;
   }

   const battleStartsAt = room.current_question_started_at
      ? new Date(room.current_question_started_at).getTime()
      : 0;

   if (!battleStartsAt || battleStartsAt > Date.now()) {
      throw new Error("The battle has not started yet.");
   }

   const questions = await getRoomQuestions(room.id);
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
         Math.max(Math.round(clientAnswer?.responseMs || room.time_limit_seconds * 1000), 0),
         room.time_limit_seconds * 1000,
      );
      const isCorrect = selectedOptionIndex === question.correct_option_index;

      return {
         room_id: room.id,
         question_index: question.question_index,
         user_id: userId,
         selected_option_index: selectedOptionIndex,
         is_correct: isCorrect,
         response_ms: responseMs,
      };
   });

   const score = normalizedAnswers.filter((answer) => answer.is_correct).length;
   const totalResponseMs = Math.min(
      Math.max(Math.round(submission.totalResponseMs || 0), 0),
      room.question_count * room.time_limit_seconds * 1000,
   );

   const { error: answersError } = await supabaseAdmin
      .from("vocab_battle_answers")
      .upsert(normalizedAnswers, {
         onConflict: "room_id,question_index,user_id",
      });

   if (answersError) {
      throw new Error("Failed to save battle answers.");
   }

   const { error: playerError } = await supabaseAdmin
      .from("vocab_battle_players")
      .update({
         score,
         total_response_ms: totalResponseMs,
         submitted_at: new Date().toISOString(),
      })
      .eq("room_id", room.id)
      .eq("user_id", userId);

   if (playerError) {
      throw new Error("Failed to save battle result.");
   }

   const refreshedPlayers = await getRoomPlayers(room.id);
   const everyoneSubmitted =
      refreshedPlayers.length >= 2 &&
      refreshedPlayers.every((entry) => Boolean(entry.submitted_at));

   if (everyoneSubmitted) {
      await finalizeRoom(room.id);
   }

   return room;
}

export async function getBattleHistoryForUser(userId: string) {
   await cleanupBattleRooms();

   const { data: playerRows, error: playerError } = await supabaseAdmin
      .from("vocab_battle_players")
      .select(
         "room_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
      )
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(10);

   if (playerError) {
      throw new Error("Failed to load battle history.");
   }

   const roomIds = Array.from(
      new Set((playerRows || []).map((row) => row.room_id as string)),
   );

   if (roomIds.length === 0) {
      return [] as BattleHistoryEntry[];
   }

   const [initialRoomsResult, decksResult, allPlayersResult] = await Promise.all([
      supabaseAdmin
         .from("vocab_battle_rooms")
         .select(ROOM_SELECT_WITH_MULTI)
         .in("id", roomIds),
      supabaseAdmin.from("vocabulary_decks").select("id, title"),
      supabaseAdmin
         .from("vocab_battle_players")
         .select(
            "room_id, user_id, username, score, joined_at, total_response_ms, is_ready, ready_at, submitted_at",
         )
         .in("room_id", roomIds)
         .order("joined_at", { ascending: true }),
   ]);

   let roomsError = initialRoomsResult.error;
   let roomRows = (initialRoomsResult.data || []) as RoomRow[];

   if (roomsError && /deck_ids|deck_title/i.test(roomsError.message)) {
      const fallbackRoomsResult = await supabaseAdmin
         .from("vocab_battle_rooms")
         .select(ROOM_SELECT_BASE)
         .in("id", roomIds);

      roomsError = fallbackRoomsResult.error;
      roomRows = (fallbackRoomsResult.data || []) as RoomRow[];
   }

   if (roomsError || decksResult.error || allPlayersResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const deckMap = new Map(
      (decksResult.data || []).map((deck) => [deck.id as string, deck.title as string]),
   );
   const premiumMap = await getPremiumMap(
      ((allPlayersResult.data || []) as PlayerRow[]).map((player) => player.user_id),
   );
   const playersByRoom = new Map<string, PlayerRow[]>();

   ((allPlayersResult.data || []) as PlayerRow[]).forEach((player) => {
      const roomId = player.room_id as string;
      const existing = playersByRoom.get(roomId) || [];
      existing.push(player);
      playersByRoom.set(roomId, existing);
   });

   return roomRows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((room) => ({
         roomCode: room.code,
         deckTitle:
            room.deck_title || deckMap.get(room.deck_id) || "Unknown deck",
         status: room.status,
         createdAt: room.created_at,
         finishedAt: room.finished_at,
         winnerUserId: room.winner_user_id,
         questionCount: room.question_count,
         players: (playersByRoom.get(room.id) || []).map((player) => ({
            userId: player.user_id,
            username: player.username?.trim() || "Player",
            isPremium: premiumMap.get(player.user_id) === true,
            score: player.score ?? 0,
            joinedAt: player.joined_at,
            totalResponseMs: player.total_response_ms ?? 0,
            isReady: player.is_ready === true,
            readyAt: player.ready_at,
            submittedAt: player.submitted_at,
         })),
      }));
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
   const questions = await buildBattleQuestions(
      decks.map((deck) => deck.id),
      questionCount,
   );
   const roomCode = await createUniqueBattleRoomCode();
   const deckTitle = formatBattleDeckTitle(decks);

   const { data: room, error: roomError } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .insert({
         code: roomCode,
         deck_id: decks[0].id,
         deck_ids: decks.map((deck) => deck.id),
         deck_title: deckTitle,
         host_user_id: userId,
         status: "waiting",
         question_count: questions.length,
         time_limit_seconds: timeLimitSeconds,
         current_question_index: 0,
      })
      .select("id, code")
      .single();

   let createdRoom = room;
   let createdRoomError = roomError;

   if (createdRoomError && /deck_ids|deck_title/i.test(createdRoomError.message)) {
      const fallbackInsert = await supabaseAdmin
         .from("vocab_battle_rooms")
         .insert({
            code: roomCode,
            deck_id: decks[0].id,
            host_user_id: userId,
            status: "waiting",
            question_count: questions.length,
            time_limit_seconds: timeLimitSeconds,
            current_question_index: 0,
         })
         .select("id, code")
         .single();

      createdRoom = fallbackInsert.data;
      createdRoomError = fallbackInsert.error;
   }

   if (createdRoomError || !createdRoom) {
      throw new Error("Failed to create room.");
   }

   const { error: playerError } = await supabaseAdmin
      .from("vocab_battle_players")
      .insert({
         room_id: createdRoom.id,
         user_id: userId,
         username,
         score: 0,
         total_response_ms: 0,
         is_ready: false,
      });

   if (playerError) {
      await deleteRoom(createdRoom.id);
      throw new Error("Failed to add the host to the room.");
   }

   const questionRows = questions.map((question) => ({
      room_id: createdRoom.id,
      ...question,
   }));

   const { error: questionError } = await supabaseAdmin
      .from("vocab_battle_questions")
      .insert(questionRows);

   if (questionError) {
      await deleteRoom(createdRoom.id);
      throw new Error("Failed to save battle questions.");
   }

   return { roomCode: createdRoom.code, deckTitle };
}
