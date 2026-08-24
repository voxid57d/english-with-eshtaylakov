"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiArrowRightLight,
   PiBriefcaseLight,
   PiCalendarCheckLight,
   PiChartLineUpLight,
   PiClockLight,
   PiMapPinLineLight,
   PiTargetLight,
   PiUsersThreeLight,
} from "react-icons/pi";
import type { IconType } from "react-icons";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type OverviewSummary = {
   activeBranches: number;
   activeStaff: number;
   activeTasks: number;
   kpiAverage: number;
   kpiTargets: number;
   weeklyShifts: number;
   shiftIssues: number;
   leadsCount: number;
   trialLessonsCount: number;
   conversionsCount: number;
   conversionRate: number;
   revenueAmount: number;
   debtAmount: number;
   attendanceCount: number;
};

type OverviewPayload = {
   periods: {
      month: { periodStart: string; periodEnd: string };
      week: { weekStart: string; weekEnd: string };
   };
   summary: OverviewSummary;
};

type SummaryCard = {
   label: string;
   value: string;
   helper: string;
   icon: IconType;
};

const modules = [
   {
      href: "/dashboard/tasks",
      title: "Tasks",
      description: "Assign recurring work, track completions, and keep comments attached to each occurrence.",
   },
   {
      href: "/dashboard/kpi",
      title: "KPI",
      description: "Define role-based targets for sales, collection, attendance, retention, and branch operations.",
   },
   {
      href: "/dashboard/shifts",
      title: "Shifts",
      description: "Plan schedules for branch managers, sales teams, assistants, and cashiers.",
   },
   {
      href: "/dashboard/metrics",
      title: "Metrics",
      description: "Monitor leads, trials, payments, debts, attendance, and conversion movement.",
   },
];

const setupItems = [
   { href: "/dashboard/branches", label: "Branches", icon: PiMapPinLineLight },
   { href: "/dashboard/staff", label: "Staff", icon: PiUsersThreeLight },
   { href: "/dashboard/kpi", label: "KPI definitions", icon: PiTargetLight },
   { href: "/dashboard/metrics", label: "Daily metrics", icon: PiChartLineUpLight },
];

function formatNumber(value: number) {
   return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function getSummaryCards(payload: OverviewPayload | null): SummaryCard[] {
   const summary = payload?.summary;

   return [
      {
         label: "Active tasks",
         value: formatNumber(summary?.activeTasks ?? 0),
         helper: "Currently active task templates",
         icon: PiCalendarCheckLight,
      },
      {
         label: "KPI progress",
         value: `${summary?.kpiAverage ?? 0}%`,
         helper: `${summary?.kpiTargets ?? 0} current-month targets`,
         icon: PiTargetLight,
      },
      {
         label: "Weekly shifts",
         value: formatNumber(summary?.weeklyShifts ?? 0),
         helper: `${summary?.shiftIssues ?? 0} late or absent`,
         icon: PiClockLight,
      },
      {
         label: "Active staff",
         value: formatNumber(summary?.activeStaff ?? 0),
         helper: `${summary?.activeBranches ?? 0} active branches`,
         icon: PiUsersThreeLight,
      },
   ];
}

export default function OverviewDashboard() {
   const [payload, setPayload] = useState<OverviewPayload | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);

   const loadOverview = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/overview", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
         });
         const data = await response.json();

         if (!response.ok) {
            throw new Error(data.error || "Failed to load Amir Temur overview.");
         }

         setPayload(data);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load Amir Temur overview.",
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void loadOverview();
   }, [loadOverview]);

   const summaryCards = useMemo(() => getSummaryCards(payload), [payload]);
   const summary = payload?.summary;

   return (
      <div className="space-y-6">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Amir Temur
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Administration workspace
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Live overview for branches, staff, tasks, KPI, shifts, and monthly operating metrics.
                  </p>
               </div>

               <button
                  type="button"
                  onClick={() => void loadOverview()}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                  {loading ? "Refreshing..." : "Refresh"}
               </button>
            </div>
         </section>

         {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
               {error}
            </div>
         )}

         <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => {
               const Icon = card.icon;

               return (
                  <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
                     <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-slate-400">{card.label}</p>
                        <Icon className="text-emerald-300" size={22} />
                     </div>
                     <p className="mt-3 text-3xl font-semibold text-white">
                        {loading ? "..." : card.value}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">{card.helper}</p>
                  </div>
               );
            })}
         </section>

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiChartLineUpLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Current month</h2>
               </div>

               <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-sm text-slate-400">Leads</p>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary?.leadsCount ?? 0)}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(summary?.trialLessonsCount ?? 0)} trials
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-sm text-slate-400">Conversion</p>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {summary?.conversionRate ?? 0}%
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(summary?.conversionsCount ?? 0)} conversions
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-sm text-slate-400">Revenue</p>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary?.revenueAmount ?? 0)}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                        {formatNumber(summary?.debtAmount ?? 0)} debt
                     </p>
                  </div>
               </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiBriefcaseLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Setup shortcuts</h2>
               </div>

               <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {setupItems.map((item) => {
                     const Icon = item.icon;

                     return (
                        <Link
                           key={item.href}
                           href={item.href}
                           className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-4 transition hover:border-emerald-500/30 hover:bg-slate-900">
                           <div className="flex items-center gap-3">
                              <Icon className="text-slate-400" size={21} />
                              <span className="text-sm font-medium text-slate-200">{item.label}</span>
                           </div>
                           <PiArrowRightLight className="text-slate-500" size={18} />
                        </Link>
                     );
                  })}
               </div>
            </div>
         </section>

         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex items-center gap-2">
               <PiChartLineUpLight className="text-emerald-300" size={22} />
               <h2 className="text-lg font-semibold text-white">Core modules</h2>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
               {modules.map((module) => (
                  <Link
                     key={module.href}
                     href={module.href}
                     className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 transition hover:border-emerald-500/30 hover:bg-slate-900">
                     <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-slate-100">{module.title}</h3>
                        <PiArrowRightLight className="text-slate-500" size={18} />
                     </div>
                     <p className="mt-2 text-sm leading-6 text-slate-400">{module.description}</p>
                  </Link>
               ))}
            </div>
         </section>
      </div>
   );
}
