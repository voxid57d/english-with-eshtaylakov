"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
   PiBriefcaseLight, PiCalendarCheckLight, PiChartLineUpLight,
   PiGaugeLight, PiGearSixLight, PiMapPinLineLight, PiStudentLight,
   PiTargetLight, PiUsersThreeLight, PiCaretDownLight,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { isErpModuleVisible } from "@/lib/erpVisibility";

type ErpModule =
   | "overview"
   | "branches"
   | "staff"
   | "tasks"
   | "kpi"
   | "shifts"
   | "teachers"
   | "metrics"
   | "marketing"
   | "statistics"
   | "settings";

type DashboardLink = {
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

const links: DashboardLink[] = [
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
   { href: "/dashboard/marketing", label: "Marketing metrics", icon: PiChartLineUpLight, module: "marketing" },
   { href: "/dashboard/statistics", label: "Statistics", icon: PiChartLineUpLight, module: "statistics" },
   { href: "/dashboard/staff", label: "Staff", icon: PiUsersThreeLight, module: "staff" },
   { href: "/dashboard/branches", label: "Branches", icon: PiMapPinLineLight, module: "branches" },
   { href: "/dashboard/settings", label: "Settings", icon: PiGearSixLight, module: "settings" },
];

// Temporarily hide these menu entries without changing page access or permissions.
const hiddenMenuModules = new Set<ErpModule>(["tasks", "shifts", "settings", "staff"]);

function DashboardNavigation({ permissions }: { permissions: Record<string, unknown> }) {
   const pathname = usePathname();
   const searchParams = useSearchParams();
   const activeSection = searchParams.get("section") || "lessons";
   const filteredLinks = links.filter((link) => {
      const actions = permissions[link.module];
      return !hiddenMenuModules.has(link.module) && isErpModuleVisible(link.module)
         && Array.isArray(actions) && actions.includes("view");
   });

   return (
      <nav aria-label="Dashboard navigation" className="order-last flex w-full flex-wrap items-center gap-1.5 lg:order-none lg:w-auto lg:flex-1">
         {filteredLinks.map((link) => {
            const linkPath = link.href.split("?")[0];
            const active = linkPath === "/dashboard" ? pathname === linkPath : pathname === linkPath || pathname.startsWith(linkPath + "/");
            const Icon = link.icon;
            const buttonClass = "inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 " +
               (active ? "bg-emerald-600/90 text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white");
            if (link.children) return (
               <details key={link.href} className="group relative">
                  <summary aria-label={link.label} className={buttonClass + " cursor-pointer list-none [&::-webkit-details-marker]:hidden"}>
                     <Icon size={18} aria-hidden="true" /><span>{link.label}</span><PiCaretDownLight size={12} aria-hidden="true" />
                  </summary>
                  <div className="absolute left-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-lg">
                     {link.children.map((child) => (
                        <Link key={child.href} href={child.href}
                           aria-current={active && activeSection === child.section ? "page" : undefined}
                           onClick={(event) => { const details = event.currentTarget.closest("details"); if (details) details.open = false; }}
                           className={"block rounded-md px-3 py-2 text-sm transition " + (active && activeSection === child.section ? "bg-emerald-500/15 text-emerald-300" : "text-slate-300 hover:bg-slate-900")}>
                           {child.label}
                        </Link>
                     ))}
                  </div>
               </details>
            );
            return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={buttonClass}><Icon size={18} aria-hidden="true" /><span>{link.label}</span></Link>;
         })}
      </nav>
   );
}

export default memo(DashboardNavigation);
