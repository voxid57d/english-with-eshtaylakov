"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
   PiBookOpenTextLight,
   PiReadCvLogoLight,
   PiHeadphonesLight,
   PiExamLight,
   PiTrophyLight,
   PiSwordLight,
   PiCrownSimpleLight,
   PiCaretDoubleLeftLight,
   PiCaretDoubleRightLight,
} from "react-icons/pi";

const links = [
   {
      href: "/dashboard/vocabulary",
      label: "Vocabulary",
      icon: PiBookOpenTextLight,
   },
   {
      href: "/dashboard/reading",
      label: "Reading",
      icon: PiReadCvLogoLight,
   },
   {
      href: "/dashboard/listening",
      label: "Listening",
      icon: PiHeadphonesLight,
   },
   {
      href: "/dashboard/mock",
      label: "Mock tests",
      icon: PiExamLight,
   },
   {
      href: "/dashboard/leaderboard",
      label: "Leaderboard",
      icon: PiTrophyLight,
   },
   {
      href: "/dashboard/battle",
      label: "Battle",
      icon: PiSwordLight,
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

export default function Sidebar({
   isOpenOnMobile,
   closeMobile,
   isPremium,
}: SidebarProps) {
   const pathname = usePathname();
   const [collapsed, setCollapsed] = useState(false);

   const navLinks = (
      // ⬇️ removed mt-4 here
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
                     "group relative flex items-center w-full",
                     collapsed ? "justify-center" : "gap-3",
                     "px-3 py-3 rounded-xl text-base font-medium",
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
                           ? "opacity-0 w-0 overflow-hidden"
                           : "opacity-100 ml-2"
                     }`}>
                     {link.label}
                  </span>

                  {!collapsed && (
                     <span
                        className={[
                           "text-xs opacity-0 translate-x-[-4px]",
                           "group-hover:opacity-100 group-hover:translate-x-0",
                           "transition-all duration-200 text-slate-300",
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
                  You are premium user
               </span>
            </div>
         )}
      </nav>
   );

   return (
      <>
         {/* Desktop sidebar */}
         <aside
            className={[
               "hidden md:flex flex-col bg-slate-950 border-r border-slate-800 p-4",
               "transition-all duration-200 ease-out",
               collapsed ? "w-20 items-center" : "w-64",
            ].join(" ")}>
            {/* MENU row */}
            <button
               onClick={() => setCollapsed((v) => !v)}
               className="mb-2 flex items-center justify-between w-full text-xs text-slate-400 hover:text-slate-100 cursor-pointer transition-colors">
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

         {/* Mobile overlay (unchanged, uses same navLinks) */}
         <div
            className={`
               fixed inset-0 z-40 md:hidden
               transition-opacity duration-300
               ${
                  isOpenOnMobile
                     ? "opacity-100 pointer-events-auto"
                     : "opacity-0 pointer-events-none"
               }
            `}>
            <div
               className="absolute inset-0 bg-black/60 backdrop-blur-sm"
               onClick={closeMobile}
            />

            <aside
               className={`
                  relative z-50 w-64 h-full bg-slate-950 border-r border-slate-800 p-6
                  shadow-2xl shadow-black/60
                  transform transition-transform duration-300
                  ${isOpenOnMobile ? "translate-x-0" : "-translate-x-full"}
               `}>
               <button
                  onClick={closeMobile}
                  className="mb-4 text-sm text-slate-400 hover:text-slate-200 cursor-pointer transition-colors">
                  ✕ Close
               </button>
               {navLinks}
            </aside>
         </div>
      </>
   );
}
