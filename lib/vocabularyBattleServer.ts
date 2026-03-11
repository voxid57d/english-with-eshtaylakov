import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
   BattleHistoryEntry,
   BattleQuestionReview,
   BATTLE_MINIMUM_CARD_COUNT,
   BATTLE_QUESTION_COUNT,
   BattleRoomSnapshot,
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
   current_question_index: number;
   current_question_started_at: string | null;
   winner_user_id: string | null;
   created_at: string;
   finished_at: string | null;
};

type PlayerRow = {
   user_id: string;
   username: string | null;
   score: number | null;
   joined_at: string;
};

type QuestionRow = {
   room_id: string;
   question_index: number;
   prompt: string;
   options: string[];
   correct_option_index: number;
};

type AnswerRow = {
   room_id: string;
   question_index: number;
   user_id: string;
   selected_option_index: number | null;
   is_correct: boolean;
   response_ms: number | null;
};

const WAITING_ROOM_TTL_HOURS = 2;
const FINISHED_ROOM_TTL_HOURS = 24;
const STALE_ACTIVE_ROOM_TTL_HOURS = 2;

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
         "id, code, deck_id, status, question_count, time_limit_seconds, current_question_index, current_question_started_at, winner_user_id, created_at, finished_at",
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
      .select("user_id, username, score, joined_at")
      .eq("room_id", roomId)
      .order("joined_at", { ascending: true });

   if (error) {
      throw new Error("Failed to load room players.");
   }

   return (data || []) as PlayerRow[];
}

async function getRoomAnswers(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_answers")
      .select(
         "room_id, question_index, user_id, selected_option_index, is_correct, response_ms",
      )
      .eq("room_id", roomId);

   if (error) {
      throw new Error("Failed to load room answers.");
   }

   return (data || []) as AnswerRow[];
}

async function getRoomQuestions(roomId: string) {
   const { data, error } = await supabaseAdmin
      .from("vocab_battle_questions")
      .select(
         "room_id, question_index, prompt, options, correct_option_index",
      )
      .eq("room_id", roomId)
      .order("question_index", { ascending: true });

   if (error) {
      throw new Error("Failed to load room questions.");
   }

   return (data || []) as QuestionRow[];
}

function buildPlayerTotals(players: PlayerRow[], answers: AnswerRow[]) {
   const totals = new Map<string, number>();
   players.forEach((player) => totals.set(player.user_id, 0));

   answers.forEach((answer) => {
      totals.set(
         answer.user_id,
         (totals.get(answer.user_id) || 0) + (answer.response_ms || 0),
      );
   });

   return totals;
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

async function finalizeRoom(room: RoomRow) {
   const [players, answers] = await Promise.all([
      getRoomPlayers(room.id),
      getRoomAnswers(room.id),
   ]);
   const totals = buildPlayerTotals(players, answers);
   const ranked = [...players].sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;

      const timeDiff = (totals.get(a.user_id) || 0) - (totals.get(b.user_id) || 0);
      if (timeDiff !== 0) return timeDiff;

      return a.joined_at.localeCompare(b.joined_at);
   });
   const topScore = ranked[0]?.score ?? 0;
   const topTime = totals.get(ranked[0]?.user_id || "") || 0;
   const topPlayers = ranked.filter(
      (player) =>
         (player.score || 0) === topScore &&
         (totals.get(player.user_id) || 0) === topTime,
   );
   const winnerUserId = topPlayers.length === 1 ? topPlayers[0].user_id : null;

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .update({
         status: "finished",
         winner_user_id: winnerUserId,
         finished_at: new Date().toISOString(),
      })
      .eq("id", room.id);
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
      now - STALE_ACTIVE_ROOM_TTL_HOURS * 60 * 60 * 1000,
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
      .select(
         "id, code, deck_id, status, question_count, time_limit_seconds, current_question_index, current_question_started_at, winner_user_id, created_at, finished_at",
      )
      .eq("status", "active")
      .lt("current_question_started_at", activeCutoff);

   for (const room of (staleActiveRooms || []) as RoomRow[]) {
      await finalizeRoom(room);
   }
}

async function advanceRoom(room: RoomRow) {
   if (room.current_question_index + 1 >= room.question_count) {
      await finalizeRoom(room);
      return;
   }

   await supabaseAdmin
      .from("vocab_battle_rooms")
      .update({
         current_question_index: room.current_question_index + 1,
         current_question_started_at: new Date().toISOString(),
      })
      .eq("id", room.id);
}

export async function reconcileBattleRoom(roomCode: string) {
   const room = await getRoomByCode(roomCode);
   if (!room || room.status !== "active") {
      return room;
   }

   const players = await getRoomPlayers(room.id);
   if (players.length < 2) {
      return room;
   }

   const { count } = await supabaseAdmin
      .from("vocab_battle_answers")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room.id)
      .eq("question_index", room.current_question_index);

   const phaseStartedAt = room.current_question_started_at
      ? new Date(room.current_question_started_at).getTime()
      : 0;
   const deadline =
      phaseStartedAt + room.time_limit_seconds * 1000 <= Date.now();
   const everyoneAnswered = (count || 0) >= players.length;

   if (deadline || everyoneAnswered) {
      await advanceRoom(room);
      return getRoomByCode(room.code);
   }

   return room;
}

