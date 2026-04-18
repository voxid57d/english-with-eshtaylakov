"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import PageShellWithFooter from "@/components/PageShellWithFooter";

const LIFETIME_MESSAGES = [
   "Faqat bir marta to‘lang, abadiy foydalaning.",
   "Заплатите один раз — пользуйтесь вечно.",
   "한 번만 결제하고 영원히 사용하세요.",
   "一度だけ支払って、ずっと使えます。",
   "Payez une seule fois, utilisez pour toujours.",
   "ادفع مرة واحدة، واستخدمه إلى الأبد.",
   "Pay only once, use forever.",
] as const;
const PRICE_TEXT = "40 000 sum";
const CARD_NUMBER = "5614682119563460";
const CARD_HOLDER = "Voxid Eshtaylakov";
const PREMIUM_FEATURES = [
   "Vocabulary practice",
   "IELTS Mock exams",
   "New content first",
] as const;

export default function PremiumPage() {
   const router = useRouter();
   const [user, setUser] = useState<User | null>(null);
   const [isPremium, setIsPremium] = useState(false);
   const [loading, setLoading] = useState(true);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
   const [copied, setCopied] = useState(false);

   const telegramLink = process.env.NEXT_PUBLIC_TELEGRAM_PAYMENT_URL;

   const [messageIndex, setMessageIndex] = useState(0);
   const [isMessageVisible, setIsMessageVisible] = useState(true);

   useEffect(() => {
      const interval = window.setInterval(() => {
         setIsMessageVisible(false);

         window.setTimeout(() => {
            setMessageIndex((prev) => (prev + 1) % LIFETIME_MESSAGES.length);
            setIsMessageVisible(true);
         }, 450);
      }, 2600);

      return () => window.clearInterval(interval);
   }, []);

   useEffect(() => {
      let cancelled = false;

      async function load() {
         const { data } = await supabase.auth.getUser();

         if (!data.user) {
            router.push("/login");
            return;
         }

         if (cancelled) return;
         setUser(data.user);

         const premium = await getPremiumStatus(data.user.id);

         if (cancelled) return;
         setIsPremium(premium);
         setLoading(false);
      }

      void load();

      return () => {
         cancelled = true;
      };
   }, [router]);

   const handleCopyCard = async () => {
      try {
         await navigator.clipboard.writeText(CARD_NUMBER);
         setCopied(true);
         window.setTimeout(() => setCopied(false), 2000);
      } catch (err) {
         console.error("Failed to copy", err);
      }
   };

   if (loading) {
      return (
         <PageShellWithFooter>
            <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
               <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
                  <div className="w-full rounded-[2rem] border border-slate-800 bg-slate-900/70 p-8">
                     <p className="text-center text-sm text-slate-400">
                        Checking premium status...
                     </p>
                     <div className="mt-5 h-11 rounded-full bg-slate-800 skeleton-shimmer" />
                     <div className="mt-3 h-28 rounded-3xl bg-slate-900 skeleton-shimmer" />
                     <div className="mt-6 h-36 rounded-3xl bg-slate-900 skeleton-shimmer" />
                  </div>
               </div>
            </main>
         </PageShellWithFooter>
      );
   }

   if (isPremium) {
      return (
         <PageShellWithFooter>
            <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100">
               <div className="mx-auto flex min-h-screen max-w-xl items-center justify-center">
                  <div className="w-full rounded-[2rem] border border-slate-800 bg-slate-900/70 p-8 text-center">
                     <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                        Premium active
                     </p>
                     <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 md:text-4xl">
                        You already have Premium access.
                     </h1>
                     <p className="mt-4 text-base leading-7 text-slate-400">
                        All premium decks and future premium content are
                        unlocked on your account.
                     </p>
                     <button
                        onClick={() => router.push("/dashboard")}
                        className="mt-8 cursor-pointer rounded-full border border-emerald-400/30 bg-emerald-500/90 px-6 py-3 font-medium text-slate-950 transition hover:bg-emerald-400">
                        Go to dashboard
                     </button>
                  </div>
               </div>
            </main>
         </PageShellWithFooter>
      );
   }

   return (
      <PageShellWithFooter>
         <main className="bg-slate-950 px-4 py-4">
            <div className="mx-auto flex justify-center">
               <div className="mx-auto w-full max-w-md space-y-6">
                  <div className="flex items-center justify-between gap-4">
                     <button
                        onClick={() => {
                           if (window.history.length > 1) {
                              router.back();
                           } else {
                              router.push("/dashboard");
                           }
                        }}
                        className="cursor-pointer text-sm text-slate-400 transition hover:text-slate-200">
                        ← Back
                     </button>

                     {user && (
                        <button
                           onClick={() => router.push("/dashboard")}
                           className="cursor-pointer rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200 transition hover:bg-slate-800">
                           Dashboard
                        </button>
                     )}
                  </div>

                  <section className="space-y-4">
                     <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">
                        Premium access
                     </p>

                     <div className="space-y-4 rounded-[2rem] border border-slate-800 bg-slate-900/70 p-5">
                        <h2 className="text-lg font-semibold text-emerald-300">
                           Premium features include
                        </h2>
                        <ul className="space-y-3 text-sm text-slate-100">
                           {PREMIUM_FEATURES.map((feature) => (
                              <li
                                 key={feature}
                                 className="flex items-center gap-3">
                                 <span className="text-base font-semibold text-emerald-400">
                                    ✓
                                 </span>
                                 <span className="font-medium">{feature}</span>
                              </li>
                           ))}
                        </ul>
                     </div>
                  </section>

                  <section className="rounded-[2rem] border border-slate-800 bg-slate-900/80 p-5">
                     <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                           Pricing
                        </p>

                        <div className="flex flex-wrap items-baseline gap-2">
                           <p className="text-3xl font-bold text-slate-50">
                              {PRICE_TEXT}
                           </p>
                           <span className="text-sm text-slate-500">
                              Lifetime Subscription!
                           </span>
                        </div>
                     </div>

                     <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="mt-6 w-full cursor-pointer rounded-full bg-emerald-500 px-5 py-3 text-base font-semibold text-slate-950 transition hover:bg-emerald-400">
                        Get Premium Access
                     </button>
                  </section>

                  <section className="relative flex min-h-[150px] items-center justify-center overflow-hidden px-4 text-center">
                     <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-20 w-20 rounded-full bg-emerald-500/10 blur-2xl" />
                     </div>

                     <div
                        className={`relative max-w-sm transition-all duration-500 ease-out ${
                           isMessageVisible
                              ? "translate-y-0 scale-100 opacity-100"
                              : "translate-y-2 scale-95 opacity-0"
                        }`}>
                        <p
                           className="text-lg font-semibold leading-relaxed tracking-[0.02em] text-slate-100 md:text-xl"
                           dir={messageIndex === 5 ? "rtl" : "ltr"}>
                           {LIFETIME_MESSAGES[messageIndex]}
                        </p>
                     </div>
                  </section>
               </div>
            </div>

            {isPaymentModalOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                  <div className="relative w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl md:p-6">
                     <button
                        onClick={() => setIsPaymentModalOpen(false)}
                        className="absolute right-4 top-4 cursor-pointer text-sm text-slate-500 hover:text-slate-200"
                        aria-label="Close payment modal">
                        ×
                     </button>

                     <h2 className="text-lg font-semibold">
                        Premium Access Payment
                     </h2>
                     <p className="text-sm text-slate-300">
                        Send <span className="font-semibold">{PRICE_TEXT}</span>{" "}
                        to the card below, then share the receipt on Telegram.
                     </p>

                     <div className="space-y-2 rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-4">
                        <p className="text-xs uppercase text-slate-400">
                           Card Number
                        </p>
                        <p className="text-lg font-mono tracking-[0.25em]">
                           {CARD_NUMBER.replace(/(.{4})/g, "$1 ")}
                        </p>
                        <p className="text-xs text-slate-400">{CARD_HOLDER}</p>

                        <button
                           onClick={handleCopyCard}
                           className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-100 transition hover:bg-slate-800">
                           {copied ? "Copied!" : "Copy number"}
                        </button>
                     </div>

                     <div className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                        <p>
                           After you transfer the payment, send the receipt
                           screenshot and your email or username to our Telegram
                           account.
                        </p>
                        <p>
                           We&apos;ll activate your Premium access within a few
                           minutes.
                        </p>
                     </div>

                     <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                        <button
                           onClick={() => setIsPaymentModalOpen(false)}
                           className="flex-1 cursor-pointer rounded-full border border-slate-700 px-4 py-2.5 text-sm text-slate-100 transition hover:bg-slate-800">
                           Close
                        </button>

                        {telegramLink && (
                           <a
                              href={telegramLink}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 cursor-pointer rounded-full bg-emerald-500 px-4 py-2.5 text-center text-sm font-medium text-slate-950 transition hover:bg-emerald-400">
                              Open Telegram
                           </a>
                        )}
                     </div>
                  </div>
               </div>
            )}
         </main>
      </PageShellWithFooter>
   );
}
