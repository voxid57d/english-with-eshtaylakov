"use client";

import { memo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import {
   PiBookOpenTextLight,
   PiReadCvLogoLight,
   PiNotePencilLight,
   PiTrophyLight,
   PiSwordLight,
   PiCrownSimpleLight,
   PiCaretDoubleLeftLight,
   PiCaretDoubleRightLight,
   PiPaperPlaneTiltLight,
} from "react-icons/pi";

const links = [
   {
      href: "/dashboard/vocabulary",
      label: "Vocabulary",
      icon: PiBookOpenTextLight,
   },
   {
      href: "/dashboard/battle",
      label: "Battle",
      icon: PiSwordLight,
   },
   {
      href: "/dashboard/reading",
      label: "Reading",
      icon: PiReadCvLogoLight,
   },
   {
      href: "/dashboard/writing",
      label: "Writing",
      icon: PiNotePencilLight,
      badge: "NEW",
   },
   {
      href: "/dashboard/leaderboard",
      label: "Leaderboard",
      icon: PiTrophyLight,
   },
   {
      href: "/premium",
      label: "Buy Premium",
      icon: PiCrownSimpleLight,
      accent: "premium",
   },
];

type SidebarProps = {
   isOpenOnMobile: boolean;
   closeMobile: () => void;
   isPremium: boolean;
};

function Sidebar({ isOpenOnMobile, closeMobile, isPremium }: SidebarProps) {
   const pathname = usePathname();
   const [collapsed, setCollapsed] = useState(false);
   const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
   const [feedbackMessage, setFeedbackMessage] = useState("");
   const [feedbackError, setFeedbackError] = useState<string | null>(null);
   const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);
   const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

   const openFeedback = () => {
      setCollapsed(false);
      setIsFeedbackOpen(true);
      setFeedbackError(null);
      setFeedbackSuccess(null);
   };

   const handleSubmitFeedback = async () => {
      try {
         setIsSubmittingFeedback(true);
         setFeedbackError(null);
         setFeedbackSuccess(null);

         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/feedback", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               message: feedbackMessage,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to submit feedback.");
         }

         setFeedbackMessage("");
         setIsFeedbackOpen(false);
         setFeedbackSuccess("Thanks, your feedback was sent to the admin panel.");
      } catch (error) {
         setFeedbackError(
            error instanceof Error ? error.message : "Failed to submit feedback."
         );
      } finally {
         setIsSubmittingFeedback(false);
      }
   };

   const feedbackPanel = (
      <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
         <button
            type="button"
            onClick={() => {
               if (collapsed) {
                  openFeedback();
                  return;
               }

               setIsFeedbackOpen((current) => !current);
               setFeedbackError(null);
               setFeedbackSuccess(null);
            }}
            title={collapsed ? "Send me feedback" : undefined}
            className={[
               "flex w-full items-center rounded-xl px-3 py-3 text-left transition",
               collapsed
                  ? "justify-center bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-white"
                  : "gap-3 bg-slate-950 text-slate-200 hover:bg-slate-800",
            ].join(" ")}>
            <PiPaperPlaneTiltLight size={20} className="shrink-0" />
            {!collapsed && (
               <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100">Send me feedback</p>
                  <p className="mt-1 text-xs text-slate-500">
                     Tell us what feels useful, confusing, or missing.
                  </p>
               </div>
            )}
         </button>

         {!collapsed && isFeedbackOpen && (
            <div className="mt-3 space-y-3">
               <textarea
                  value={feedbackMessage}
                  onChange={(event) => setFeedbackMessage(event.target.value)}
                  rows={4}
                  placeholder="Share your feedback here..."
                  className="w-full resize-none rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none focus:border-emerald-500"
               />

               {feedbackError && (
                  <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                     {feedbackError}
                  </p>
               )}

               {feedbackSuccess && (
                  <p className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                     {feedbackSuccess}
                  </p>
               )}

               <div className="flex gap-2">
                  <button
                     type="button"
                     onClick={() => void handleSubmitFeedback()}
                     disabled={isSubmittingFeedback}
                     className="flex-1 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                     {isSubmittingFeedback ? "Submitting..." : "Submit feedback"}
                  </button>
                  <button
                     type="button"
                     onClick={() => {
                        setIsFeedbackOpen(false);
                        setFeedbackError(null);
                     }}
                     className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800">
                     Cancel
                  </button>
               </div>
            </div>
         )}

         {!collapsed && !isFeedbackOpen && feedbackSuccess && (
            <p className="mt-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
               {feedbackSuccess}
            </p>
         )}
      </div>
   );

   const navLinks = (
      <nav className="space-y-3">
         {links
            .filter((link) => !(isPremium && link.accent === "premium"))
            .map((link) => {
               const isActive = pathname.startsWith(link.href);
               const Icon = link.icon;

               return (
                  <Link
                     key={link.href}
                     href={link.href}
                     onClick={closeMobile}
                     title={collapsed ? link.label : undefined}
                     className={[
                        "group relative flex w-full items-center",
                        collapsed ? "justify-center" : "gap-3",
                        "rounded-xl px-3 py-3 text-base font-medium",
                        "transition-all duration-200 ease-out",
                        isActive && link.accent === "premium"
                           ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-900/30"
                           : isActive
                             ? "bg-emerald-600/90 text-white shadow-md shadow-emerald-900/40"
                             : link.accent === "premium"
                               ? "bg-amber-500/15 text-amber-100 hover:bg-amber-500/25 hover:text-white hover:shadow-md hover:shadow-amber-900/20"
                               : "bg-slate-900/60 text-slate-300 hover:bg-slate-800 hover:text-white hover:shadow-md hover:shadow-slate-900/40",
                        "hover:-translate-y-[1px]",
                     ].join(" ")}>
                     <Icon
                        size={22}
                        className={`transition-colors duration-200 ${
                           isActive && link.accent === "premium"
                              ? "text-slate-950"
                              : isActive
                                ? "text-white"
                                : link.accent === "premium"
                                  ? "text-amber-300 group-hover:text-white"
                                  : "text-slate-400 group-hover:text-white"
                        }`}
                     />

                     <span
                        className={`flex-1 whitespace-nowrap transition-all duration-150 ${
                           collapsed
                              ? "w-0 overflow-hidden opacity-0"
                              : "ml-2 opacity-100"
                        }`}>
                        {link.label}
                     </span>

                     {!collapsed && link.badge && (
                        <span className="rounded-full border border-emerald-300/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold tracking-[0.18em] text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.22)]">
                           {link.badge}
                        </span>
                     )}

                     {!collapsed && (
                        <span
                           className={[
                              "translate-x-[-4px] text-xs opacity-0",
                              "text-slate-300 transition-all duration-200",
                              "group-hover:translate-x-0 group-hover:opacity-100",
                           ].join(" ")}>
                           →
                        </span>
                     )}
                  </Link>
               );
            })}

         {isPremium && (
            <div
               className={[
                  "flex items-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-3",
                  collapsed ? "justify-center" : "gap-3",
               ].join(" ")}>
               <PiCrownSimpleLight
                  size={22}
                  className="shrink-0 text-emerald-300"
               />
               <span
                  className={`whitespace-nowrap text-sm font-medium text-emerald-200 transition-all duration-150 ${
                     collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                  }`}>
                  You are a premium user
               </span>
            </div>
         )}

         {feedbackPanel}
      </nav>
   );

   return (
      <>
         <aside
            className={[
               "hidden border-r border-slate-800 bg-slate-950 p-4 md:flex md:flex-col",
               "transition-all duration-200 ease-out",
               collapsed ? "w-20 items-center" : "w-64",
            ].join(" ")}>
            <button
               onClick={() => setCollapsed((value) => !value)}
               className="mb-2 flex w-full items-center justify-between text-xs text-slate-400 transition-colors hover:text-slate-100">
               {collapsed ? (
                  <PiCaretDoubleRightLight size={20} />
               ) : (
                  <>
                     <span className="uppercase tracking-wide">Collapse</span>
                     <PiCaretDoubleLeftLight size={20} />
                  </>
               )}
            </button>

            {navLinks}
         </aside>

         <div
            className={`
               fixed inset-0 z-40 md:hidden
               transition-opacity duration-300
               ${
                  isOpenOnMobile
                     ? "pointer-events-auto opacity-100"
                     : "pointer-events-none opacity-0"
               }
            `}>
            <div
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={closeMobile}
            />

            <aside
               className={`
                  relative z-50 h-full w-64 border-r border-slate-800 bg-slate-950 p-6
                  shadow-2xl shadow-black/60
                  transform transition-transform duration-300
                  ${isOpenOnMobile ? "translate-x-0" : "-translate-x-full"}
               `}>
               <button
                  onClick={closeMobile}
                  className="mb-4 text-sm text-slate-400 transition-colors hover:text-slate-200">
                  ✕ Close
               </button>
               {navLinks}
            </aside>
         </div>
      </>
   );
}

export default memo(Sidebar);
