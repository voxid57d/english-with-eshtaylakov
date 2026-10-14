import { emptyFinanceBackup, financePayload, mutateFinance, prepareUzsBackup, validateFinanceBackup, type FinanceBackup } from "./financeBackup";
import { getLocalDateString } from "./localDate";
import type { FinanceTransport } from "../components/private-finance/PrivateFinanceApp";

export type BackupStatus = { folder: string | null; lastBackup: string | null; error: string | null; recoveryAvailable: boolean };
export type FinanceNativeBridge = {
   readState(): string;
   saveState(value: string): string;
   restoreState(value: string): string;
   recoveryState(): string;
   backupStatus(): string;
   exportBackup(): void;
   importBackup(): void;
   chooseBackupFolder(): void;
   backupNow(): void;
};
declare global { interface Window { FinanceNative?: FinanceNativeBridge; FinanceBack?: () => boolean } }

export function nativeFinance() {
   const bridge = window.FinanceNative;
   if (!bridge) throw new Error("Open the installed offline Android app to use local backups.");
   return bridge;
}
let current: FinanceBackup | null = null;
function state() {
   if (!current) {
      const saved = nativeFinance().readState();
      current = saved ? validateFinanceBackup(JSON.parse(saved)) : emptyFinanceBackup();
   }
   return current;
}
function persist(next: FinanceBackup, restoring = false) {
   const result = JSON.parse(restoring ? nativeFinance().restoreState(JSON.stringify(next)) : nativeFinance().saveState(JSON.stringify(next))) as { ok: boolean; error?: string };
   if (!result.ok) throw new Error(result.error || "Could not save records to this phone.");
   current = next;
}
export const offlineFinance: FinanceTransport = {
   async load(month) { return financePayload(state(), month, getLocalDateString()); },
   async request(method, body) {
      const next = mutateFinance(state(), method, body, crypto.randomUUID(), new Date().toISOString());
      persist(next);
      return { ok: true };
   },
};
export function restoreOfflineFinance(backup: FinanceBackup) { persist(prepareUzsBackup(backup), true); }