export async function buildBattleRoomSnapshot(
   roomCode: string,
   viewerUserId: string,
): Promise<BattleRoomSnapshot | null> {
   await cleanupBattleRooms();
   const room = await reconcileBattleRoom(roomCode);
   if (!room) {
      return null;
   }

   const [deckResult, players, questions, answers, currentQuestionResult, viewerAnswerResult] =
      await Promise.all([
         supabaseAdmin
            .from("vocabulary_decks")
            .select("id, title")
            .eq("id", room.deck_id)
            .single(),
         getRoomPlayers(room.id),
         getRoomQuestions(room.id),
         getRoomAnswers(room.id),
         supabaseAdmin
            .from("vocab_battle_questions")
            .select("room_id, question_index, prompt, options, correct_option_index")
            .eq("room_id", room.id)
            .eq("question_index", room.current_question_index)
            .maybeSingle(),
         supabaseAdmin
            .from("vocab_battle_answers")
            .select(
               "room_id, question_index, user_id, selected_option_index, is_correct, response_ms",
            )
            .eq("room_id", room.id)
            .eq("question_index", room.current_question_index)
            .eq("user_id", viewerUserId)
            .maybeSingle(),
      ]);

   if (deckResult.error || !deckResult.data) {
      throw new Error("Failed to load deck details.");
   }

   const currentQuestion =
      room.status === "active" && currentQuestionResult.data
         ? (currentQuestionResult.data as QuestionRow)
         : null;
   const viewerAnswer = (viewerAnswerResult.data as AnswerRow | null) || null;
   const responseTotals = buildPlayerTotals(players, answers);
   const completedQuestions = buildQuestionReviews(questions, answers);

   return {
      roomCode: room.code,
      status: room.status,
      deckId: room.deck_id,
      deckTitle: deckResult.data.title,
      questionCount: room.question_count,
      timeLimitSeconds: room.time_limit_seconds,
      currentQuestionIndex: room.current_question_index,
      phaseStartedAt: room.current_question_started_at,
      winnerUserId: room.winner_user_id,
      createdAt: room.created_at,
      finishedAt: room.finished_at,
      viewerUserId,
      viewerHasAnsweredCurrentQuestion: Boolean(viewerAnswer),
      viewerSelectedOptionIndex: viewerAnswer?.selected_option_index ?? null,
      players: players.map((player) => ({
         userId: player.user_id,
         username: player.username?.trim() || "Player",
         score: player.score ?? 0,
         joinedAt: player.joined_at,
         totalResponseMs: responseTotals.get(player.user_id) || 0,
      })),
      currentQuestion: currentQuestion
         ? {
              prompt: currentQuestion.prompt,
              options: currentQuestion.options,
           }
         : null,
      completedQuestions,
   };
}

export async function loadRoomForParticipant(roomCode: string, userId: string) {
   await cleanupBattleRooms();
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

export async function getBattleHistoryForUser(userId: string) {
   await cleanupBattleRooms();

   const { data: playerRows, error: playerError } = await supabaseAdmin
      .from("vocab_battle_players")
      .select("room_id, user_id, username, score, joined_at")
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

   const [roomsResult, decksResult, allPlayersResult, answersResult] =
      await Promise.all([
         supabaseAdmin
            .from("vocab_battle_rooms")
            .select(
               "id, code, deck_id, status, question_count, time_limit_seconds, current_question_index, current_question_started_at, winner_user_id, created_at, finished_at",
            )
            .in("id", roomIds),
         supabaseAdmin.from("vocabulary_decks").select("id, title"),
         supabaseAdmin
            .from("vocab_battle_players")
            .select("room_id, user_id, username, score, joined_at")
            .in("room_id", roomIds)
            .order("joined_at", { ascending: true }),
         supabaseAdmin
            .from("vocab_battle_answers")
            .select(
               "room_id, question_index, user_id, selected_option_index, is_correct, response_ms",
            )
            .in("room_id", roomIds),
      ]);

   if (roomsResult.error || decksResult.error || allPlayersResult.error || answersResult.error) {
      throw new Error("Failed to load battle history.");
   }

   const deckMap = new Map(
      (decksResult.data || []).map((deck) => [deck.id as string, deck.title as string]),
   );
   const playersByRoom = new Map<string, PlayerRow[]>();
   ((allPlayersResult.data || []) as (PlayerRow & { room_id: string })[]).forEach(
      (player) => {
         const existing = playersByRoom.get(player.room_id) || [];
         existing.push(player);
         playersByRoom.set(player.room_id, existing);
      },
   );
   const answersByRoom = new Map<string, AnswerRow[]>();
   ((answersResult.data || []) as AnswerRow[]).forEach((answer) => {
      const existing = answersByRoom.get(answer.room_id) || [];
      existing.push(answer);
      answersByRoom.set(answer.room_id, existing);
   });

   return ((roomsResult.data || []) as RoomRow[])
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((room) => {
         const players = playersByRoom.get(room.id) || [];
         const totals = buildPlayerTotals(players, answersByRoom.get(room.id) || []);

         return {
            roomCode: room.code,
            deckTitle: deckMap.get(room.deck_id) || "Unknown deck",
            status: room.status,
            createdAt: room.created_at,
            finishedAt: room.finished_at,
            winnerUserId: room.winner_user_id,
            questionCount: room.question_count,
            players: players.map((player) => ({
               userId: player.user_id,
               username: player.username?.trim() || "Player",
               score: player.score ?? 0,
               joinedAt: player.joined_at,
               totalResponseMs: totals.get(player.user_id) || 0,
            })),
         };
      });
}
