"use client";

import { useEffect, useRef, useState } from "react";

type TelegramAuthUser = {
   id: number;
   first_name?: string;
   last_name?: string;
   username?: string;
   photo_url?: string;
   auth_date: number;
   hash: string;
};

declare global {
   interface Window {
      onTelegramAuth?: (user: TelegramAuthUser) => Promise<void>;
   }
}

export default function TelegramLoginButton() {
   const containerRef = useRef<HTMLDivElement | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [isLaunchingTelegram, setIsLaunchingTelegram] = useState(false);
   const [isFinishingTelegramLogin, setIsFinishingTelegramLogin] =
      useState(false);

   const BOT_USERNAME = "talktimeloginbot"; // without "@"

   useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let launchHintTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const clearPendingTimeout = () => {
         if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
         }
      };

      const clearLaunchHintTimeout = () => {
         if (launchHintTimeoutId) {
            clearTimeout(launchHintTimeoutId);
            launchHintTimeoutId = null;
         }
      };

      const startLaunchHint = () => {
         setError(null);
         setIsLaunchingTelegram(true);
         clearLaunchHintTimeout();

         // Hide the hint if Telegram never calls back.
         launchHintTimeoutId = setTimeout(() => {
            setIsLaunchingTelegram(false);
         }, 5000);
      };

      const startFinishingState = () => {
         setError(null);
         setIsLaunchingTelegram(false);
         setIsFinishingTelegramLogin(true);
         clearLaunchHintTimeout();
         clearPendingTimeout();

         // Recover if the final login handoff stalls after Telegram auth succeeds.
         timeoutId = setTimeout(() => {
            setIsFinishingTelegramLogin(false);
            setError("Telegram confirmation timed out. Please try again.");
         }, 30000);
      };

      window.onTelegramAuth = async (user: TelegramAuthUser) => {
         try {
            startFinishingState();

            const res = await fetch("/api/auth/telegram", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify(user),
            });

            const data = await res.json();

            if (!res.ok) {
               clearPendingTimeout();
               setIsFinishingTelegramLogin(false);
               setError(data?.error || "Telegram login failed.");
               return;
            }

            // Redirect to Supabase action_link to complete sign-in
            window.location.href = data.action_link;
         } catch {
            clearPendingTimeout();
            setIsFinishingTelegramLogin(false);
            setError("Network error. Please try again.");
         }
      };

      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.async = true;

      script.setAttribute("data-telegram-login", BOT_USERNAME);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-userpic", "true");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");

      if (containerRef.current) {
         containerRef.current.innerHTML = "";
         containerRef.current.appendChild(script);
      }

      const handleWidgetClick = () => {
         startLaunchHint();
      };

      const container = containerRef.current;
      container?.addEventListener("click", handleWidgetClick, true);

      return () => {
         clearPendingTimeout();
         clearLaunchHintTimeout();
         container?.removeEventListener("click", handleWidgetClick, true);
         delete window.onTelegramAuth;
      };
   }, []);

   return (
      <>
         {isFinishingTelegramLogin && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 px-6 text-center">
               <div className="max-w-sm space-y-4 rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-sky-400" />
                  <div className="space-y-2">
                     <p className="text-lg font-semibold leading-relaxed text-white">
                        Signing you in. Please don&apos;t refresh the page.
                     </p>
                  </div>
               </div>
            </div>
         )}

         <div className="w-full flex flex-col items-center">
            {/* Centering wrapper */}
            <div className="flex justify-center w-full">
               <div ref={containerRef} className="telegram-login-wrapper" />
            </div>

            {isLaunchingTelegram && !isFinishingTelegramLogin && (
               <p className="mt-2 text-xs text-slate-400 text-center">
                  Opening Telegram...
               </p>
            )}

            {error && (
               <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
            )}
         </div>
      </>
   );
}
