"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PiFloppyDiskLight, PiPlusLight, PiUsersThreeLight } from "react-icons/pi";
import {
   ERP_ROLE_LABELS,
   ERP_STAFF_ROLES,
   type ErpStaffRole,
} from "@/lib/erp";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type StaffView = {
   userId: string;
   authUserId: string | null;
   fullName: string;
   role: ErpStaffRole;
   roleLabel: string;
   salaryTier: string;
   primaryBranchId: string | null;
   branchName: string | null;
   telegramUsername: string | null;
   phone: string | null;
   notes: string | null;
   active: boolean;
};

type BranchOption = {
   id: string;
   name: string;
};

type AuthUserOption = {
   id: string;
   email: string | null;
   displayName: string;
};

type StaffForm = {
   userId: string;
   authUserId: string;
   fullName: string;
   role: ErpStaffRole;
   salaryTier: string;
   primaryBranchId: string;
   telegramUsername: string;
   phone: string;
   notes: string;
   active: boolean;
};

const EMPTY_FORM: StaffForm = {
   userId: "",
   authUserId: "",
   fullName: "",
   role: "salesman",
   salaryTier: "tier_1",
   primaryBranchId: "",
   telegramUsername: "",
   phone: "",
   notes: "",
   active: true,
};

type StaffTreeGroup = {
   id: string;
   name: string;
   leaders: StaffView[];
   salesManagers: StaffView[];
   roleGroups: {
      role: ErpStaffRole;
      members: StaffView[];
   }[];
};

const HIERARCHY_ROLE_ORDER: ErpStaffRole[] = ["salesman", "assistant", "cashier"];

function StaffNode({
   member,
   tone = "default",
   onClick,
}: {
   member: StaffView;
   tone?: "leader" | "manager" | "default";
   onClick?: (member: StaffView) => void;
}) {
   const toneClass =
      tone === "leader"
         ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-100"
         : tone === "manager"
           ? "border-sky-500/30 bg-sky-500/10 text-sky-100"
           : "border-slate-700 bg-slate-950/70 text-slate-100";

   return (
      <button
         type="button"
         disabled={!onClick}
         onClick={() => onClick?.(member)}
         className={[
            "flex min-h-[72px] w-full flex-col items-center justify-center rounded-lg border px-3 py-2 text-center transition disabled:cursor-default",
            onClick
               ? "hover:-translate-y-0.5 hover:border-emerald-400/50 hover:bg-slate-900"
               : "",
            toneClass,
         ].join(" ")}>
         <p className="truncate text-sm font-semibold">{member.fullName}</p>
         <p className="mt-1 truncate text-xs opacity-75">{member.roleLabel}</p>
         {!member.active && (
            <span className="mt-2 inline-flex rounded-md border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[10px] text-red-200">
               Inactive
            </span>
         )}
      </button>
   );
}

function EmptyTreeSlot({ label }: { label: string }) {
   return (
      <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-2 text-center text-sm text-slate-500">
         {label}
      </div>
   );
}

