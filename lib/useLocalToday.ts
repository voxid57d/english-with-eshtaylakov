"use client";

import { useSyncExternalStore } from "react";
import { getLocalDateString } from "@/lib/localDate";

function subscribe(onChange: () => void) {
   const timer = window.setInterval(onChange, 30_000);
   window.addEventListener("focus", onChange);
   document.addEventListener("visibilitychange", onChange);
   return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
   };
}

export function useLocalToday() {
   return useSyncExternalStore(subscribe, getLocalDateString, getLocalDateString);
}
