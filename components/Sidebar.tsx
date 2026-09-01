"use client";

import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
   PiBriefcaseLight,
   PiCalendarCheckLight,
   PiCaretDoubleLeftLight,
   PiCaretDoubleRightLight,
   PiChartLineUpLight,
   PiGaugeLight,
   PiGearSixLight,
   PiMapPinLineLight,
   PiStudentLight,
   PiTargetLight,
   PiUsersThreeLight,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type ErpModule =
   | "overview"
   | "branches"
   | "staff"
   | "tasks"
   | "kpi"
   | "shifts"
   | "teachers"
   | "metrics"
   | "settings";

type SidebarLink = {
   href: string;
   label: string;
   icon: IconType;
   module: ErpModule;
   children?: Array<{
      href: string;
      label: string;
      section: string;
   }>;
};

const links: SidebarLink[] = [
   { href: "/dashboard", label: "Overview", icon: PiGaugeLight, module: "overview" },
   { href: "/dashboard/tasks", label: "Tasks", icon: PiCalendarCheckLight, module: "tasks" },
   { href: "/dashboard/kpi", label: "KPI", icon: PiTargetLight, module: "kpi" },
   { href: "/dashboard/shifts", label: "Shifts", icon: PiBriefcaseLight, module: "shifts" },
   {
      href: "/dashboard/teachers?section=lessons",
      label: "Teachers",
      icon: PiStudentLight,
      module: "teachers",
      children: [
         { href: "/dashboard/teachers?section=lessons", label: "Lessons", section: "lessons" },
         { href: "/dashboard/teachers?section=covers", label: "Covers", section: "covers" },
      ],
   },
   { href: "/dashboard/metrics", label: "Metrics", icon: PiChartLineUpLight, module: "metrics" },
   { href: "/dashboard/staff", label: "Staff", icon: PiUsersThreeLight, module: "staff" },
   { href: "/dashboard/branches", label: "Branches", icon: PiMapPinLineLight, module: "branches" },
   { href: "/dashboard/settings", label: "Settings", icon: PiGearSixLight, module: "settings" },
];

type SidebarProps = {
   isOpenOnMobile: boolean;
   closeMobile: () => void;
   isPremium?: boolean;
};

function CollapsedTooltip({ label }: { label: string }) {
   return (
      <span className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 z-20 -translate-y-1/2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-950/95 px-3 py-1.5 text-xs font-medium text-slate-100 opacity-0 shadow-xl shadow-black/30 transition-all duration-200 group-hover:opacity-100">
         {label}
      </span>
   );
}