export default function StaffManager() {
   const [staff, setStaff] = useState<StaffView[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [authUsers, setAuthUsers] = useState<AuthUserOption[]>([]);
   const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
   const [viewMode, setViewMode] = useState<"hierarchy" | "manage">("hierarchy");
   const [canManageStaff, setCanManageStaff] = useState(false);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const hierarchyGroups = useMemo<StaffTreeGroup[]>(() => {
      const activeStaff = staff.filter((member) => member.active);
      const knownBranchIds = new Set(branches.map((branch) => branch.id));
      const branchGroups = branches.map((branch) => ({
         id: branch.id,
         name: branch.name,
         members: activeStaff.filter((member) => member.primaryBranchId === branch.id),
      }));
      const unassignedMembers = activeStaff.filter(
         (member) => !member.primaryBranchId || !knownBranchIds.has(member.primaryBranchId),
      );

      if (unassignedMembers.length > 0) {
         branchGroups.push({
            id: "unassigned",
            name: "Unassigned staff",
            members: unassignedMembers,
         });
      }

      return branchGroups.map((group) => {
         const leaders = group.members.filter(
            (member) => member.role === "branch_manager" || member.role === "admin",
         );
         const salesManagers = group.members.filter(
            (member) => member.role === "sales_manager",
         );
         const roleGroups = HIERARCHY_ROLE_ORDER.map((role) => ({
            role,
            members: group.members.filter((member) => member.role === role),
         }));

         return {
            id: group.id,
            name: group.name,
            leaders,
            salesManagers,
            roleGroups,
         };
      });
   }, [branches, staff]);

   const loadStaff = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/staff", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load staff.");
         }

         setStaff(payload.staff || []);
         setBranches(payload.branches || []);
         setAuthUsers(payload.authUsers || []);
         setCanManageStaff(payload.canManage === true);
         if (payload.canManage !== true) {
            setViewMode("hierarchy");
            setForm(EMPTY_FORM);
         }
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load staff.",
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void loadStaff();
   }, [loadStaff]);

   const resetForm = () => {
      setForm(EMPTY_FORM);
      setSuccess(null);
      setError(null);
   };

   const editStaff = (member: StaffView) => {
      if (!canManageStaff) return;

      setForm({
         userId: member.userId,
         authUserId: member.authUserId || "",
         fullName: member.fullName,
         role: member.role,
         salaryTier: member.salaryTier || "default",
         primaryBranchId: member.primaryBranchId || "",
         telegramUsername: member.telegramUsername || "",
         phone: member.phone || "",
         notes: member.notes || "",
         active: member.active,
      });
      setViewMode("manage");
      setSuccess(null);
      setError(null);
   };

   const handleAuthUserChange = (authUserId: string) => {
      const selectedUser = authUsers.find((user) => user.id === authUserId);
      setForm((current) => ({
         ...current,
         authUserId,
         fullName: current.fullName || selectedUser?.displayName || "",
      }));
   };

   const submitStaff = async (event: React.FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/staff", {
            method: form.userId && staff.some((member) => member.userId === form.userId)
               ? "PATCH"
               : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(form),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save staff profile.");
         }

         setSuccess("Staff profile saved.");
         setForm(EMPTY_FORM);
         await loadStaff();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save staff profile.",
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="space-y-5">
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
            <button
               type="button"
               onClick={() => setViewMode("hierarchy")}
               className={[
                  "rounded-md px-4 py-2 text-sm font-medium transition",
                  viewMode === "hierarchy"
                     ? "bg-emerald-500 text-slate-950"
                     : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
               ].join(" ")}>
               Hierarchy
            </button>
            {canManageStaff && (
               <button
                  type="button"
                  onClick={() => setViewMode("manage")}
                  className={[
                     "rounded-md px-4 py-2 text-sm font-medium transition",
                     viewMode === "manage"
                        ? "bg-emerald-500 text-slate-950"
                        : "text-slate-400 hover:bg-slate-900 hover:text-slate-100",
                  ].join(" ")}>
                  Manage staff
               </button>
            )}
         </div>

         {viewMode === "hierarchy" && (
            <section className="space-y-4">
               {loading ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
                     <p className="text-sm text-slate-500">Loading hierarchy...</p>
                  </div>
               ) : hierarchyGroups.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center">
                     <PiUsersThreeLight className="mx-auto text-slate-500" size={34} />
                     <p className="mt-3 text-sm text-slate-400">No active staff profiles yet.</p>
                  </div>
               ) : (
                  hierarchyGroups.map((group) => (
                     <div
                        key={group.id}
                        className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/40">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/50 px-5 py-4">
                           <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                                 Branch
                              </p>
                              <h2 className="mt-1 text-lg font-semibold text-white">
                                 {group.name}
                              </h2>
                           </div>
                           <span className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
                              {[
                                 ...group.leaders,
                                 ...group.salesManagers,
                                 ...group.roleGroups.flatMap((roleGroup) => roleGroup.members),
                              ].length} active
                           </span>
                        </div>

                        <div className="p-5 md:p-7">
                           <div className="mx-auto max-w-6xl">
                              <div className="flex flex-wrap justify-center gap-3">
                                 {group.leaders.length > 0 ? (
                                    group.leaders.map((member) => (
                                       <div key={member.userId} className="w-full max-w-[360px]">
                                          <StaffNode
                                             member={member}
                                             tone="leader"
                                             onClick={canManageStaff ? editStaff : undefined}
                                          />
                                       </div>
                                    ))
                                 ) : (
                                    <div className="w-full max-w-[360px]">
                                       <EmptyTreeSlot label="No branch manager or admin assigned" />
                                    </div>
                                 )}
                              </div>

                              <div className="mx-auto h-8 w-px bg-slate-700" />

                              <div className="flex flex-wrap justify-center gap-3">
                                 {group.salesManagers.length > 0 ? (
                                    group.salesManagers.map((member) => (
                                       <div key={member.userId} className="w-full max-w-[320px]">
                                          <StaffNode
                                             member={member}
                                             tone="manager"
                                             onClick={canManageStaff ? editStaff : undefined}
                                          />
                                       </div>
                                    ))
                                 ) : (
                                    <div className="w-full max-w-[320px]">
                                       <EmptyTreeSlot label="No sales manager assigned" />
                                    </div>
                                 )}
                              </div>

                              <div className="mx-auto h-7 w-px bg-slate-700" />
                              <div className="relative mx-auto hidden h-7 max-w-[calc(100%-18rem)] md:block">
                                 <div className="absolute left-0 right-0 top-0 h-px bg-slate-700" />
                                 <div className="absolute left-0 top-0 h-7 w-px bg-slate-700" />
                                 <div className="absolute left-1/2 top-0 h-7 w-px -translate-x-1/2 bg-slate-700" />
                                 <div className="absolute right-0 top-0 h-7 w-px bg-slate-700" />
                              </div>

                              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-slate-800 bg-slate-950/30 md:grid-cols-3">
                                 {group.roleGroups.map((roleGroup, index) => (
                                    <div
                                       key={roleGroup.role}
                                       className={[
                                          "p-4",
                                          index === 0 ? "" : "border-t border-slate-800 md:border-l md:border-t-0",
                                       ].join(" ")}>
                                       <p className="mb-3 text-xs uppercase tracking-[0.16em] text-slate-500">
                                          {ERP_ROLE_LABELS[roleGroup.role]}
                                       </p>
                                       <div className="space-y-3">
                                          {roleGroup.members.length > 0 ? (
                                             roleGroup.members.map((member) => (
                                                <StaffNode
                                                   key={member.userId}
                                                   member={member}
                                                   onClick={canManageStaff ? editStaff : undefined}
                                                />
                                             ))
                                          ) : (
                                             <EmptyTreeSlot label="No staff assigned" />
                                          )}
                                       </div>
                                    </div>
                                 ))}
                              </div>
                           </div>
                        </div>
                     </div>
                  ))
               )}
            </section>
         )}

         {viewMode === "manage" && canManageStaff && (
            <section className="grid grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
            <form
               onSubmit={submitStaff}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  {form.userId && staff.some((member) => member.userId === form.userId) ? (
                     <PiFloppyDiskLight className="text-emerald-300" size={22} />
                  ) : (
                     <PiPlusLight className="text-emerald-300" size={22} />
                  )}
                  <h2 className="text-lg font-semibold text-white">Staff profile</h2>
               </div>

               <div className="mt-4 space-y-4">
                  <label className="block">
                     <span className="text-sm text-slate-300">Auth user</span>
                     <select
                        value={form.authUserId}
                        onChange={(event) => handleAuthUserChange(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     >
                        <option value="">No auth user yet</option>
                        {authUsers.map((user) => (
                           <option key={user.id} value={user.id}>
                              {user.displayName} {user.email ? `(${user.email})` : ""}
                           </option>
                        ))}
                     </select>
                  </label>

                  <label className="block">
                     <span className="text-sm text-slate-300">Full name</span>
                     <input
                        value={form.fullName}
                        onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="Staff full name"
                        required
                     />
                  </label>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <label className="block">
                        <span className="text-sm text-slate-300">Role</span>
                        <select
                           value={form.role}
                           onChange={(event) =>
                              setForm((current) => ({
                                 ...current,
                                 role: event.target.value as ErpStaffRole,
                              }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           {ERP_STAFF_ROLES.map((role) => (
                              <option key={role} value={role}>
                                 {ERP_ROLE_LABELS[role]}
                              </option>
                           ))}
                        </select>
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Branch</span>
                        <select
                           value={form.primaryBranchId}
                           onChange={(event) => setForm((current) => ({ ...current, primaryBranchId: event.target.value }))}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           <option value="">No branch</option>
                           {branches.map((branch) => (
                              <option key={branch.id} value={branch.id}>
                                 {branch.name}
                              </option>
                           ))}
                        </select>
                     </label>
                  </div>

                  {form.role === "salesman" && (
                     <label className="block">
                        <span className="text-sm text-slate-300">Salesman tier</span>
                        <select
                           value={form.salaryTier}
                           onChange={(event) =>
                              setForm((current) => ({ ...current, salaryTier: event.target.value }))
                           }
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400">
                           <option value="tier_1">Tier 1</option>
                           <option value="tier_2">Tier 2</option>
                           <option value="tier_3">Tier 3</option>
                           <option value="tier_4">Tier 4</option>
                        </select>
                     </label>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                     <label className="block">
                        <span className="text-sm text-slate-300">Telegram</span>
                        <input
                           value={form.telegramUsername}
                           onChange={(event) => setForm((current) => ({ ...current, telegramUsername: event.target.value }))}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           placeholder="@username"
                        />
                     </label>

                     <label className="block">
                        <span className="text-sm text-slate-300">Phone</span>
                        <input
                           value={form.phone}
                           onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                           className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                           placeholder="+998"
                        />
                     </label>
                  </div>

                  <label className="block">
                     <span className="text-sm text-slate-300">Notes</span>
                     <textarea
                        value={form.notes}
                        onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                     />
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                     <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                        className="h-4 w-4 accent-emerald-500"
                     />
                     <span className="text-sm text-slate-300">Active staff member</span>
                  </label>
               </div>

               <div className="mt-5 flex gap-2">
                  <button
                     type="submit"
                     disabled={saving}
                     className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-60">
                     <PiFloppyDiskLight size={18} />
                     {saving ? "Saving..." : "Save"}
                  </button>
                  {form.userId && (
                     <button
                        type="button"
                        onClick={resetForm}
                        className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-slate-800">
                        Cancel
                     </button>
                  )}
               </div>
            </form>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <h2 className="text-lg font-semibold text-white">Staff list</h2>

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading staff...</p>
               ) : staff.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiUsersThreeLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No staff profiles yet.</p>
                  </div>
               ) : (
                  <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
                     {staff.map((member) => (
                        <button
                           key={member.userId}
                           type="button"
                           onClick={() => editStaff(member)}
                           className="flex w-full flex-col gap-2 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900 md:flex-row md:items-center md:justify-between">
                           <div>
                              <div className="flex flex-wrap items-center gap-2">
                                 <p className="font-medium text-white">{member.fullName}</p>
                                 <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                                    {member.roleLabel}
                                 </span>
                                 <span
                                    className={[
                                       "rounded-lg border px-2 py-0.5 text-[11px]",
                                       member.active
                                          ? "border-slate-700 bg-slate-800 text-slate-300"
                                          : "border-red-500/25 bg-red-500/10 text-red-200",
                                    ].join(" ")}>
                                    {member.active ? "Active" : "Inactive"}
                                 </span>
                                 <span
                                    className={[
                                       "rounded-lg border px-2 py-0.5 text-[11px]",
                                       member.authUserId
                                          ? "border-sky-500/25 bg-sky-500/10 text-sky-200"
                                          : "border-slate-700 bg-slate-900 text-slate-400",
                                    ].join(" ")}>
                                    {member.authUserId ? "Auth linked" : "No auth"}
                                 </span>
                                 {member.role === "salesman" && (
                                    <span className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-300">
                                       {member.salaryTier.replace("_", " ")}
                                    </span>
                                 )}
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                 {[member.branchName, member.telegramUsername, member.phone]
                                    .filter(Boolean)
                                    .join(" | ") || "No branch or contact details yet"}
                              </p>
                           </div>
                           <span className="text-xs text-slate-500">Edit</span>
                        </button>
                     ))}
                  </div>
               )}
            </div>
            </section>
         )}
      </div>
   );
}
