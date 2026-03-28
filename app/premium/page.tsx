"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import PageShellWithFooter from "@/components/PageShellWithFooter";

const PRICE_TEXT = "40 000 sum";
const CARD_NUMBER = "5614682119563460";
const CARD_HOLDER = "Voxid Eshtaylakov";

export default function PremiumPage() {
   const router = useRouter();
   const [user, setUser] = useState<User | null>(null);
   const [isPremium, setIsPremium] = useState(false);
   const [loading, setLoading] = useState(true);
   const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
   const [copied, setCopied] = useState(false);

   const telegramLink = process.env.NEXT_PUBLIC_TELEGRAM_PAYMENT_URL;

   useEffect(() => {
      async function load() {
         const { data } = await supabase.auth.getUser();

         if (!data.user) {
            router.push("/login");
            return;
         }

         setUser(data.user);

         const premium = await getPremiumStatus(data.user.id);
         setIsPremium(premium);
         setLoading(false);
      }

      void load();
   }, [router]);

   const handleCopyCard = async () => {
      try {
         await navigator.clipboard.writeText(CARD_NUMBER);
         setCopied(true);
         setTimeout(() => setCopied(false), 2000);
      } catch (err) {
         console.error("Failed to copy", err);
      }
   };

   if (loading) {
      return (
         <PageShellWithFooter>
            <main className="min-h-screen bg-slate-950 px-4 text-slate-100">
               <div className="mx-auto flex min-h-screen max-w-md items-center justify-center">
                  <div className="w-full rounded-[2rem] border border-slate-800/80 bg-slate-900/45 px-8 py-10 text-center shadow-[0_24px_80px_rgba(2,6,23,0.38)] backdrop-blur-sm">
                     <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center">
                        <div className="premium-check-orbit relative h-16 w-16">
                           <span className="absolute inset-0 rounded-full border border-emerald-400/20" />
                           <span className="absolute inset-[10px] rounded-full border border-emerald-300/25" />
                           <span className="premium-check-dot absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.75)]" />
                        </div>
                     </div>

                     <p className="text-lg font-semibold text-slate-50">
                        Checking premium status
                     </p>
                     <p className="mt-2 text-sm leading-6 text-slate-400">
                        Just a moment while we confirm your access.
                     </p>
                  </div>
               </div>
            </main>
         </PageShellWithFooter>
      );
   }

   if (isPremium) {
      return (
         <PageShellWithFooter>
            <main className="min-h-screen bg-slate-950 px-4 text-slate-100">
               <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center">
                  <div className="w-full text-center">
                     <div className="mx-auto mb-6 flex h-18 w-18 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 shadow-[0_0_60px_rgba(16,185,129,0.14)]">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-400/15 text-2xl">
                           🎉
                        </div>
                     </div>

                     <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
                        You are already a Premium member
                     </h1>
                     <p className="mx-auto mt-4 max-w-xl text-base leading-8 text-slate-400 md:text-lg">
                        Thank you for supporting the project. You have full access to
                        all premium decks and future updates.
                     </p>
                     <button
                        onClick={() => router.push("/dashboard")}
                        className="mt-8 cursor-pointer rounded-full bg-emerald-500 px-6 py-3 font-medium text-slate-950 transition hover:bg-emerald-400">
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
         <main className="w-full px-4 py-8">
            <div className="mx-auto max-w-4xl space-y-8 py-8">
               <div className="flex items-center justify-between gap-4">
                  <button
                     onClick={() => {
                        if (window.history.length > 1) {
                           router.back();
                        } else {
                           router.push("/dashboard");
                        }
                     }}
                     className="cursor-pointer text-sm text-slate-400 hover:text-slate-200">
                     ← Back
                  </button>

                  {user && (
                     <button
                        onClick={() => router.push("/dashboard")}
                        className="cursor-pointer rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">
                        Dashboard
                     </button>
                  )}
               </div>

               <section className="space-y-4">
                  <p className="text-xs font-semibold tracking-wide text-amber-400">
                     PREMIUM ACCESS
                  </p>
                  <h1 className="text-3xl font-bold md:text-4xl">
                     Get access to all IELTS CDI Mock exams, Vocabulary decks
                     and more!
                  </h1>

                  <div className="mt-4 space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:p-5">
                     <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                        Premium features include
                     </h2>
                     <ul className="space-y-2 text-sm text-slate-200">
                        <li className="flex gap-2">
                           <span className="mt-0.5 text-emerald-400">✔</span>
                           <div>
                              <p className="font-medium">
                                 Advanced decks unlocked
                              </p>
                              <p className="text-xs text-slate-400">
                                 All premium vocabulary decks open immediately
                                 for unlimited practice.
                              </p>
                           </div>
                        </li>
                        <li className="flex gap-2">
                           <span className="mt-0.5 text-emerald-400">✔</span>
                           <div>
                              <p className="font-medium">New content first</p>
                              <p className="text-xs text-slate-400">
                                 Future reading, listening, and mock practice
                                 sets are released to Premium members first.
                              </p>
                           </div>
                        </li>
                        <li className="flex gap-2">
                           <span className="mt-0.5 text-emerald-400">✔</span>
                           <div>
                              <p className="font-medium">Reading Articles</p>
                              <p className="text-xs text-slate-400">
                                 Access to extra challenges and marathons is
                                 included at no extra cost.
                              </p>
                           </div>
                        </li>
                     </ul>
                  </div>
               </section>

               <section className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:flex-row md:items-center md:justify-between md:p-6">
                  <div className="space-y-2">
                     <p className="text-xs font-semibold uppercase text-slate-400">
                        Pricing
                     </p>

                     <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold">{PRICE_TEXT}</p>
                        <span className="text-xs text-slate-500">
                           Lifetime Subscription!
                        </span>
                     </div>
                  </div>

                  <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row">
                     <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="flex-1 cursor-pointer rounded-full bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 md:flex-none">
                        Get Premium Access
                     </button>
                  </div>
               </section>
            </div>

            {isPaymentModalOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                  <div className="relative w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-xl md:p-6">
                     <button
                        onClick={() => setIsPaymentModalOpen(false)}
                        className="absolute right-4 top-4 cursor-pointer text-sm text-slate-500 hover:text-slate-200"
                        aria-label="Close payment modal">
                        ✕
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
