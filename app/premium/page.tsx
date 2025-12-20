"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getPremiumStatus } from "@/lib/premium";
import PageShellWithFooter from "@/components/PageShellWithFooter";

// You can edit these values:
const PRICE_TEXT = "40 000 sum";
const CARD_NUMBER = "5614682119563460";
const CARD_HOLDER = "Voxid Eshtaylakov";

export default function PremiumPage() {
   const router = useRouter();
   const [user, setUser] = useState<any>(null);
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

      load();
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
            <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
               Checking premium status…
            </main>
         </PageShellWithFooter>
      );
   }

   if (isPremium) {
      return (
         <PageShellWithFooter>
            <main className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 px-4">
               <h1 className="text-3xl font-semibold mb-2">
                  You are already a Premium member 🎉
               </h1>
               <p className="text-slate-400 mb-6 text-center max-w-md">
                  Thank you for supporting the project. You have full access to
                  all premium decks and future updates.
               </p>
               <button
                  onClick={() => router.push("/dashboard")}
                  className="cursor-pointer px-6 py-3 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium transition">
                  Go to dashboard
               </button>
            </main>
         </PageShellWithFooter>
      );
   }

   return (
      <PageShellWithFooter>
         <main className="w-full px-4 py-8">
            <div className="max-w-4xl mx-auto py-8 space-y-8">
               {/* Top bar */}
               <div className="flex items-center justify-between gap-4">
                  <button
                     onClick={() => {
                        if (window.history.length > 1) {
                           router.back();
                        } else {
                           router.push("/dashboard");
                        }
                     }}
                     className="text-sm text-slate-400 hover:text-slate-200 cursor-pointer">
                     ← Back
                  </button>

                  {user && (
                     <button
                        onClick={() => router.push("/dashboard")}
                        className="px-3 py-1.5 rounded-full border border-slate-700 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">
                        Dashboard
                     </button>
                  )}
               </div>

               {/* Heading & benefits */}
               <section className="space-y-4">
                  <p className="text-xs font-semibold text-amber-400 tracking-wide">
                     PREMIUM ACCESS
                  </p>
                  <h1 className="text-3xl md:text-4xl font-bold">
                     Get access to all IELTS CDI Mock exams, Vocabulary decks
                     and more!
                  </h1>

                  <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4 md:p-5 space-y-3">
                     <h2 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                        Premium features include
                     </h2>
                     <ul className="space-y-2 text-sm text-slate-200">
                        <li className="flex gap-2">
                           <span className="text-emerald-400 mt-0.5">✔</span>
                           <div>
                              <p className="font-medium">
                                 Advanced decks unlocked
                              </p>
                              <p className="text-slate-400 text-xs">
                                 All premium vocabulary decks open immediately
                                 for unlimited practice.
                              </p>
                           </div>
                        </li>
                        <li className="flex gap-2">
                           <span className="text-emerald-400 mt-0.5">✔</span>
                           <div>
                              <p className="font-medium">New content first</p>
                              <p className="text-slate-400 text-xs">
                                 Future reading, listening, and MOCK practice
                                 sets are released to Premium members first.
                              </p>
                           </div>
                        </li>
                        <li className="flex gap-2">
                           <span className="text-emerald-400 mt-0.5">✔</span>
                           <div>
                              <p className="font-medium">Reading Articles</p>
                              <p className="text-slate-400 text-xs">
                                 Access to extra challenges and marathons is
                                 included at no extra cost.
                              </p>
                           </div>
                        </li>
                     </ul>
                  </div>
               </section>

               {/* Pricing section */}
               <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 md:p-6 flex flex-col md:flex-row gap-6 md:items-center md:justify-between">
                  <div className="space-y-2">
                     <p className="text-xs font-semibold text-slate-400 uppercase">
                        Pricing
                     </p>

                     <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold">{PRICE_TEXT}</p>
                        <span className="text-xs text-slate-500">
                           Lifetime Subscription!
                        </span>
                     </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                     <button
                        onClick={() => setIsPaymentModalOpen(true)}
                        className="flex-1 sm:flex-none px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-medium cursor-pointer transition">
                        Get Premium Access
                     </button>
                  </div>
               </section>
            </div>

            {/* Payment modal */}
            {isPaymentModalOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                  <div className="w-full max-w-md rounded-2xl bg-slate-950 border border-slate-800 p-5 md:p-6 space-y-4 shadow-xl relative">
                     <button
                        onClick={() => setIsPaymentModalOpen(false)}
                        className="absolute right-4 top-4 text-slate-500 hover:text-slate-200 text-sm cursor-pointer"
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

                     <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-4 space-y-2">
                        <p className="text-xs uppercase text-slate-400">
                           Card Number
                        </p>
                        <p className="text-lg tracking-[0.25em] font-mono">
                           {CARD_NUMBER.replace(/(.{4})/g, "$1 ")}
                        </p>
                        <p className="text-xs text-slate-400">{CARD_HOLDER}</p>

                        <button
                           onClick={handleCopyCard}
                           className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-700 hover:bg-slate-800 text-xs text-slate-100 cursor-pointer transition">
                           {copied ? "Copied!" : "Copy number"}
                        </button>
                     </div>

                     <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-100 space-y-1">
                        <p>
                           After you transfer the payment, send the receipt
                           screenshot + your email/username to our Telegram
                           account.
                        </p>
                        <p>
                           We’ll activate your Premium access within a few
                           minutes.
                        </p>
                     </div>

                     <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                           onClick={() => setIsPaymentModalOpen(false)}
                           className="flex-1 px-4 py-2.5 rounded-full border border-slate-700 hover:bg-slate-800 text-sm text-slate-100 cursor-pointer transition">
                           Close
                        </button>

                        {telegramLink && (
                           <a
                              href={telegramLink}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 px-4 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-sm text-slate-950 text-center font-medium cursor-pointer transition">
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
