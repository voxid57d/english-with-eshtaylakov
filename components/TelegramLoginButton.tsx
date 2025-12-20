"use client";

import { useEffect, useRef, useState } from "react";

export default function TelegramLoginButton() {
   const containerRef = useRef<HTMLDivElement | null>(null);
   const [error, setError] = useState<string | null>(null);

   const BOT_USERNAME = "talktimeloginbot"; // without "@"

   useEffect(() => {
      (window as any).onTelegramAuth = async (user: any) => {
         try {
            setError(null);

            const res = await fetch("/api/auth/telegram", {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify(user),
            });

            const data = await res.json();

            if (!res.ok) {
               setError(data?.error || "Telegram login failed.");
               return;
            }

            // Redirect to Supabase action_link to complete sign-in
            window.location.href = data.action_link;
         } catch {
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

      return () => {
         delete (window as any).onTelegramAuth;
      };
   }, []);

   return (
      <div className="w-full">
         <div ref={containerRef} />
         {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
   );
}