function Sidebar({ isOpenOnMobile, closeMobile }: SidebarProps) {
   const pathname = usePathname();
   const searchParams = useSearchParams();
   const [collapsed, setCollapsed] = useState(false);
   const [visibleModules, setVisibleModules] = useState<Set<ErpModule> | null>(null);

   useEffect(() => {
      let isActive = true;

      async function loadPermissions() {
         try {
            const token = await getSupabaseAccessToken();
            const response = await fetch("/api/erp/me", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            });
            const payload = await response.json();

            if (!response.ok) {
               throw new Error(payload.error || "Failed to load Amir Temur permissions.");
            }

            if (!isActive) return;

            const modules = Object.entries(payload.permissions || {})
               .filter(([, actions]) => Array.isArray(actions) && actions.includes("view"))
               .map(([module]) => module as ErpModule);
            setVisibleModules(new Set(modules));
         } catch (error) {
            console.error("Failed to load Amir Temur sidebar permissions:", error);
            if (isActive) {
               setVisibleModules(new Set(["overview", "tasks"]));
            }
         }
      }

      void loadPermissions();

      return () => {
         isActive = false;
      };
   }, []);

   const filteredLinks = visibleModules
      ? links.filter((link) => visibleModules.has(link.module))
      : links;

   const navLinks = (
      <nav className={collapsed ? "space-y-2" : "space-y-2"}>
         {filteredLinks.map((link) => {
            const linkPath = link.href.split("?")[0];
            const isActive =
               linkPath === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(linkPath);
            const Icon = link.icon;
            const activeSection = searchParams.get("section") || "lessons";

            if (collapsed) {
               return (
                  <div key={link.href} className="group relative flex justify-center">
                     <Link
                        href={link.href}
                        onClick={closeMobile}
                        aria-label={link.label}
                        className={[
                           "relative flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-200",
                           isActive
                              ? "border-emerald-400/35 bg-emerald-500/15 text-white"
                              : "border-slate-800 bg-slate-900/40 text-slate-400 hover:border-slate-700 hover:bg-slate-900 hover:text-white",
                        ].join(" ")}>
                        <Icon size={19} />
                     </Link>
                     {link.children ? (
                        <div className="pointer-events-none absolute left-full top-1/2 z-30 -translate-y-1/2 pl-3 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:opacity-100">
                           <div className="min-w-36 rounded-lg border border-slate-700 bg-slate-950/95 p-1 shadow-xl shadow-black/30">
                              <p className="px-2 py-1 text-xs font-medium text-slate-500">{link.label}</p>
                              {link.children.map((child) => (
                                 <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={closeMobile}
                                    className={[
                                       "block rounded-md px-3 py-2 text-sm transition",
                                       pathname === "/dashboard/teachers" && activeSection === child.section
                                          ? "bg-emerald-500 text-slate-950"
                                          : "text-slate-300 hover:bg-slate-900 hover:text-white",
                                    ].join(" ")}>
                                    {child.label}
                                 </Link>
                              ))}
                           </div>
                        </div>
                     ) : (
                        <CollapsedTooltip label={link.label} />
                     )}
                  </div>
               );
            }

            return (
               <div key={link.href} className="group relative">
                  <Link
                     href={link.href}
                     onClick={closeMobile}
                     className={[
                        "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200",
                        isActive
                           ? "bg-emerald-600/90 text-white shadow-md shadow-emerald-950/30"
                           : "text-slate-300 hover:bg-slate-900 hover:text-white",
                     ].join(" ")}>
                     <Icon
                        size={21}
                        className={isActive ? "text-white" : "text-slate-400 group-hover:text-white"}
                     />
                     <span className="min-w-0 flex-1 truncate">{link.label}</span>
                  </Link>
                  {link.children && (
                     <div className="absolute left-full top-0 z-30 hidden pl-2 group-hover:block">
                        <div className="min-w-40 rounded-lg border border-slate-700 bg-slate-950/95 p-1 shadow-xl shadow-black/30">
                           {link.children.map((child) => (
                              <Link
                                 key={child.href}
                                 href={child.href}
                                 onClick={closeMobile}
                                 className={[
                                    "block rounded-md px-3 py-2 text-sm transition",
                                    pathname === "/dashboard/teachers" && activeSection === child.section
                                       ? "bg-emerald-500 text-slate-950"
                                       : "text-slate-300 hover:bg-slate-900 hover:text-white",
                                 ].join(" ")}>
                                 {child.label}
                              </Link>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
            );
         })}
      </nav>
   );

   return (
      <>
         <aside
            className={[
               "hidden border-r border-slate-800 bg-slate-950 md:flex md:flex-col",
               "transition-all duration-200 ease-out",
               collapsed ? "w-[72px] items-center px-2 py-3" : "w-64 p-4",
            ].join(" ")}>
            <div
               className={[
                  "mb-3 flex w-full border-b border-slate-800/80 pb-3",
                  collapsed ? "justify-center" : "items-center justify-between",
               ].join(" ")}>
               {collapsed ? (
                  <div className="group relative">
                     <button
                        onClick={() => setCollapsed(false)}
                        aria-label="Expand sidebar"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100">
                        <PiCaretDoubleRightLight size={18} />
                     </button>
                     <CollapsedTooltip label="Expand sidebar" />
                  </div>
               ) : (
                  <>
                     <span className="pl-1 text-[13px] uppercase tracking-[0.22em] text-slate-500">
                        Amir Temur
                     </span>
                     <button
                        onClick={() => setCollapsed(true)}
                        aria-label="Collapse sidebar"
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/40 text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-slate-100">
                        <PiCaretDoubleLeftLight size={18} />
                     </button>
                  </>
               )}
            </div>

            <div className="w-full">{navLinks}</div>
         </aside>

         <div
            className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${
               isOpenOnMobile
                  ? "pointer-events-auto opacity-100"
                  : "pointer-events-none opacity-0"
            }`}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeMobile} />

            <aside
               className={`relative z-50 h-full w-64 border-r border-slate-800 bg-slate-950 p-5 shadow-2xl shadow-black/60 transform transition-transform duration-300 ${
                  isOpenOnMobile ? "translate-x-0" : "-translate-x-full"
               }`}>
               <button
                  onClick={closeMobile}
                  className="mb-4 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-900">
                  Close
               </button>
               {navLinks}
            </aside>
         </div>
      </>
   );
}

export default memo(Sidebar);
