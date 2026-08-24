"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiChartLineUpLight,
   PiFloppyDiskLight,
   PiMoneyLight,
   PiPlusLight,
   PiUsersThreeLight,
} from "react-icons/pi";
import { getMonthBounds } from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type BranchOption = {
   id: string;
   name: string;
};

type MetricView = {
   id: string;
   branchId: string;
   branchName: string;
   metricDate: string;
   leadsCount: number;
   trialLessonsCount: number;
   conversionsCount: number;
   activeStudentsCount: number;
   revenueAmount: number;
   debtAmount: number;
   refundsAmount: number;
   attendanceCount: number;
   note: string | null;
};

type MetricsSummary = {
   leadsCount: number;
   trialLessonsCount: number;
   conversionsCount: number;
   activeStudentsCount: number;
   revenueAmount: number;
   debtAmount: number;
   refundsAmount: number;
   attendanceCount: number;
};

type MetricForm = {
   branchId: string;
   metricDate: string;
   leadsCount: string;
   trialLessonsCount: string;
   conversionsCount: string;
   activeStudentsCount: string;
   revenueAmount: string;
   debtAmount: string;
   refundsAmount: string;
   attendanceCount: string;
   note: string;
};

const monthBounds = getMonthBounds();

const EMPTY_FORM: MetricForm = {
   branchId: "",
   metricDate: new Date().toISOString().slice(0, 10),
   leadsCount: "0",
   trialLessonsCount: "0",
   conversionsCount: "0",
   activeStudentsCount: "0",
   revenueAmount: "0",
   debtAmount: "0",
   refundsAmount: "0",
   attendanceCount: "0",
   note: "",
};

const EMPTY_SUMMARY: MetricsSummary = {
   leadsCount: 0,
   trialLessonsCount: 0,
   conversionsCount: 0,
   activeStudentsCount: 0,
   revenueAmount: 0,
   debtAmount: 0,
   refundsAmount: 0,
   attendanceCount: 0,
};

