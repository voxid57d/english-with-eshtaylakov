"use client";

import { useEffect, useState } from "react";
import { PiMoonLight, PiSunLight } from "react-icons/pi";

type ThemeMode = "dark" | "light";

function getInitialTheme(): ThemeMode {
   if (typeof window === "undefined") return "dark";
   const savedTheme = window.localStorage.getItem("theme-mode");
   return savedTheme === "light" ? "light" : "dark";
}

export default function ThemeToggle() {
   const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

   useEffect(() => {
      document.documentElement.dataset.theme = theme;
   }, [theme]);

   const toggleTheme = () => {
      const nextTheme = theme === "dark" ? "light" : "dark";
      setTheme(nextTheme);
      document.documentElement.dataset.theme = nextTheme;
      window.localStorage.setItem("theme-mode", nextTheme);
   };

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
