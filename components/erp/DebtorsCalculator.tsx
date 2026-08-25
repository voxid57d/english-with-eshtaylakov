"use client";

import { useEffect, useMemo, useState } from "react";
import {
   PiFloppyDiskLight,
   PiTrashLight,
} from "react-icons/pi";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type CalculatorTab = "daily" | "history" | "sessions";

type DailyForm = {
   currentDebtors: string;
   frozenDebtors: string;
   archiveDebtors: string;
   finishedDebtors: string;
   activeStudents: string;
   archiveStudents: string;
   finishedStudents: string;
};

type DailyRecord = {
   id: string;
   date: string;
   branchId: string;
   branchName: string;
   debtors: number;
   students: number;
   percentage: number;
   details: [number, number, number, number];
};

type SessionForm = {
   debtors: [string, string, string, string];
   students: [string, string, string];
};

type SessionRecord = {
   id: string;
   date: string;
   branchId: string;
   branchName: string;
   period: "Morning" | "Evening";
   debtors: number;
   students: number;
   percentage: number;
};

export type CashierDebtorMetricView = {
   id: string;
   cashierUserId: string;
   branchId: string;
   branchName: string;
   metricDate: string;
   entryType: "daily" | "morning" | "evening";
   currentDebtors: number;
   frozenDebtors: number;
   archiveDebtors: number;
   finishedDebtors: number;
   activeStudents: number;
   archiveStudents: number;
   finishedStudents: number;
   totalDebtors: number;
   totalStudents: number;
   debtorPercentage: number;
   note: string | null;
};

type BranchOption = {
   id: string;
   name: string;
};

type DebtorsCalculatorProps = {
   branches: BranchOption[];
   primaryBranchId: string | null;
   initialMetrics: CashierDebtorMetricView[];
   onChanged: () => Promise<void> | void;
};

const EMPTY_DAILY_FORM: DailyForm = {
   currentDebtors: "",
   frozenDebtors: "",
   archiveDebtors: "",
   finishedDebtors: "",
   activeStudents: "",
   archiveStudents: "",
   finishedStudents: "",
};

const EMPTY_SESSION_FORM: SessionForm = {
   debtors: ["", "", "", ""],
   students: ["", "", ""],
};

const debtorLabels = [
   "Current debtors",
   "Frozen debtors",
   "Archive debtors",
   "Finished debtors",
];

const studentLabels = ["Active students", "Archive students", "Finished students"];

function today() {
   return new Date().toISOString().slice(0, 10);
}

