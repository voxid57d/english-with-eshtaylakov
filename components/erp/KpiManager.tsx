"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiChartLineUpLight,
   PiFloppyDiskLight,
   PiPlusLight,
   PiTargetLight,
} from "react-icons/pi";
import {
   ERP_ROLE_LABELS,
   ERP_STAFF_ROLES,
   getMonthBounds,
   type ErpStaffRole,
} from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type KpiDefinitionView = {
   id: string;
   name: string;
   description: string | null;
   role: ErpStaffRole;
   roleLabel: string;
   unit: string;
   active: boolean;
};

type KpiTargetView = {
   id: string;
   definitionName: string;
   unit: string;
   roleLabel: string | null;
   staffUserId: string | null;
   staffName: string | null;
   branchId: string | null;
   branchName: string | null;
   periodStart: string;
   periodEnd: string;
   targetValue: number;
   progressValue: number;
   percentage: number;
   status: "behind" | "on_track" | "achieved";
};

type StaffOption = {
   userId: string;
   fullName: string;
   role: ErpStaffRole;
   roleLabel: string;
};

type BranchOption = {
   id: string;
   name: string;
};

const monthBounds = getMonthBounds();

const EMPTY_DEFINITION_FORM = {
   id: "",
   name: "",
   description: "",
   role: "salesman" as ErpStaffRole,
   unit: "count",
   active: true,
};

const EMPTY_TARGET_FORM = {
   definitionId: "",
   ownerType: "staff",
   staffUserId: "",
   branchId: "",
   periodStart: monthBounds.periodStart,
   periodEnd: monthBounds.periodEnd,
   targetValue: "",
};

const EMPTY_PROGRESS_FORM = {
   targetId: "",
   entryDate: new Date().toISOString().slice(0, 10),
   value: "",
   note: "",
};

function statusLabel(status: KpiTargetView["status"]) {
   if (status === "achieved") return "Achieved";
   if (status === "on_track") return "On track";
   return "Behind";
}

function statusClass(status: KpiTargetView["status"]) {
   if (status === "achieved") {
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
   }
   if (status === "on_track") {
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
   }
   return "border-red-500/30 bg-red-500/10 text-red-200";
}

