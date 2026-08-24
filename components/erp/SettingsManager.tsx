"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
   PiArrowCounterClockwiseLight,
   PiEyeLight,
   PiGearSixLight,
   PiPencilSimpleLight,
   PiShieldCheckLight,
} from "react-icons/pi";
import {
   ERP_MODULES,
   ERP_ROLE_LABELS,
   ERP_STAFF_ROLES,
   type ErpAction,
   type ErpModule,
   type ErpStaffRole,
} from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type PermissionRow = {
   role: ErpStaffRole;
   module: ErpModule;
   canView: boolean;
   canManage: boolean;
};

type CompensationRow = {
   role: ErpStaffRole;
   roleLabel: string;
   hourlyRate: number;
   extraHoursEnabled: boolean;
   extraHourlyRate: number;
   extraHoursThreshold: number;
};

type ErpMePayload = {
   staff: {
      fullName: string;
      roleLabel: string;
      branchName: string | null;
   };
   permissions: Record<string, string[]>;
};

function moduleLabel(module: ErpModule) {
   if (module === "kpi") return "KPI";
   return module[0].toUpperCase() + module.slice(1);
}

function rowKey(role: ErpStaffRole, module: ErpModule) {
   return `${role}:${module}`;
}

function actionsFromRow(row: PermissionRow): ErpAction[] {
   const actions: ErpAction[] = [];
   if (row.canView || row.canManage) actions.push("view");
   if (row.canManage) actions.push("manage");
   return actions;
}

