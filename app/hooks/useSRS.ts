"use client";
import { useCallback, useEffect, useMemo, useReducer } from "react";

export type CardWithHealth = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
   transcription: string | null;
   health: number;
   cooldownUntil: number | null; // timestamp or null
};

export type SRSState = {
   practiceQueue: CardWithHealth[];
   cooldownList: CardWithHealth[];
   currentCard: CardWithHealth | null;
   showBack: boolean;
   swipeDirection: "left" | "right" | null;
   isPracticing: boolean;
   grindMode: boolean;
};

export const MAX_HEALTH = 4;
export const COOLDOWN_MS = 5 * 60 * 1000;

type Action =
   | { type: "LOAD_CARDS"; cards: CardWithHealth[] }
   | { type: "START_PRACTICE" }
   | { type: "STOP_PRACTICE" }
   | { type: "FLIP_CARD" }
   | { type: "ANSWER"; known: boolean }
   | { type: "TICK"; now: number }
   | { type: "SET_GRIND_MODE"; value: boolean }
   | { type: "SWIPE"; direction: "left" | "right" | null };

function sortByHealth(cards: CardWithHealth[]) {
   return [...cards].sort(
      (a, b) => a.health - b.health || a.id.localeCompare(b.id)
   );
}

function reducer(state: SRSState, action: Action): SRSState {
   switch (action.type) {
      case "LOAD_CARDS": {
         const now = Date.now();

         const queue = action.cards.filter(
            (c) => !c.cooldownUntil || c.cooldownUntil <= now
         );

         const cooldown = action.cards.filter(
            (c) => c.cooldownUntil && c.cooldownUntil > now
         );

         const sortedQueue = sortByHealth(queue);

         return {
            ...state,
            practiceQueue: sortedQueue,
            cooldownList: cooldown,
            currentCard: sortedQueue[0] ?? null,
         };
      }

      case "START_PRACTICE":
         return {
            ...state,
            isPracticing: true,
            showBack: false,
            swipeDirection: null,
            currentCard: state.practiceQueue[0] ?? null,
         };

      case "STOP_PRACTICE":
         return {
            ...state,
            isPracticing: false,
            showBack: false,
            swipeDirection: null,
            currentCard: null,
         };

      case "FLIP_CARD":
         return { ...state, showBack: !state.showBack };

      case "ANSWER": {
         if (!state.currentCard) return state;

         const now = Date.now();
         const known = action.known;
         const card = state.currentCard;

         const newHealth = known
            ? Math.min(card.health + 1, MAX_HEALTH)
            : Math.max(card.health - 1, 0);

         const updatedCard: CardWithHealth = {
            ...card,
            health: newHealth,
            cooldownUntil: state.grindMode ? null : now + COOLDOWN_MS,
         };

         const newCooldown = state.grindMode
            ? state.cooldownList
            : [...state.cooldownList, updatedCard];

         const newQueue = state.practiceQueue.filter((c) => c.id !== card.id);

         const nextCard = newQueue[0] ?? null;

         return {
            ...state,
            practiceQueue: newQueue,
            cooldownList: newCooldown,
            currentCard: nextCard,
            showBack: false,
         };
      }

      case "TICK": {
         const now = action.now;

         const ready = state.cooldownList.filter(
            (c) => c.cooldownUntil && c.cooldownUntil <= now
         );

         if (ready.length === 0) return state;

         const stillCooling = state.cooldownList.filter(
            (c) => !c.cooldownUntil || c.cooldownUntil > now
         );

         const newQueue = sortByHealth([...state.practiceQueue, ...ready]);

         const current =
            state.currentCard &&
            newQueue.find((c) => c.id === state.currentCard!.id)
               ? state.currentCard
               : newQueue[0] ?? null;

         return {
            ...state,
            practiceQueue: newQueue,
            cooldownList: stillCooling,
            currentCard: state.isPracticing ? current : null,
         };
      }

      case "SET_GRIND_MODE":
         return { ...state, grindMode: action.value };

      case "SWIPE":
         return { ...state, swipeDirection: action.direction };

      default:
         return state;
   }
}

export function useSRS(initialCards: CardWithHealth[]) {
   const initial: SRSState = {
      practiceQueue: [],
      cooldownList: [],
      currentCard: null,
      showBack: false,
      swipeDirection: null,
      isPracticing: false,
      grindMode: false,
   };

   const [state, dispatch] = useReducer(reducer, initial);

   useEffect(() => {
      dispatch({ type: "LOAD_CARDS", cards: initialCards });
   }, [initialCards]);

   useEffect(() => {
      const interval = setInterval(() => {
         dispatch({ type: "TICK", now: Date.now() });
      }, 1000);
      return () => clearInterval(interval);
   }, []);

   return {
      state,

      startPractice: () => dispatch({ type: "START_PRACTICE" }),
      stopPractice: () => dispatch({ type: "STOP_PRACTICE" }),
      flipCard: () => dispatch({ type: "FLIP_CARD" }),
      answer: (known: boolean) => dispatch({ type: "ANSWER", known }),
      setGrindMode: (v: boolean) =>
         dispatch({ type: "SET_GRIND_MODE", value: v }),
      setSwipe: (dir: "left" | "right" | null) =>
         dispatch({ type: "SWIPE", direction: dir }),
   };
}