function formatNumber(value: number) {
   return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function getConversionRate(summary: MetricsSummary) {
   if (summary.trialLessonsCount === 0) return 0;
   return Math.round((summary.conversionsCount / summary.trialLessonsCount) * 100);
}

export default function MetricsManager() {
   const [metrics, setMetrics] = useState<MetricView[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [summary, setSummary] = useState<MetricsSummary>(EMPTY_SUMMARY);
   const [periodStart, setPeriodStart] = useState(monthBounds.periodStart);
   const [periodEnd, setPeriodEnd] = useState(monthBounds.periodEnd);
   const [branchFilter, setBranchFilter] = useState("all");
   const [form, setForm] = useState<MetricForm>(EMPTY_FORM);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const conversionRate = useMemo(() => getConversionRate(summary), [summary]);

   const loadMetrics = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/metrics?periodStart=${periodStart}&periodEnd=${periodEnd}&branchId=${branchFilter}`,
            {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            },
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load metrics.");
         }

         setMetrics(payload.metrics || []);
         setBranches(payload.branches || []);
         setSummary(payload.summary || EMPTY_SUMMARY);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load metrics.",
         );
      } finally {
         setLoading(false);
      }
   }, [branchFilter, periodEnd, periodStart]);

   useEffect(() => {
      void loadMetrics();
   }, [loadMetrics]);

   const editMetric = (metric: MetricView) => {
      setForm({
         branchId: metric.branchId,
         metricDate: metric.metricDate,
         leadsCount: String(metric.leadsCount),
         trialLessonsCount: String(metric.trialLessonsCount),
         conversionsCount: String(metric.conversionsCount),
         activeStudentsCount: String(metric.activeStudentsCount),
         revenueAmount: String(metric.revenueAmount),
         debtAmount: String(metric.debtAmount),
         refundsAmount: String(metric.refundsAmount),
         attendanceCount: String(metric.attendanceCount),
         note: metric.note || "",
      });
      setError(null);
      setSuccess(null);
   };

   const submitMetric = async (event: React.FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/metrics", {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(form),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save metric entry.");
         }

         setSuccess("Daily metrics saved.");
         setForm((current) => ({
            ...EMPTY_FORM,
            branchId: current.branchId,
            metricDate: current.metricDate,
         }));
         await loadMetrics();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save metric entry.",
         );
      } finally {
         setSaving(false);
      }
   };

   const updateForm = (key: keyof MetricForm, value: string) => {
      setForm((current) => ({ ...current, [key]: value }));
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Operations
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Metrics
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Record daily branch numbers for leads, trials, conversions, revenue, debt, refunds, students, and attendance.
                  </p>
               </div>
               <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Leads</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {formatNumber(summary.leadsCount)}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Trials</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {formatNumber(summary.trialLessonsCount)}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Conversion</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{conversionRate}%</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Revenue</p>
                     <p className="mt-1 text-2xl font-semibold text-white">
                        {formatNumber(summary.revenueAmount)}
                     </p>
                  </div>
               </div>
            </div>
         </section>

         {(error || success) && (
            <div
               className={[
                  "rounded-lg border px-4 py-3 text-sm",
                  error
                     ? "border-red-500/30 bg-red-500/10 text-red-200"
                     : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
               ].join(" ")}>
               {error || success}
            </div>
         )}

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
            <form
               onSubmit={submitMetric}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiPlusLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Daily entry</h2>
               </div>

               <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <label className="block">
                        <span className="text-sm text-slate-300">Branch</span>
                        <select
                           value={form.branchId}
                           onChange={(event) => updateForm("branchId", event.target.value)}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required>
                           <option value="">Choose branch</option>
                           {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                 {branch.name}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Date</span>
                        <input
                           type="date"
                           value={form.metricDate}
                           onChange={(event) => updateForm("metricDate", event.target.value)}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           required
                        />
                     </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     {[
                        ["leadsCount", "Leads"],
                        ["trialLessonsCount", "Trials"],
                        ["conversionsCount", "Conversions"],
                        ["activeStudentsCount", "Active students"],
                        ["attendanceCount", "Attendance"],
                     ].map(([key, label]) => (
                        <label key={key} className="block">
                           <span className="text-sm text-slate-300">{label}</span>
                           <input
                              type="number"
                              min="0"
                              step="1"
                              value={form[key as keyof MetricForm]}
                              onChange={(event) =>
                                 updateForm(key as keyof MetricForm, event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           />
                        </label>
                     ))}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                     {[
                        ["revenueAmount", "Revenue"],
                        ["debtAmount", "Debt"],
                        ["refundsAmount", "Refunds"],
                     ].map(([key, label]) => (
                        <label key={key} className="block">
                           <span className="text-sm text-slate-300">{label}</span>
                           <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={form[key as keyof MetricForm]}
                              onChange={(event) =>
                                 updateForm(key as keyof MetricForm, event.target.value)
                              }
                              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           />
                        </label>
                     ))}
                  </div>

                  <label className="block">
                     <span className="text-sm text-slate-300">Note</span>
                     <textarea
                        value={form.note}
                        onChange={(event) => updateForm("note", event.target.value)}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="Optional note"
                     />
                  </label>
               </div>

               <button
                  type="submit"
                  disabled={saving}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                  <PiFloppyDiskLight size={18} />
                  {saving ? "Saving..." : "Save metrics"}
               </button>
            </form>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2">
                     <PiChartLineUpLight className="text-emerald-300" size={22} />
                     <h2 className="text-lg font-semibold text-white">Monthly records</h2>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                     <input
                        type="date"
                        value={periodStart}
                        onChange={(event) => setPeriodStart(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     />
                     <input
                        type="date"
                        value={periodEnd}
                        onChange={(event) => setPeriodEnd(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     />
                     <select
                        value={branchFilter}
                        onChange={(event) => setBranchFilter(event.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                        <option value="all">All branches</option>
                        {branches.map((branch) => (
                           <option key={branch.id} value={branch.id}>
                              {branch.name}
                           </option>
                        ))}
                     </select>
                  </div>
               </div>

               <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <div className="flex items-center gap-2 text-slate-400">
                        <PiUsersThreeLight size={18} />
                        <p className="text-sm">Active students</p>
                     </div>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary.activeStudentsCount)}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <div className="flex items-center gap-2 text-slate-400">
                        <PiMoneyLight size={18} />
                        <p className="text-sm">Debt</p>
                     </div>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary.debtAmount)}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <div className="flex items-center gap-2 text-slate-400">
                        <PiMoneyLight size={18} />
                        <p className="text-sm">Refunds</p>
                     </div>
                     <p className="mt-2 text-2xl font-semibold text-white">
                        {formatNumber(summary.refundsAmount)}
                     </p>
                  </div>
               </div>

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading metrics...</p>
               ) : metrics.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiChartLineUpLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No daily metrics in this period yet.</p>
                  </div>
               ) : (
                  <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                     <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] text-left text-sm">
                           <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                              <tr>
                                 <th className="px-4 py-3">Date</th>
                                 <th className="px-4 py-3">Branch</th>
                                 <th className="px-4 py-3">Leads</th>
                                 <th className="px-4 py-3">Trials</th>
                                 <th className="px-4 py-3">Conv.</th>
                                 <th className="px-4 py-3">Students</th>
                                 <th className="px-4 py-3">Revenue</th>
                                 <th className="px-4 py-3">Debt</th>
                                 <th className="px-4 py-3">Attendance</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-800">
                              {metrics.map((metric) => (
                                 <tr
                                    key={metric.id}
                                    onClick={() => editMetric(metric)}
                                    className="cursor-pointer bg-slate-950/30 transition hover:bg-slate-900">
                                    <td className="px-4 py-3 text-slate-300">{metric.metricDate}</td>
                                    <td className="px-4 py-3 font-medium text-white">{metric.branchName}</td>
                                    <td className="px-4 py-3 text-slate-300">{metric.leadsCount}</td>
                                    <td className="px-4 py-3 text-slate-300">{metric.trialLessonsCount}</td>
                                    <td className="px-4 py-3 text-slate-300">{metric.conversionsCount}</td>
                                    <td className="px-4 py-3 text-slate-300">{metric.activeStudentsCount}</td>
                                    <td className="px-4 py-3 text-slate-300">{formatNumber(metric.revenueAmount)}</td>
                                    <td className="px-4 py-3 text-slate-300">{formatNumber(metric.debtAmount)}</td>
                                    <td className="px-4 py-3 text-slate-300">{metric.attendanceCount}</td>
                                 </tr>
                              ))}
                           </tbody>
                        </table>
                     </div>
                  </div>
               )}
            </div>
         </section>
      </div>
   );
}
