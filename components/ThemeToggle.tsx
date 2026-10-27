"use client";

import { useSyncExternalStore } from "react";
import { PiMoonLight, PiSunLight } from "react-icons/pi";

type ThemeMode = "dark" | "light";

function getInitialTheme(): ThemeMode {
   if (typeof window === "undefined") return "dark";
   return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribe(onChange: () => void) {
   const onStorage = (event: StorageEvent) => {
      if (event.key !== "theme-mode" && event.key !== null) return;
      document.documentElement.dataset.theme = event.newValue === "light" ? "light" : "dark";
      onChange();
   };
   window.addEventListener("storage", onStorage);
   window.addEventListener("theme-change", onChange);
   return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("theme-change", onChange);
   };
}

export default function ThemeToggle() {
   const theme = useSyncExternalStore(subscribe, getInitialTheme, () => null);

   const toggleTheme = () => {
      if (!theme) return;
      const nextTheme = theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      window.dispatchEvent(new Event("theme-change"));
      try {
         window.localStorage.setItem("theme-mode", nextTheme);
      } catch {
         // Theme switching still works when browser storage is unavailable.
      }
   };

   if (!theme) return null;

   return (
      <button
         type="button"
         onClick={toggleTheme}
         className="theme-toggle fixed bottom-4 right-4 z-[70] inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-700 bg-slate-900/95 text-slate-100 shadow-xl shadow-black/30 transition hover:border-emerald-400 hover:text-emerald-200"
         aria-label={theme === "dark" ? "Switch to day mode" : "Switch to night mode"}
         title={theme === "dark" ? "Day mode" : "Night mode"}>
         {theme === "dark" ? <PiSunLight size={21} /> : <PiMoonLight size={21} />}
      </button>
   );
}
