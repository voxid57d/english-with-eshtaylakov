import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BATTLE_MINIMUM_CARD_COUNT,
   BATTLE_QUESTION_COUNT,
   BATTLE_READY_COUNTDOWN_SECONDS,
   BattleHistoryEntry,
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
};

type CardRow = {
   id: string;
   front: string;
   back: string;
};

type RoomRow = {
   id: string;
   code: string;
   deck_id: string;
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

const WAITING_ROOM_TTL_HOURS = 6;
const FINISHED_ROOM_TTL_HOURS = 24;
const ACTIVE_ROOM_TTL_HOURS = 2;

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

export async function loadPublicDeck(deckId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocabulary_decks")
      .select("id, title, is_public")
      .eq("id", deckId)
      .maybeSingle();

   if (error || !data) {
      throw new Error("Deck not found.");
   }

   const deck = data as DeckRow;
   if (!deck.is_public) {
      throw new Error("Only public decks can be used in battle mode.");
   }

   return deck;
}

export async function buildBattleQuestions(deckId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocabulary_cards")
      .select("id, front, back")
      .eq("deck_id", deckId);

   if (error) {
      throw new Error("Failed to load deck cards.");
   }

   const cards = ((data || []) as CardRow[]).filter(
      (card) => card.front?.trim() && card.back?.trim(),
   );

   if (cards.length < BATTLE_MINIMUM_CARD_COUNT) {
      throw new Error(
         `This deck needs at least ${BATTLE_MINIMUM_CARD_COUNT} usable cards.`,
      );
   }

   const selectedCards = shuffleArray(cards).slice(0, BATTLE_QUESTION_COUNT);

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
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .select(
         "id, code, deck_id, status, question_count, time_limit_seconds, current_question_started_at, winner_user_id, created_at, finished_at",
      )
      .eq("code", normalizedCode)
      .maybeSingle();

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

async function finalizeRoom(roomId: string) {
   const players = await getRoomPlayers(roomId);
   const ranked = sortPlayersForWinner(players);
   const top = ranked[0];
   const isTie =
      ranked.length > 1 &&
      (ranked[1].score || 0) === (top?.score || 0) &&
      (ranked[1].total_response_ms || 0) === (top?.total_response_ms || 0);

   const winnerUserId = top && !isTie ? top.user_id : null;

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .update({
         status: "finished",
         winner_user_id: winnerUserId,
         finished_at: new Date().toISOString(),
      })
      .eq("id", roomId);
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

   const [deckResult, players, questions] = await Promise.all([
      supabaseAdmin
         .from("vocabulary_decks")
         .select("id, title")
         .eq("id", room.deck_id)
         .single(),
      getRoomPlayers(room.id),
      getRoomQuestions(room.id),
   ]);

   if (deckResult.error || !deckResult.data) {
      throw new Error("Failed to load deck details.");
   }

   const viewer = players.find((player) => player.user_id === viewerUserId);
   const completedQuestions =
      room.status === "finished"
         ? buildQuestionReviews(questions, await getRoomAnswers(room.id))
         : [];

   return {
      roomCode: room.code,
      status: room.status,
      deckId: room.deck_id,
      deckTitle: deckResult.data.title,
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
      players.length === 2 && players.every((player) => player.is_ready === true);

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

   if (players.length >= 2) {
      throw new Error("This room already has two players.");
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

   const refreshedPlayers = await getRoomPlayers(room.id);
   if (refreshedPlayers.length > 2) {
      await supabaseAdmin
         .from("vocab_battle_players")
         .delete()
         .eq("room_id", room.id)
         .eq("user_id", userId);
      throw new Error("This room already has two players.");
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
      refreshedPlayers.length === 2 &&
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

   const [roomsResult, decksResult, allPlayersResult] = await Promise.all([
      supabaseAdmin
         .from("vocab_battle_rooms")
         .select(
            "id, code, deck_id, status, question_count, time_limit_seconds, current_question_started_at, winner_user_id, created_at, finished_at",
         )
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

   if (roomsResult.error || decksResult.error || allPlayersResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const deckMap = new Map(
      (decksResult.data || []).map((deck) => [deck.id as string, deck.title as string]),
   );
   const playersByRoom = new Map<string, PlayerRow[]>();

   ((allPlayersResult.data || []) as PlayerRow[]).forEach((player) => {
      const roomId = player.room_id as string;
      const existing = playersByRoom.get(roomId) || [];
      existing.push(player);
      playersByRoom.set(roomId, existing);
   });

   return ((roomsResult.data || []) as RoomRow[])
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((room) => ({
         roomCode: room.code,
         deckTitle: deckMap.get(room.deck_id) || "Unknown deck",
         status: room.status,
         createdAt: room.created_at,
         finishedAt: room.finished_at,
         winnerUserId: room.winner_user_id,
         questionCount: room.question_count,
         players: (playersByRoom.get(room.id) || []).map((player) => ({
            userId: player.user_id,
            username: player.username?.trim() || "Player",
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
   deckId: string,
   userId: string,
   username: string,
   questionCount: number,
   timeLimitSeconds: number,
) {
   await cleanupBattleRooms();

   const deck = await loadPublicDeck(deckId);
   const questions = await buildBattleQuestions(deck.id);
   const roomCode = await createUniqueBattleRoomCode();

   const { data: room, error: roomError } = await supabaseAdmin
      .from("vocab_battle_rooms")
      .insert({
         code: roomCode,
         deck_id: deck.id,
         host_user_id: userId,
         status: "waiting",
         question_count: Math.min(questions.length, questionCount),
         time_limit_seconds: timeLimitSeconds,
         current_question_index: 0,
      })
      .select("id, code")
      .single();

   if (roomError || !room) {
      throw new Error("Failed to create room.");
   }

   const { error: playerError } = await supabaseAdmin
      .from("vocab_battle_players")
      .insert({
         room_id: room.id,
         user_id: userId,
         username,
         score: 0,
         total_response_ms: 0,
         is_ready: false,
      });

   if (playerError) {
      await deleteRoom(room.id);
      throw new Error("Failed to add the host to the room.");
   }

   const questionRows = questions.map((question) => ({
      room_id: room.id,
      ...question,
   }));

   const { error: questionError } = await supabaseAdmin
      .from("vocab_battle_questions")
      .insert(questionRows);

   if (questionError) {
      await deleteRoom(room.id);
      throw new Error("Failed to save battle questions.");
   }

   return { roomCode: room.code, deckTitle: deck.title };
}
