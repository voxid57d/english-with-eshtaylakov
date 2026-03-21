export const BATTLE_ROOM_CODE_LENGTH = 6;
export const BATTLE_QUESTION_OPTIONS = [10, 15, 20, 25] as const;
export const BATTLE_DEFAULT_QUESTION_COUNT = BATTLE_QUESTION_OPTIONS[0];
export const BATTLE_TIME_LIMIT_SECONDS = 15;
export const BATTLE_MINIMUM_CARD_COUNT = 10;
export const BATTLE_READY_COUNTDOWN_SECONDS = 10;
export const BATTLE_FREE_ROUNDS_PER_ROOM = 5;

export type BattleQuestionCount = (typeof BATTLE_QUESTION_OPTIONS)[number];

export type BattleRoomStatus = "open" | "expired";
export type BattleRoundStatus = "waiting" | "active" | "finished";

export type BattleQuestionPayload = {
   questionIndex: number;
   prompt: string;
   options: string[];
};

export type BattleRoomPlayerSnapshot = {
   userId: string;
   username: string;
   isPremium: boolean;
   joinedAt: string;
};

export type BattleRoundPlayerSnapshot = {
   userId: string;
   username: string;
   isPremium: boolean;
   score: number;
   joinedAt: string;
   totalResponseMs: number;
   isReady: boolean;
   readyAt: string | null;
   submittedAt: string | null;
};

export type BattleRoundRewardSnapshot = {
   userId: string;
   curiosityPoints: number;
   place: number;
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

export type BattleRoundSnapshot = {
   roundId: string;
   roundNumber: number;
   status: BattleRoundStatus;
   deckId: string;
   deckIds: string[];
   deckTitle: string;
   questionCount: number;
   timeLimitSeconds: number;
   battleStartsAt: string | null;
   winnerUserId: string | null;
   createdAt: string;
   finishedAt: string | null;
   viewerReady: boolean;
   viewerSubmitted: boolean;
   viewerIsParticipant: boolean;
   players: BattleRoundPlayerSnapshot[];
   questionBank: BattleQuestionPayload[];
   completedQuestions: BattleQuestionReview[];
   rewards: BattleRoundRewardSnapshot[];
};

export type BattleHistoryEntry = {
   roundId: string;
   roundNumber: number;
   roomCode: string;
   deckTitle: string;
   roomStatus: BattleRoomStatus;
   status: BattleRoundStatus;
   createdAt: string;
   finishedAt: string | null;
   winnerUserId: string | null;
   questionCount: number;
   players: BattleRoundPlayerSnapshot[];
   rewards: BattleRoundRewardSnapshot[];
};

export type BattleRoomSnapshot = {
   roomCode: string;
   roomStatus: BattleRoomStatus;
   hostUserId: string;
   deckId: string;
   deckIds: string[];
   deckTitle: string;
   questionCount: number;
   timeLimitSeconds: number;
   createdAt: string;
   completedRoundCount: number;
   expiresAt: string | null;
   expirationReason: string | null;
   viewerUserId: string;
   viewerIsHost: boolean;
   viewerIsRoomMember: boolean;
   players: BattleRoomPlayerSnapshot[];
   currentRound: BattleRoundSnapshot | null;
   recentRounds: BattleHistoryEntry[];
};

export type BattleSubmissionAnswer = {
   questionIndex: number;
   selectedOptionIndex: number | null;
   responseMs: number;
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

export function isBattleQuestionCount(
   value: number,
): value is BattleQuestionCount {
   return (BATTLE_QUESTION_OPTIONS as readonly number[]).includes(value);
}
