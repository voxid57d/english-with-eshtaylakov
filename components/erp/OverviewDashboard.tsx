"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiCalendarCheckLight,
   PiChartLineUpLight,
   PiClockLight,
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
   workedHoursMonth: number;
   payrollAmount: number;
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

function formatNumber(value: number) {
   return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatHours(value: number) {
   return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function getSummaryCards(payload: OverviewPayload | null): SummaryCard[] {
   const summary = payload?.summary;

   return [
      {
         label: "My active tasks",
         value: formatNumber(summary?.activeTasks ?? 0),
         helper: "Assigned active task templates",
         icon: PiCalendarCheckLight,
      },
      {
         label: "My KPI progress",
         value: `${summary?.kpiAverage ?? 0}%`,
         helper: `${summary?.kpiTargets ?? 0} personal current-month targets`,
         icon: PiTargetLight,
      },
      {
         label: "My weekly shifts",
         value: formatNumber(summary?.weeklyShifts ?? 0),
         helper: `${summary?.shiftIssues ?? 0} late or absent`,
         icon: PiClockLight,
      },
      {
         label: "My profile",
         value: formatNumber(summary?.activeStaff ?? 0),
         helper: `${summary?.activeBranches ?? 0} assigned branch`,
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

         <section>
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiChartLineUpLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Current month</h2>
               </div>

               <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-sm text-slate-400">My worked hours</p>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatHours(summary?.workedHoursMonth ?? 0)}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">Completed and late shifts</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-sm text-slate-400">My estimated payout</p>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary?.payrollAmount ?? 0)}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">Based on your role hourly rate</p>
                  </div>
               </div>
            </div>
         </section>

      </div>
   );
}
