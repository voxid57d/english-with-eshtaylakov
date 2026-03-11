export const BATTLE_ROOM_CODE_LENGTH = 6;
export const BATTLE_QUESTION_COUNT = 10;
export const BATTLE_TIME_LIMIT_SECONDS = 10;
export const BATTLE_MINIMUM_CARD_COUNT = 10;

export type BattleRoomStatus = "waiting" | "active" | "finished";

export type BattleQuestionPayload = {
   prompt: string;
   options: string[];
};

export type BattlePlayerSnapshot = {
   userId: string;
   username: string;
   score: number;
   joinedAt: string;
   totalResponseMs: number;
};

export type BattleQuestionAnswerReview = {
   userId: string;
   selectedOptionIndex: number | null;
   isCorrect: boolean;
   responseMs: number;
};

export type BattleQuestionReview = {
   questionIndex: number;
   prompt: string;
   options: string[];
   correctOptionIndex: number;
   answers: BattleQuestionAnswerReview[];
};

export type BattleHistoryEntry = {
   roomCode: string;
   deckTitle: string;
   status: BattleRoomStatus;
   createdAt: string;
   finishedAt: string | null;
   winnerUserId: string | null;
   questionCount: number;
   players: BattlePlayerSnapshot[];
};

export type BattleRoomSnapshot = {
   roomCode: string;
   status: BattleRoomStatus;
   deckId: string;
   deckTitle: string;
   questionCount: number;
   timeLimitSeconds: number;
   currentQuestionIndex: number;
   phaseStartedAt: string | null;
   winnerUserId: string | null;
   createdAt: string;
   finishedAt: string | null;
   viewerUserId: string;
   viewerHasAnsweredCurrentQuestion: boolean;
   viewerSelectedOptionIndex: number | null;
   players: BattlePlayerSnapshot[];
   currentQuestion: BattleQuestionPayload | null;
   completedQuestions: BattleQuestionReview[];
};

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeRoomCode(value: string) {
   return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function createRoomCode() {
   let code = "";
   for (let i = 0; i < BATTLE_ROOM_CODE_LENGTH; i += 1) {
      const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[index];
   }
   return code;
}

export function shuffleArray<T>(items: T[]) {
   const copy = [...items];
   for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
   }
   return copy;
}
