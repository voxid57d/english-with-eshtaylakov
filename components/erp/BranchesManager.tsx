"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PiFloppyDiskLight, PiMapPinLineLight, PiPlusLight } from "react-icons/pi";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

type BranchView = {
   id: string;
   name: string;
   address: string | null;
   phone: string | null;
   active: boolean;
};

type BranchForm = {
   id: string;
   name: string;
   address: string;
   phone: string;
   active: boolean;
};

const EMPTY_FORM: BranchForm = {
   id: "",
   name: "",
   address: "",
   phone: "",
   active: true,
};

export default function BranchesManager() {
   const [branches, setBranches] = useState<BranchView[]>([]);
   const [form, setForm] = useState<BranchForm>(EMPTY_FORM);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [success, setSuccess] = useState<string | null>(null);

   const activeCount = useMemo(
      () => branches.filter((branch) => branch.active).length,
      [branches],
   );

   const loadBranches = useCallback(async () => {
      try {
         setLoading(true);
         setError(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/branches", {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to load branches.");
         }

         setBranches(payload.branches || []);
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to load branches.",
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void loadBranches();
   }, [loadBranches]);

   const resetForm = () => {
      setForm(EMPTY_FORM);
      setSuccess(null);
      setError(null);
   };

   const editBranch = (branch: BranchView) => {
      setForm({
         id: branch.id,
         name: branch.name,
         address: branch.address || "",
         phone: branch.phone || "",
         active: branch.active,
      });
      setSuccess(null);
      setError(null);
   };

   const submitBranch = async (event: React.FormEvent) => {
      event.preventDefault();

      try {
         setSaving(true);
         setError(null);
         setSuccess(null);
         const token = await getSupabaseAccessToken();
         const response = await fetch("/api/erp/branches", {
            method: form.id ? "PATCH" : "POST",
            headers: {
               "Content-Type": "application/json",
               Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(form),
         });
         const payload = await response.json();

         if (!response.ok) {
            throw new Error(payload.error || "Failed to save branch.");
         }

         setSuccess(form.id ? "Branch updated." : "Branch created.");
         setForm(EMPTY_FORM);
         await loadBranches();
      } catch (requestError) {
         setError(
            requestError instanceof Error
               ? requestError.message
               : "Failed to save branch.",
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
                     Network
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     Branches
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     Create the branch records that staff, KPI, shifts, tasks, and metrics will connect to.
                  </p>
               </div>
               <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-4 py-3">
                  <p className="text-xs text-slate-500">Active branches</p>
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

         <section className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
            <form
               onSubmit={submitBranch}
               className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <div className="flex items-center gap-2">
                  {form.id ? <PiFloppyDiskLight className="text-emerald-300" size={22} /> : <PiPlusLight className="text-emerald-300" size={22} />}
                  <h2 className="text-lg font-semibold text-white">
                     {form.id ? "Edit branch" : "New branch"}
                  </h2>
               </div>

               <div className="mt-4 space-y-4">
                  <label className="block">
                     <span className="text-sm text-slate-300">Name</span>
                     <input
                        value={form.name}
                        onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="Chilonzor branch"
                        required
                     />
                  </label>

                  <label className="block">
                     <span className="text-sm text-slate-300">Address</span>
                     <input
                        value={form.address}
                        onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-emerald-400"
                        placeholder="Street, building, landmark"
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

                  <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2">
                     <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                        className="h-4 w-4 accent-emerald-500"
                     />
                     <span className="text-sm text-slate-300">Active branch</span>
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
                  {form.id && (
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
               <h2 className="text-lg font-semibold text-white">Branch list</h2>

               {loading ? (
                  <p className="mt-4 text-sm text-slate-500">Loading branches...</p>
               ) : branches.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/50 p-5 text-center">
                     <PiMapPinLineLight className="mx-auto text-slate-500" size={32} />
                     <p className="mt-2 text-sm text-slate-400">No branches yet.</p>
                  </div>
               ) : (
                  <div className="mt-4 divide-y divide-slate-800 overflow-hidden rounded-lg border border-slate-800">
                     {branches.map((branch) => (
                        <button
                           key={branch.id}
                           type="button"
                           onClick={() => editBranch(branch)}
                           className="flex w-full flex-col gap-2 bg-slate-950/30 px-4 py-3 text-left transition hover:bg-slate-900 md:flex-row md:items-center md:justify-between">
                           <div>
                              <div className="flex flex-wrap items-center gap-2">
                                 <p className="font-medium text-white">{branch.name}</p>
                                 <span
                                    className={[
                                       "rounded-lg border px-2 py-0.5 text-[11px]",
                                       branch.active
                                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                                          : "border-slate-700 bg-slate-800 text-slate-400",
                                    ].join(" ")}>
                                    {branch.active ? "Active" : "Archived"}
                                 </span>
                              </div>
                              <p className="mt-1 text-sm text-slate-500">
                                 {[branch.address, branch.phone].filter(Boolean).join(" | ") || "No address or phone yet"}
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