function toNumber(value: string) {
   const parsed = Number(value);
   return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getPctClass(percentage: number | null) {
   if (percentage === null) return "text-slate-500";
   if (percentage <= 10) return "text-emerald-300";
   if (percentage <= 20) return "text-amber-300";
   return "text-red-300";
}

function formatPct(percentage: number | null) {
   return percentage === null ? "--" : `${percentage.toFixed(1)}%`;
}

function getDailyTotals(form: DailyForm) {
   const details: [number, number, number, number] = [
      toNumber(form.currentDebtors),
      toNumber(form.frozenDebtors),
      toNumber(form.archiveDebtors),
      toNumber(form.finishedDebtors),
   ];
   const students =
      toNumber(form.activeStudents) +
      toNumber(form.archiveStudents) +
      toNumber(form.finishedStudents);
   const debtors = details.reduce((sum, value) => sum + value, 0);

   return {
      debtors,
      students,
      details,
      percentage: students > 0 ? (debtors / students) * 100 : null,
   };
}

function getSessionTotals(form: SessionForm) {
   const debtors = form.debtors.reduce((sum, value) => sum + toNumber(value), 0);
   const students = form.students.reduce((sum, value) => sum + toNumber(value), 0);

   return {
      debtors,
      students,
      percentage: students > 0 ? (debtors / students) * 100 : null,
   };
}

function toDailyRecord(metric: CashierDebtorMetricView): DailyRecord {
   return {
      id: metric.id,
      date: metric.metricDate,
      branchId: metric.branchId,
      branchName: metric.branchName,
      debtors: metric.totalDebtors,
      students: metric.totalStudents,
      percentage: metric.debtorPercentage,
      details: [
         metric.currentDebtors,
         metric.frozenDebtors,
         metric.archiveDebtors,
         metric.finishedDebtors,
      ],
   };
}

function toSessionRecord(metric: CashierDebtorMetricView): SessionRecord {
   return {
      id: metric.id,
      date: metric.metricDate,
      branchId: metric.branchId,
      branchName: metric.branchName,
      period: metric.entryType === "morning" ? "Morning" : "Evening",
      debtors: metric.totalDebtors,
      students: metric.totalStudents,
      percentage: metric.debtorPercentage,
   };
}

function TrendChart({ records }: { records: DailyRecord[] }) {
   if (records.length === 0) {
      return (
         <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/30 text-sm text-slate-500">
            No saved debtor history yet.
         </div>
      );
   }

   const maxValue = Math.max(30, ...records.map((record) => record.percentage)) + 5;
   const width = 720;
   const height = 240;
   const padding = 28;
   const usableWidth = width - padding * 2;
   const usableHeight = height - padding * 2;
   const points = records.map((record, index) => {
      const x =
         records.length === 1
            ? width / 2
            : padding + (index / (records.length - 1)) * usableWidth;
      const y = padding + usableHeight - (record.percentage / maxValue) * usableHeight;
      return { x, y, record };
   });
   const path = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

   return (
      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950/30 p-3">
         <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
            {[10, 20].map((line) => {
               const y = padding + usableHeight - (line / maxValue) * usableHeight;
               return (
                  <g key={line}>
                     <line
                        x1={padding}
                        x2={width - padding}
                        y1={y}
                        y2={y}
                        stroke="currentColor"
                        strokeDasharray="6 5"
                        className={line === 10 ? "text-emerald-400/45" : "text-red-400/45"}
                     />
                     <text x={4} y={y + 4} className="fill-slate-500 text-[10px]">
                        {line}%
                     </text>
                  </g>
               );
            })}
            <path d={path} fill="none" stroke="#34d399" strokeWidth="3" />
            {points.map((point) => (
               <circle
                  key={`${point.record.date}-${point.x}`}
                  cx={point.x}
                  cy={point.y}
                  r="5"
                  className={[
                     "stroke-slate-950 stroke-2",
                     point.record.percentage <= 10
                        ? "fill-emerald-400"
                        : point.record.percentage <= 20
                          ? "fill-amber-400"
                          : "fill-red-400",
                  ].join(" ")}
               />
            ))}
         </svg>
      </div>
   );
}

function NumberField({
   label,
   value,
   onChange,
}: {
   label: string;
   value: string;
   onChange: (value: string) => void;
}) {
   return (
      <label className="block">
         <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
            {label}
         </span>
         <input
            type="number"
            min="0"
            step="1"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
         />
      </label>
   );
}

export default function DebtorsCalculator({
   branches,
   primaryBranchId,
   initialMetrics,
   onChanged,
}: DebtorsCalculatorProps) {
   const [tab, setTab] = useState<CalculatorTab>("daily");
   const [selectedBranchId, setSelectedBranchId] = useState(
      primaryBranchId || branches[0]?.id || "",
   );
   const [dailyForm, setDailyForm] = useState<DailyForm>(EMPTY_DAILY_FORM);
   const [morningForm, setMorningForm] = useState<SessionForm>(EMPTY_SESSION_FORM);
   const [eveningForm, setEveningForm] = useState<SessionForm>(EMPTY_SESSION_FORM);
   const [history, setHistory] = useState<DailyRecord[]>([]);
   const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>([]);
   const [savingDaily, setSavingDaily] = useState(false);
   const [savingSession, setSavingSession] = useState<"Morning" | "Evening" | null>(null);
   const [deletingId, setDeletingId] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const dailyTotals = useMemo(() => getDailyTotals(dailyForm), [dailyForm]);
   const morningTotals = useMemo(() => getSessionTotals(morningForm), [morningForm]);
   const eveningTotals = useMemo(() => getSessionTotals(eveningForm), [eveningForm]);

   useEffect(() => {
      setHistory(
         initialMetrics
            .filter((metric) => metric.entryType === "daily")
            .map(toDailyRecord)
            .sort((first, second) => first.date.localeCompare(second.date)),
      );
      setSessionHistory(
         initialMetrics
            .filter((metric) => metric.entryType === "morning" || metric.entryType === "evening")
            .map(toSessionRecord)
            .sort((first, second) => first.date.localeCompare(second.date)),
      );
   }, [initialMetrics]);

   useEffect(() => {
      if (!selectedBranchId && (primaryBranchId || branches[0]?.id)) {
         setSelectedBranchId(primaryBranchId || branches[0]?.id || "");
      }
   }, [branches, primaryBranchId, selectedBranchId]);

   const historySummary = useMemo(() => {
      if (history.length === 0) return null;
      const percentages = history.map((record) => record.percentage);
      const average =
         percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
      return {
         days: history.length,
         average,
         best: Math.min(...percentages),
         worst: Math.max(...percentages),
      };
   }, [history]);

   const setDailyValue = (key: keyof DailyForm, value: string) => {
      setDailyForm((current) => ({ ...current, [key]: value }));
   };

   const setSessionDebtor = (
      period: "morning" | "evening",
      index: number,
      value: string,
   ) => {
      const setter = period === "morning" ? setMorningForm : setEveningForm;
      setter((current) => ({
         ...current,
         debtors: current.debtors.map((item, itemIndex) =>
            itemIndex === index ? value : item,
         ) as SessionForm["debtors"],
      }));
   };

   const setSessionStudent = (
      period: "morning" | "evening",
      index: number,
      value: string,
   ) => {
      const setter = period === "morning" ? setMorningForm : setEveningForm;
      setter((current) => ({
         ...current,
         students: current.students.map((item, itemIndex) =>
            itemIndex === index ? value : item,
         ) as SessionForm["students"],
      }));
   };

   const saveDebtorMetric = async (
      entryType: "daily" | "morning" | "evening",
      payload: {
         currentDebtors: number;
         frozenDebtors: number;
         archiveDebtors: number;
         finishedDebtors: number;
         activeStudents: number;
         archiveStudents: number;
         finishedStudents: number;
      },
   ) => {
      const token = await getSupabaseAccessToken();
      const response = await fetch("/api/erp/metrics", {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
         },
         body: JSON.stringify({
            action: "cashierDebtorMetric",
            branchId: selectedBranchId,
            metricDate: today(),
            entryType,
            ...payload,
         }),
      });
      const responsePayload = await response.json();

      if (!response.ok) {
         throw new Error(responsePayload.error || "Failed to save debtor metric.");
      }

      await onChanged();
   };

   const saveDaily = async () => {
      if (!dailyTotals.students || dailyTotals.percentage === null) return;

      try {
         setSavingDaily(true);
         setError(null);
         setSuccess(null);
         await saveDebtorMetric("daily", {
            currentDebtors: dailyTotals.details[0],
            frozenDebtors: dailyTotals.details[1],
            archiveDebtors: dailyTotals.details[2],
            finishedDebtors: dailyTotals.details[3],
            activeStudents: toNumber(dailyForm.activeStudents),
            archiveStudents: toNumber(dailyForm.archiveStudents),
            finishedStudents: toNumber(dailyForm.finishedStudents),
         });
         setSuccess("Today's debtor result saved.");
         setTab("history");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save debtor result.",
         );
      } finally {
         setSavingDaily(false);
      }
   };

   const saveSession = async (period: "Morning" | "Evening") => {
      const totals = period === "Morning" ? morningTotals : eveningTotals;
      if (!totals.students || totals.percentage === null) return;

      const form = period === "Morning" ? morningForm : eveningForm;

      try {
         setSavingSession(period);
         setError(null);
         setSuccess(null);
         await saveDebtorMetric(period === "Morning" ? "morning" : "evening", {
            currentDebtors: toNumber(form.debtors[0]),
            frozenDebtors: toNumber(form.debtors[1]),
            archiveDebtors: toNumber(form.debtors[2]),
            finishedDebtors: toNumber(form.debtors[3]),
            activeStudents: toNumber(form.students[0]),
            archiveStudents: toNumber(form.students[1]),
            finishedStudents: toNumber(form.students[2]),
         });
         setSuccess(`${period} debtor result saved.`);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save debtor result.",
         );
      } finally {
         setSavingSession(null);
      }
   };

   const deleteMetric = async (id: string) => {
      try {
         setDeletingId(id);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/metrics", {
            method: "DELETE",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               action: "cashierDebtorMetric",
               id,
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to delete debtor metric.");
         }

         await onChanged();
         setSuccess("Debtor result deleted.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to delete debtor metric.",
         );
      } finally {
         setDeletingId(null);
      }
   };

   const sessionDelta =
      morningTotals.percentage !== null && eveningTotals.percentage !== null
         ? eveningTotals.percentage - morningTotals.percentage
         : null;

   return (
      <div className="space-y-4">
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

         <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950/60 p-1">
            {[
               ["daily", "Daily input"],
               ["history", "Graph & history"],
               ["sessions", "Day analysis"],
            ].map(([key, label]) => (
               <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key as CalculatorTab)}
                  className={[
                     "rounded-md px-4 py-2 text-sm font-medium transition",
                     tab === key
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-300 hover:bg-slate-900",
                  ].join(" ")}>
                  {label}
               </button>
            ))}
         </div>

         {tab === "daily" && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
               <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <label className="block max-w-sm">
                     <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                        Branch
                     </span>
                     <select
                        value={selectedBranchId}
                        onChange={(event) => setSelectedBranchId(event.target.value)}
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

                  <div>
                     <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                        Qarzdorlar
                     </p>
                     <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {(
                           [
                              "currentDebtors",
                              "frozenDebtors",
                              "archiveDebtors",
                              "finishedDebtors",
                           ] as (keyof DailyForm)[]
                        ).map((key, index) => (
                           <NumberField
                              key={key}
                              label={debtorLabels[index]}
                              value={dailyForm[key]}
                              onChange={(value) => setDailyValue(key, value)}
                           />
                        ))}
                     </div>
                  </div>

                  <div>
                     <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                        O&apos;quvchilar
                     </p>
                     <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(
                           [
                              "activeStudents",
                              "archiveStudents",
                              "finishedStudents",
                           ] as (keyof DailyForm)[]
                        ).map((key, index) => (
                           <NumberField
                              key={key}
                              label={studentLabels[index]}
                              value={dailyForm[key]}
                              onChange={(value) => setDailyValue(key, value)}
                           />
                        ))}
                     </div>
                  </div>

                  <button
                     type="button"
                     onClick={saveDaily}
                     disabled={!dailyTotals.students || !selectedBranchId || savingDaily}
                     className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50">
                     <PiFloppyDiskLight size={18} />
                     {savingDaily ? "Saving..." : "Save today's result"}
                  </button>
               </div>

               <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Total debtors
                     </p>
                     <p className="mt-2 text-3xl font-semibold text-white">
                        {dailyTotals.debtors}
                     </p>
                     <p className="mt-1 text-xs text-slate-500">
                        {dailyTotals.details.join(" + ")}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Total students
                     </p>
                     <p className="mt-2 text-3xl font-semibold text-white">
                        {dailyTotals.students}
                     </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
                     <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Debtor share
                     </p>
                     <p
                        className={[
                           "mt-2 text-5xl font-semibold",
                           getPctClass(dailyTotals.percentage),
                        ].join(" ")}>
                        {formatPct(dailyTotals.percentage)}
                     </p>
                     <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
                        <div
                           className={[
                              "h-full rounded-full transition-all",
                              dailyTotals.percentage === null || dailyTotals.percentage <= 10
                                 ? "bg-emerald-400"
                                 : dailyTotals.percentage <= 20
                                   ? "bg-amber-400"
                                   : "bg-red-400",
                           ].join(" ")}
                           style={{
                              width: `${Math.min(100, dailyTotals.percentage || 0)}%`,
                           }}
                        />
                     </div>
                     <p className="mt-2 text-xs text-slate-500">
                        Good &lt;= 10%, warning &lt;= 20%
                     </p>
                  </div>
               </div>
            </section>
         )}

         {tab === "history" && (
            <section className="space-y-4">
               <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                     ["Saved days", historySummary?.days ?? 0, "text-white"],
                     ["Average", historySummary ? formatPct(historySummary.average) : "--", "text-amber-300"],
                     ["Best", historySummary ? formatPct(historySummary.best) : "--", "text-emerald-300"],
                     ["Worst", historySummary ? formatPct(historySummary.worst) : "--", "text-red-300"],
                  ].map(([label, value, color]) => (
                     <div
                        key={label}
                        className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
                        <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                           {label}
                        </p>
                        <p className={["mt-2 text-2xl font-semibold", color].join(" ")}>
                           {value}
                        </p>
                     </div>
                  ))}
               </div>

               <TrendChart records={history} />

               <div className="overflow-hidden rounded-lg border border-slate-800">
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[720px] text-left text-sm">
                        <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                           <tr>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Branch</th>
                              <th className="px-4 py-3">Debtors</th>
                              <th className="px-4 py-3">Students</th>
                              <th className="px-4 py-3">Share</th>
                              <th className="px-4 py-3">Details</th>
                              <th className="px-4 py-3" />
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {history.length === 0 ? (
                              <tr>
                                 <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                                    No records yet.
                                 </td>
                              </tr>
                           ) : (
                              history
                                 .map((record) => ({ record }))
                                 .reverse()
                                 .map(({ record }) => (
                                    <tr key={record.id} className="bg-slate-950/30">
                                       <td className="px-4 py-3 text-slate-300">{record.date}</td>
                                       <td className="px-4 py-3 text-slate-300">{record.branchName}</td>
                                       <td className="px-4 py-3 text-white">{record.debtors}</td>
                                       <td className="px-4 py-3 text-white">{record.students}</td>
                                       <td className={["px-4 py-3 font-semibold", getPctClass(record.percentage)].join(" ")}>
                                          {formatPct(record.percentage)}
                                       </td>
                                       <td className="px-4 py-3 text-slate-500">
                                          {record.details.join(" + ")}
                                       </td>
                                       <td className="px-4 py-3 text-right">
                                          <button
                                             type="button"
                                             onClick={() => deleteMetric(record.id)}
                                             disabled={deletingId === record.id}
                                             className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10">
                                             <PiTrashLight size={14} />
                                             {deletingId === record.id ? "Deleting..." : "Delete"}
                                          </button>
                                       </td>
                                    </tr>
                                 ))
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </section>
         )}

         {tab === "sessions" && (
            <section className="space-y-4">
               <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {[
                     ["morning", "Morning", "08:00 - 12:00", morningForm, morningTotals],
                     ["evening", "Evening", "17:00 - 21:00", eveningForm, eveningTotals],
                  ].map(([periodKey, label, time, form, totals]) => (
                     <div
                        key={periodKey as string}
                        className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                        <div className="flex items-center justify-between gap-3">
                           <div>
                              <h2 className="text-lg font-semibold text-white">{label as string}</h2>
                              <p className="text-sm text-slate-500">{time as string}</p>
                           </div>
                           <p
                              className={[
                                 "text-4xl font-semibold",
                                 getPctClass((totals as ReturnType<typeof getSessionTotals>).percentage),
                              ].join(" ")}>
                              {formatPct((totals as ReturnType<typeof getSessionTotals>).percentage)}
                           </p>
                        </div>

                        <div className="mt-5 space-y-4">
                           <div>
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                                 Qarzdorlar
                              </p>
                              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                                 {(form as SessionForm).debtors.map((value, index) => (
                                    <NumberField
                                       key={`${periodKey}-debtors-${index}`}
                                       label={debtorLabels[index]}
                                       value={value}
                                       onChange={(nextValue) =>
                                          setSessionDebtor(
                                             periodKey as "morning" | "evening",
                                             index,
                                             nextValue,
                                          )
                                       }
                                    />
                                 ))}
                              </div>
                           </div>
                           <div>
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300">
                                 O&apos;quvchilar
                              </p>
                              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                                 {(form as SessionForm).students.map((value, index) => (
                                    <NumberField
                                       key={`${periodKey}-students-${index}`}
                                       label={studentLabels[index]}
                                       value={value}
                                       onChange={(nextValue) =>
                                          setSessionStudent(
                                             periodKey as "morning" | "evening",
                                             index,
                                             nextValue,
                                          )
                                       }
                                    />
                                 ))}
                              </div>
                           </div>
                        </div>

                        <button
                           type="button"
                           onClick={() => saveSession(label as "Morning" | "Evening")}
                           disabled={
                              !(totals as ReturnType<typeof getSessionTotals>).students ||
                              !selectedBranchId ||
                              savingSession === label
                           }
                           className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/30 px-4 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-50">
                           {savingSession === label ? "Saving..." : `Save ${label as string}`}
                        </button>
                     </div>
                  ))}
               </div>

               <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                     <div>
                        <h2 className="text-lg font-semibold text-white">Morning to evening change</h2>
                        <p className="text-sm text-slate-500">Negative change means the debtor share improved.</p>
                     </div>
                     <p
                        className={[
                           "text-3xl font-semibold",
                           sessionDelta === null
                              ? "text-slate-500"
                              : sessionDelta <= 0
                                ? "text-emerald-300"
                                : "text-red-300",
                        ].join(" ")}>
                        {sessionDelta === null
                           ? "--"
                           : `${sessionDelta >= 0 ? "+" : ""}${sessionDelta.toFixed(2)}%`}
                     </p>
                  </div>
               </div>

               <div className="overflow-hidden rounded-lg border border-slate-800">
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[680px] text-left text-sm">
                        <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                           <tr>
                              <th className="px-4 py-3">Date</th>
                              <th className="px-4 py-3">Branch</th>
                              <th className="px-4 py-3">Session</th>
                              <th className="px-4 py-3">Debtors</th>
                              <th className="px-4 py-3">Students</th>
                              <th className="px-4 py-3">Share</th>
                              <th className="px-4 py-3" />
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {sessionHistory.length === 0 ? (
                              <tr>
                                 <td className="px-4 py-6 text-center text-slate-500" colSpan={7}>
                                    No session records yet.
                                 </td>
                              </tr>
                           ) : (
                              sessionHistory
                                 .map((record) => ({ record }))
                                 .reverse()
                                 .map(({ record }) => (
                                    <tr key={record.id} className="bg-slate-950/30">
                                       <td className="px-4 py-3 text-slate-300">{record.date}</td>
                                       <td className="px-4 py-3 text-slate-300">{record.branchName}</td>
                                       <td className="px-4 py-3 text-white">{record.period}</td>
                                       <td className="px-4 py-3 text-white">{record.debtors}</td>
                                       <td className="px-4 py-3 text-white">{record.students}</td>
                                       <td className={["px-4 py-3 font-semibold", getPctClass(record.percentage)].join(" ")}>
                                          {formatPct(record.percentage)}
                                       </td>
                                       <td className="px-4 py-3 text-right">
                                          <button
                                             type="button"
                                             onClick={() => deleteMetric(record.id)}
                                             disabled={deletingId === record.id}
                                             className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-200 transition hover:bg-red-500/10">
                                             <PiTrashLight size={14} />
                                             {deletingId === record.id ? "Deleting..." : "Delete"}
                                          </button>
                                       </td>
                                    </tr>
                                 ))
                           )}
                        </tbody>
                     </table>
                  </div>
               </div>
            </section>
         )}
      </div>
   );
}
