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
   fullName: string;
   role: ErpStaffRole;
   roleLabel: string;
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
   fullName: string;
   role: ErpStaffRole;
   primaryBranchId: string;
   telegramUsername: string;
   phone: string;
   notes: string;
   active: boolean;
};

const EMPTY_FORM: StaffForm = {
   userId: "",
   fullName: "",
   role: "salesman",
   primaryBranchId: "",
   telegramUsername: "",
   phone: "",
   notes: "",
   active: true,
};

export default function StaffManager() {
   const [staff, setStaff] = useState<StaffView[]>([]);
   const [branches, setBranches] = useState<BranchOption[]>([]);
   const [authUsers, setAuthUsers] = useState<AuthUserOption[]>([]);
   const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const activeCount = useMemo(
      () => staff.filter((member) => member.active).length,
      [staff],
   );

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
      setForm({
         userId: member.userId,
         fullName: member.fullName,
         role: member.role,
         primaryBranchId: member.primaryBranchId || "",
         telegramUsername: member.telegramUsername || "",
         phone: member.phone || "",
         notes: member.notes || "",
         active: member.active,
      });
      setSuccess(null);
      setError(null);
   };

   const handleUserChange = (userId: string) => {
      const selectedUser = authUsers.find((user) => user.id === userId);
      setForm((current) => ({
         ...current,
         userId,
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
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Team
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Staff
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Connect logged-in users to Amir Temur roles and branches before assigning work, shifts, and KPI.
                  </p>
               </div>
               <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <p className="text-xs text-slate-500">Active staff</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{activeCount}</p>
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
                        value={form.userId}
                        onChange={(event) => handleUserChange(event.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        required>
                        <option value="">Choose logged-in user</option>
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
      </div>
   );
}