export default function KpiManager() {
   const [definitions, setDefinitions] = useState<KpiDefinitionView[]>([]);
   const [targets, setTargets] = useState<KpiTargetView[]>([]);
   const [staff, setStaff] = useState<StaffOption[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [definitionForm, setDefinitionForm] = useState(EMPTY_DEFINITION_FORM);
   const [targetForm, setTargetForm] = useState(EMPTY_TARGET_FORM);
   const [progressForm, setProgressForm] = useState(EMPTY_PROGRESS_FORM);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const activeDefinitions = useMemo(
      () => definitions.filter((definition) => definition.active),
      [definitions],
   );

   const averageProgress = useMemo(() => {
      if (targets.length === 0) return 0;
      const total = targets.reduce((sum, target) => sum + target.percentage, 0);
      return Math.round(total / targets.length);
   }, [targets]);

   const loadKpi = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch(
            `/api/erp/kpi?periodStart=${targetForm.periodStart}&periodEnd=${targetForm.periodEnd}`,
            {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            },
         );
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load KPI data.");
         }

         setDefinitions(payload.definitions || []);
         setTargets(payload.targets || []);
         setStaff(payload.staff || []);
         setBranches(payload.branches || []);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load KPI data.",
         );
      } finally {
         setLoading(false);
      }
   }, [targetForm.periodEnd, targetForm.periodStart]);

   useEffect(() => {
      void loadKpi();
   }, [loadKpi]);

   const submitDefinition = async (event: React.FormEvent) => {
      event.preventDefault();
      await saveKpi(
         definitionForm.id ? "PATCH" : "POST",
         {
            action: "definition",
            ...definitionForm,
         },
         definitionForm.id ? "KPI definition updated." : "KPI definition created.",
      );
      setDefinitionForm(EMPTY_DEFINITION_FORM);
   };

   const submitTarget = async (event: React.FormEvent) => {
      event.preventDefault();
      await saveKpi("POST", { action: "target", ...targetForm }, "KPI target created.");
      setTargetForm((current) => ({
         ...EMPTY_TARGET_FORM,
         periodStart: current.periodStart,
         periodEnd: current.periodEnd,
      }));
   };

   const submitProgress = async (event: React.FormEvent) => {
      event.preventDefault();
      await saveKpi("POST", { action: "progress", ...progressForm }, "KPI progress added.");
      setProgressForm(EMPTY_PROGRESS_FORM);
   };

   const saveKpi = async (method: "POST" | "PATCH", body: unknown, message: string) => {
      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/kpi", {
            method,
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(body),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save KPI data.");
         }

         setSuccess(message);
         await loadKpi();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save KPI data.",
         );
      } finally {
         setSaving(false);
      }
   };

   const editDefinition = (definition: KpiDefinitionView) => {
      setDefinitionForm({
         id: definition.id,
         name: definition.name,
         description: definition.description || "",
         role: definition.role,
         unit: definition.unit,
         active: definition.active,
      });
      setError(null);
      setSuccess(null);
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Performance
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     KPI
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Create KPI definitions, set monthly targets, and record progress for staff or branch performance.
                  </p>
               </div>
               <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Targets</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{targets.length}</p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                     <p className="text-xs text-slate-500">Average</p>
                     <p className="mt-1 text-2xl font-semibold text-white">{averageProgress}%</p>
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

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <form
               onSubmit={submitDefinition}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiTargetLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Definition</h2>
               </div>

               <div className="mt-4 space-y-3">
                  <input
                     value={definitionForm.name}
                     onChange={(event) =>
                        setDefinitionForm((current) => ({
                           ...current,
                           name: event.target.value,
                        }))
                     }
                     className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     placeholder="Trial lessons booked"
                     required
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <select
                        value={definitionForm.role}
                        onChange={(event) =>
                           setDefinitionForm((current) => ({
                              ...current,
                              role: event.target.value as ErpStaffRole,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                        {ERP_STAFF_ROLES.map((role) => (
                           <option key={role} value={role}>
                              {ERP_ROLE_LABELS[role]}
                           </option>
                        ))}
                     </select>
                     <input
                        value={definitionForm.unit}
                        onChange={(event) =>
                           setDefinitionForm((current) => ({
                              ...current,
                              unit: event.target.value,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="count, UZS, %"
                     />
                  </div>
                  <textarea
                     value={definitionForm.description}
                     onChange={(event) =>
                        setDefinitionForm((current) => ({
                           ...current,
                           description: event.target.value,
                        }))
                     }
                     rows={3}
                     className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     placeholder="How this KPI is measured"
                  />
                  <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                     <input
                        type="checkbox"
                        checked={definitionForm.active}
                        onChange={(event) =>
                           setDefinitionForm((current) => ({
                              ...current,
                              active: event.target.checked,
                           }))
                        }
                        className="h-4 w-4 accent-emerald-500"
                     />
                     <span className="text-sm text-slate-300">Active definition</span>
                  </label>
               </div>

               <div className="mt-5 flex gap-2">
                  <button
                     type="submit"
                     disabled={saving}
                     className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                     <PiFloppyDiskLight size={18} />
                     Save
                  </button>
                  {definitionForm.id && (
                     <button
                        type="button"
                        onClick={() => setDefinitionForm(EMPTY_DEFINITION_FORM)}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Cancel
                     </button>
                  )}
               </div>
            </form>

            <form
               onSubmit={submitTarget}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiPlusLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Target</h2>
               </div>

               <div className="mt-4 space-y-3">
                  <select
                     value={targetForm.definitionId}
                     onChange={(event) =>
                        setTargetForm((current) => ({
                           ...current,
                           definitionId: event.target.value,
                        }))
                     }
                     className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     required>
                     <option value="">Choose KPI definition</option>
                     {activeDefinitions.map((definition) => (
                        <option key={definition.id} value={definition.id}>
                           {definition.name} ({definition.roleLabel})
                        </option>
                     ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                     {["staff", "branch"].map((ownerType) => (
                        <button
                           key={ownerType}
                           type="button"
                           onClick={() =>
                              setTargetForm((current) => ({ ...current, ownerType }))
                           }
                           className={[
                              "rounded-lg border px-3 py-2 text-sm capitalize transition",
                              targetForm.ownerType === ownerType
                                 ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-100"
                                 : "border-slate-700 text-slate-300 hover:bg-slate-800",
                           ].join(" ")}>
                           {ownerType}
                        </button>
                     ))}
                  </div>

                  {targetForm.ownerType === "staff" ? (
                     <select
                        value={targetForm.staffUserId}
                        onChange={(event) =>
                           setTargetForm((current) => ({
                              ...current,
                              staffUserId: event.target.value,
                           }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required>
                        <option value="">Choose staff member</option>
                        {staff.map((member) => (
                           <option key={member.userId} value={member.userId}>
                              {member.fullName} ({member.roleLabel})
                           </option>
                        ))}
                     </select>
                  ) : (
                     <select
                        value={targetForm.branchId}
                        onChange={(event) =>
                           setTargetForm((current) => ({
                              ...current,
                              branchId: event.target.value,
                           }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required>
                        <option value="">Choose branch</option>
                        {branches.map((branch) => (
                           <option key={branch.id} value={branch.id}>
                              {branch.name}
                           </option>
                        ))}
                     </select>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <input
                        type="date"
                        value={targetForm.periodStart}
                        onChange={(event) =>
                           setTargetForm((current) => ({
                              ...current,
                              periodStart: event.target.value,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required
                     />
                     <input
                        type="date"
                        value={targetForm.periodEnd}
                        onChange={(event) =>
                           setTargetForm((current) => ({
                              ...current,
                              periodEnd: event.target.value,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required
                     />
                  </div>
                  <input
                     type="number"
                     min="0"
                     step="0.01"
                     value={targetForm.targetValue}
                     onChange={(event) =>
                        setTargetForm((current) => ({
                           ...current,
                           targetValue: event.target.value,
                        }))
                     }
                     className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     placeholder="Target value"
                     required
                  />
               </div>

               <button
                  type="submit"
                  disabled={saving}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                  <PiFloppyDiskLight size={18} />
                  Create target
               </button>
            </form>

            <form
               onSubmit={submitProgress}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiChartLineUpLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Progress</h2>
               </div>

               <div className="mt-4 space-y-3">
                  <select
                     value={progressForm.targetId}
                     onChange={(event) =>
                        setProgressForm((current) => ({
                           ...current,
                           targetId: event.target.value,
                        }))
                     }
                     className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     required>
                     <option value="">Choose target</option>
                     {targets.map((target) => (
                        <option key={target.id} value={target.id}>
                           {target.definitionName} - {target.staffName || target.branchName}
                        </option>
                     ))}
                  </select>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <input
                        type="date"
                        value={progressForm.entryDate}
                        onChange={(event) =>
                           setProgressForm((current) => ({
                              ...current,
                              entryDate: event.target.value,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required
                     />
                     <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={progressForm.value}
                        onChange={(event) =>
                           setProgressForm((current) => ({
                              ...current,
                              value: event.target.value,
                           }))
                        }
                        className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="Value"
                        required
                     />
                  </div>
                  <textarea
                     value={progressForm.note}
                     onChange={(event) =>
                        setProgressForm((current) => ({
                           ...current,
                           note: event.target.value,
                        }))
                     }
                     rows={3}
                     className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     placeholder="Optional note"
                  />
               </div>

               <button
                  type="submit"
                  disabled={saving}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                  <PiFloppyDiskLight size={18} />
                  Add progress
               </button>
            </form>
         </section>

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <h2 className="text-lg font-semibold text-white">Definitions</h2>
               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading KPI definitions...</p>
               ) : definitions.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No KPI definitions yet.</p>
               ) : (
                  <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
                     {definitions.map((definition) => (
                        <button
                           key={definition.id}
                           type="button"
                           onClick={() => editDefinition(definition)}
                           className="flex w-full flex-col gap-1 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900">
                           <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium text-white">{definition.name}</p>
                              <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                                 {definition.roleLabel}
                              </span>
                           </div>
                           <p className="text-sm text-slate-500">
                              {definition.unit} {definition.active ? "" : "| inactive"}
                           </p>
                        </button>
                     ))}
                  </div>
               )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <h2 className="text-lg font-semibold text-white">Targets</h2>
               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading KPI targets...</p>
               ) : targets.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500">No KPI targets for this period yet.</p>
               ) : (
                  <div className="mt-4 space-y-3">
                     {targets.map((target) => (
                        <div
                           key={target.id}
                           className="rounded-lg border border-slate-800 bg-slate-950/30 p-4">
                           <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div>
                                 <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="font-semibold text-white">
                                       {target.definitionName}
                                    </h3>
                                    <span
                                       className={[
                                          "rounded-lg border px-2 py-0.5 text-[11px]",
                                          statusClass(target.status),
                                       ].join(" ")}>
                                       {statusLabel(target.status)}
                                    </span>
                                 </div>
                                 <p className="mt-1 text-sm text-slate-500">
                                    {target.staffName || target.branchName || "Unassigned"} | {target.periodStart} to {target.periodEnd}
                                 </p>
                              </div>
                              <div className="text-left md:text-right">
                                 <p className="text-sm text-slate-400">
                                    {target.progressValue} / {target.targetValue} {target.unit}
                                 </p>
                                 <p className="mt-1 text-2xl font-semibold text-white">
                                    {target.percentage}%
                                 </p>
                              </div>
                           </div>
                           <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                 className="h-full rounded-full bg-emerald-400 transition-all"
                                 style={{ width: `${Math.min(100, target.percentage)}%` }}
                              />
                           </div>
                        </div>
                     ))}
                  </div>
               )}
            </div>
         </section>
      </div>
   );
}
