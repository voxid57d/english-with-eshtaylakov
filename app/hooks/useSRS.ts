"use client";
import { useEffect, useReducer } from "react";

export type CardWithHealth = {
   id: string;
   front: string;
   back: string;
   example_sentence: string | null;
   transcription: string | null;
   health: number;
   cooldownUntil: number | null;
};

export type SRSState = {
   allCards: CardWithHealth[];
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

function shuffleCards(cards: CardWithHealth[]) {
   const shuffled = [...cards];

   for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
   }

   return shuffled;
}

function mergeCards(...lists: CardWithHealth[][]) {
   const map = new Map<string, CardWithHealth>();

   lists.forEach((list) => {
      list.forEach((card) => {
         map.set(card.id, card);
      });
   });

   return Array.from(map.values());
}

function buildGrindQueue(cards: CardWithHealth[], previousCardId?: string | null) {
   const shuffled = shuffleCards(cards);

   if (
      previousCardId &&
      shuffled.length > 1 &&
      shuffled[0]?.id === previousCardId
   ) {
      [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
   }

   return shuffled;
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
            allCards: action.cards,
            practiceQueue: sortedQueue,
            cooldownList: cooldown,
            currentCard: sortedQueue[0] ?? null,
         };
      }

      case "START_PRACTICE":
         if (state.grindMode) {
            const queue = buildGrindQueue(state.allCards);

            return {
               ...state,
               isPracticing: true,
               showBack: false,
               swipeDirection: null,
               practiceQueue: queue,
               cooldownList: [],
               currentCard: queue[0] ?? null,
            };
         }

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

         const updatedAllCards = mergeCards(state.allCards, [updatedCard]);

         if (state.grindMode) {
            const remainingQueue = state.practiceQueue.filter(
               (c) => c.id !== card.id
            );

            if (remainingQueue.length > 0) {
               return {
                  ...state,
                  allCards: updatedAllCards,
                  practiceQueue: remainingQueue,
                  cooldownList: [],
                  currentCard: remainingQueue[0] ?? null,
                  showBack: false,
                  swipeDirection: null,
               };
            }

            const reshuffledQueue = buildGrindQueue(updatedAllCards, card.id);

            return {
               ...state,
               allCards: updatedAllCards,
               practiceQueue: reshuffledQueue,
               cooldownList: [],
               currentCard: reshuffledQueue[0] ?? null,
               showBack: false,
               swipeDirection: null,
            };
         }

         const newCooldown = state.grindMode
            ? state.cooldownList
            : [...state.cooldownList, updatedCard];
         const newQueue = state.practiceQueue.filter((c) => c.id !== card.id);

         return {
            ...state,
            allCards: updatedAllCards,
            practiceQueue: newQueue,
            cooldownList: newCooldown,
            currentCard: newQueue[0] ?? null,
            showBack: false,
            // ✅ FIX: Clear the swipe direction so the next card doesn't repeat the animation
            swipeDirection: null,
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
         return {
            ...state,
            practiceQueue: newQueue,
            cooldownList: stillCooling,
            currentCard: state.isPracticing
               ? state.currentCard &&
                 newQueue.find((c) => c.id === state.currentCard!.id)
                  ? state.currentCard
                  : newQueue[0]
               : null,
         };
      }

      case "SET_GRIND_MODE":
         if (action.value) {
            const mergedCards = mergeCards(
               state.allCards,
               state.practiceQueue,
               state.cooldownList.map((card) => ({
                  ...card,
                  cooldownUntil: null,
               })),
               state.currentCard ? [{ ...state.currentCard, cooldownUntil: null }] : []
            );
            const currentCard =
               state.currentCard &&
               mergedCards.find((card) => card.id === state.currentCard?.id);
            const rest = currentCard
               ? buildGrindQueue(
                    mergedCards.filter((card) => card.id !== currentCard.id),
                    currentCard.id
                 )
               : buildGrindQueue(mergedCards);
            const grindQueue = currentCard ? [currentCard, ...rest] : rest;

            return {
               ...state,
               grindMode: true,
               allCards: mergedCards,
               practiceQueue: grindQueue,
               cooldownList: [],
               currentCard: state.isPracticing
                  ? grindQueue[0] ?? null
                  : state.currentCard,
            };
         }

         return {
            ...state,
            grindMode: false,
            practiceQueue: sortByHealth(
               state.allCards.filter(
                  (card) => !card.cooldownUntil || card.cooldownUntil <= Date.now()
               )
            ),
            cooldownList: state.allCards.filter(
               (card) => card.cooldownUntil && card.cooldownUntil > Date.now()
            ),
            currentCard: state.isPracticing
               ? sortByHealth(
                    state.allCards.filter(
                       (card) =>
                          !card.cooldownUntil || card.cooldownUntil <= Date.now()
                    )
                 )[0] ?? null
               : state.currentCard,
         };

      case "SWIPE":
         return { ...state, swipeDirection: action.direction };

      default:
         return state;
   }
}

export function useSRS(initialCards: CardWithHealth[]) {
   const initial: SRSState = {
      allCards: [],
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