export default function SettingsManager() {
   const [profile, setProfile] = useState<ErpMePayload | null>(null);
   const [rows, setRows] = useState<PermissionRow[]>([]);
   const [compensationRows, setCompensationRows] = useState<CompensationRow[]>([]);
   const [loading, setLoading] = useState(true);
   const [savingKey, setSavingKey] = useState<string | null>(null);
   const [savingRateRole, setSavingRateRole] = useState<ErpStaffRole | null>(null);
   const [resetting, setResetting] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const rowsByKey = useMemo(() => {
      return new Map(rows.map((row) => [rowKey(row.role, row.module), row]));
   }, [rows]);

   const loadSettings = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();

         const [profileResponse, permissionsResponse, compensationResponse] = await Promise.all([
            fetch("/api/erp/me", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            }),
            fetch("/api/erp/permissions", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            }),
            fetch("/api/erp/compensation", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            }),
         ]);

         const profilePayload = await profileResponse.json();
         const permissionsPayload = await permissionsResponse.json();
         const compensationPayload = await compensationResponse.json();

         if (!profileResponse.ok) {
            throw new Error(profilePayload.error || "Failed to load Amir Temur profile.");
         }

         if (!permissionsResponse.ok) {
            throw new Error(permissionsPayload.error || "Failed to load permissions.");
         }

         if (!compensationResponse.ok) {
            throw new Error(compensationPayload.error || "Failed to load role hourly rates.");
         }

         setProfile(profilePayload);
         setRows(permissionsPayload.rows || []);
         setCompensationRows(compensationPayload.rows || []);
      } catch (requestError) {
         setError(
            requestError instanceof Error ? requestError.message : "Failed to load settings.",
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void loadSettings();
   }, [loadSettings]);

   const updatePermission = async (row: PermissionRow, nextRow: PermissionRow) => {
      const key = rowKey(row.role, row.module);

      try {
         setSavingKey(key);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/permissions", {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
               role: nextRow.role,
               module: nextRow.module,
               actions: actionsFromRow(nextRow),
            }),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update permission.");
         }

         setRows(payload.rows || []);
         setSuccess("Permission updated.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update permission.",
         );
      } finally {
         setSavingKey(null);
      }
   };

   const updateCompensationField = (
      role: ErpStaffRole,
      field: keyof Omit<CompensationRow, "role" | "roleLabel">,
      value: number | boolean,
   ) => {
      setCompensationRows((currentRows) =>
         currentRows.map((row) =>
            row.role === role
               ? {
                    ...row,
                    [field]: value,
                 }
               : row,
         ),
      );
   };

   const saveCompensation = async (row: CompensationRow) => {
      try {
         setSavingRateRole(row.role);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/compensation", {
            method: "PATCH",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(row),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to update role hourly rate.");
         }

         setCompensationRows(payload.rows || []);
         setSuccess("Role hourly rate updated.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to update role hourly rate.",
         );
      } finally {
         setSavingRateRole(null);
      }
   };

   const resetDefaults = async () => {
      try {
         setResetting(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/permissions", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to reset permissions.");
         }

         setRows(payload.rows || []);
         setSuccess("Permissions reset to defaults.");
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to reset permissions.",
         );
      } finally {
         setResetting(false);
      }
   };

   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     System
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Settings
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Change which Amir Temur roles can view or manage each module.
                  </p>
               </div>
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <PiGearSixLight size={25} />
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

         {profile && (
            <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  <PiShieldCheckLight className="text-emerald-300" size={22} />
                  <h2 className="text-lg font-semibold text-white">Current access</h2>
               </div>
               <p className="mt-2 text-sm text-slate-400">
                  {profile.staff.fullName} - {profile.staff.roleLabel}
                  {profile.staff.branchName ? ` - ${profile.staff.branchName}` : ""}
               </p>
         </section>
         )}

         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div>
               <h2 className="text-lg font-semibold text-white">Role hourly rates</h2>
               <p className="mt-1 text-sm text-slate-400">
                  Set base pay and optional extra-hour tariffs for monthly shift totals.
               </p>
            </div>

            {loading ? (
               <p className="mt-4 text-sm text-slate-500">Loading hourly rates...</p>
            ) : (
               <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[920px] text-left text-sm">
                        <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                           <tr>
                              <th className="px-4 py-3">Role</th>
                              <th className="px-4 py-3">Base hourly</th>
                              <th className="px-4 py-3">Extra hours</th>
                              <th className="px-4 py-3">Extra hourly</th>
                              <th className="px-4 py-3">After daily hours</th>
                              <th className="px-4 py-3"></th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {compensationRows.map((row) => {
                              const isSaving = savingRateRole === row.role;

                              return (
                                 <tr key={row.role} className="bg-slate-950/30">
                                    <td className="px-4 py-3 font-medium text-white">
                                       {row.roleLabel}
                                    </td>
                                    <td className="px-4 py-3">
                                       <input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={row.hourlyRate}
                                          onChange={(event) =>
                                             updateCompensationField(
                                                row.role,
                                                "hourlyRate",
                                                Number(event.target.value),
                                             )
                                          }
                                          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                       />
                                    </td>
                                    <td className="px-4 py-3">
                                       <label className="inline-flex items-center gap-2 text-slate-300">
                                          <input
                                             type="checkbox"
                                             checked={row.extraHoursEnabled}
                                             onChange={(event) =>
                                                updateCompensationField(
                                                   row.role,
                                                   "extraHoursEnabled",
                                                   event.target.checked,
                                                )
                                             }
                                             className="h-4 w-4 accent-emerald-500"
                                          />
                                          Enabled
                                       </label>
                                    </td>
                                    <td className="px-4 py-3">
                                       <input
                                          type="number"
                                          min="0"
                                          step="100"
                                          value={row.extraHourlyRate}
                                          onChange={(event) =>
                                             updateCompensationField(
                                                row.role,
                                                "extraHourlyRate",
                                                Number(event.target.value),
                                             )
                                          }
                                          className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                       />
                                    </td>
                                    <td className="px-4 py-3">
                                       <input
                                          type="number"
                                          min="0"
                                          step="0.5"
                                          value={row.extraHoursThreshold}
                                          onChange={(event) =>
                                             updateCompensationField(
                                                row.role,
                                                "extraHoursThreshold",
                                                Number(event.target.value),
                                             )
                                          }
                                          className="w-28 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                                       />
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                       <button
                                          type="button"
                                          onClick={() => void saveCompensation(row)}
                                          disabled={isSaving}
                                          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                                          {isSaving ? "Saving..." : "Save"}
                                       </button>
                                    </td>
                                 </tr>
                              );
                           })}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}
         </section>

         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
               <h2 className="text-lg font-semibold text-white">Permission matrix</h2>
               <button
                  type="button"
                  onClick={() => void resetDefaults()}
                  disabled={resetting || loading}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 disabled:opacity-60">
                  <PiArrowCounterClockwiseLight size={18} />
                  {resetting ? "Resetting..." : "Reset defaults"}
               </button>
            </div>

            {loading ? (
               <p className="mt-4 text-sm text-slate-500">Loading permissions...</p>
            ) : (
               <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                  <div className="overflow-x-auto">
                     <table className="w-full min-w-[980px] text-left text-sm">
                        <thead className="bg-slate-950 text-xs uppercase tracking-[0.14em] text-slate-500">
                           <tr>
                              <th className="px-4 py-3">Module</th>
                              {ERP_STAFF_ROLES.map((role) => (
                                 <th key={role} className="px-4 py-3">
                                    {ERP_ROLE_LABELS[role]}
                                 </th>
                              ))}
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                           {ERP_MODULES.map((module) => (
                              <tr key={module} className="bg-slate-950/30">
                                 <td className="px-4 py-3 font-medium text-white">
                                    {moduleLabel(module)}
                                 </td>
                                 {ERP_STAFF_ROLES.map((role) => {
                                    const row =
                                       rowsByKey.get(rowKey(role, module)) || {
                                          role,
                                          module,
                                          canView: false,
                                          canManage: false,
                                       };
                                    const key = rowKey(role, module);
                                    const isSaving = savingKey === key;
                                    const lockAdminSettings =
                                       role === "admin" && module === "settings";

                                    return (
                                       <td key={key} className="px-4 py-3">
                                          <div className="flex flex-col gap-2">
                                             <button
                                                type="button"
                                                disabled={isSaving || lockAdminSettings}
                                                onClick={() =>
                                                   void updatePermission(row, {
                                                      ...row,
                                                      canView: !row.canView,
                                                      canManage: row.canView ? false : row.canManage,
                                                   })
                                                }
                                                className={[
                                                   "inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs transition disabled:opacity-60",
                                                   row.canView
                                                      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
                                                      : "border-slate-800 bg-slate-900 text-slate-500 hover:bg-slate-800",
                                                ].join(" ")}>
                                                <PiEyeLight size={14} />
                                                View
                                             </button>
                                             <button
                                                type="button"
                                                disabled={isSaving || lockAdminSettings}
                                                onClick={() =>
                                                   void updatePermission(row, {
                                                      ...row,
                                                      canView: true,
                                                      canManage: !row.canManage,
                                                   })
                                                }
                                                className={[
                                                   "inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1 text-xs transition disabled:opacity-60",
                                                   row.canManage
                                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                                      : "border-slate-800 bg-slate-900 text-slate-500 hover:bg-slate-800",
                                                ].join(" ")}>
                                                <PiPencilSimpleLight size={14} />
                                                Manage
                                             </button>
                                          </div>
                                       </td>
                                    );
                                 })}
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            )}
         </section>
      </div>
   );
}
