"use client";
import { useEffect, useState } from "react";
import { FINANCE_TABLES, prepareUzsBackup, type FinanceBackup } from "@/lib/financeBackup";
import { nativeFinance, restoreOfflineFinance, type BackupStatus } from "@/lib/offlineFinance";
import styles from "./private-finance.module.css";

type NativeEvent = { kind: string; text?: string; error?: string; message?: string };
export default function FinanceBackups({ offline, refresh }: { offline: boolean; refresh: () => Promise<void> }) {
   const [status, setStatus] = useState<BackupStatus | null>(null);
   const [pending, setPending] = useState<FinanceBackup | null>(null);
   const [message, setMessage] = useState("");
   const [busy, setBusy] = useState(false);
   useEffect(() => {
      if (!offline) return;
      const update = () => { try { setStatus(JSON.parse(nativeFinance().backupStatus())); } catch (error) { setMessage(String(error)); } };
      update();
      const receive = (event: Event) => {
         const detail = (event as CustomEvent<NativeEvent>).detail;
         if (detail.kind === "import" && detail.text) {
            try { setPending(prepareUzsBackup(JSON.parse(detail.text))); setMessage(""); }
            catch (error) { setMessage(error instanceof Error ? error.message : "Invalid backup."); }
         } else setMessage(detail.error || detail.message || "");
         update();
      };
      window.addEventListener("finance-native", receive);
      const timer = window.setInterval(update, 5000);
      return () => { window.removeEventListener("finance-native", receive); window.clearInterval(timer); };
   }, [offline]);

   async function exportWebsite() {
      try {
         setBusy(true); setMessage("");
         const response = await fetch("/api/private-finance/backup", { cache: "no-store" });
         if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Export failed."); }
         const url = URL.createObjectURL(await response.blob());
         const link = document.createElement("a"); link.href = url; link.download = `quiet-money-website-${new Date().toISOString().slice(0, 10)}.json`; link.click();
         window.setTimeout(() => URL.revokeObjectURL(url), 60000);
         setMessage("Export downloaded. Keep this original file and import it in the Android app.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
      finally { setBusy(false); }
   }
   async function restore() {
      if (!pending) return;
      try { restoreOfflineFinance(pending); setPending(null); await refresh(); setStatus(JSON.parse(nativeFinance().backupStatus())); setMessage("All records restored. Check your account balances and history."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Restore failed."); }
   }
   const run = (action: () => void) => { try { action(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the file picker."); } };
   return <section className={styles.backupPanel}>
      <p className={styles.eyebrow}>{offline ? "On this phone · UZS only" : "All months · all records"}</p>
      <h1>Backups & restore</h1>
      <p>{offline ? "Your changes are saved on this phone immediately. Export a copy and keep it outside the phone so you can restore it after loss or replacement." : "Export your complete finance history to move it into the offline Android app. No records are removed from the website."}</p>
      <div className={styles.backupActions}>
         <button className={styles.primaryButton} disabled={busy} onClick={() => offline ? run(() => nativeFinance().exportBackup()) : void exportWebsite()}>{busy ? "Exporting…" : "Export all data"}</button>
         {offline && <button className={styles.secondaryButton} onClick={() => run(() => nativeFinance().importBackup())}>Import / restore</button>}
      </div>
      {offline && <div className={styles.backupCard}>
         <h2>Daily automatic backup</h2>
         <p>{status?.folder ? `Folder: ${status.folder}` : "Choose a backup folder to turn on daily backups."}</p>
         <p>Android may delay background work. The app also checks for a due backup when opened. Recent daily copies are kept; export a separate copy before uninstalling or changing phones.</p>
         <p>{status?.lastBackup ? `Last successful backup: ${new Date(status.lastBackup).toLocaleString()}` : "No automatic backup yet."}</p>
         {status?.error && <p role="alert">{status.error}</p>}
         <div className={styles.backupActions}><button className={styles.secondaryButton} onClick={() => run(() => nativeFinance().chooseBackupFolder())}>{status?.folder ? "Change backup folder" : "Choose backup folder"}</button><button className={styles.secondaryButton} disabled={!status?.folder} onClick={() => run(() => nativeFinance().backupNow())}>Back up now</button></div>
      </div>}
      {pending && <div className={styles.backupCard}>
         <h2>Review before restoring</h2>
         <p>This replaces all records currently on this phone. A recovery copy of the current records is saved first.</p>
         <ul>{FINANCE_TABLES.map(table => <li key={table}>{table === "debtPayments" ? "Debt payments" : table}: {pending.tables[table].length}</li>)}</ul>
         {pending.migration && pending.migration.convertedRecords > 0 && <p>USD records will become UZS. Transactions use historical rates; other amounts use {pending.migration.rate.toLocaleString()} UZS per USD. Opening balances are adjusted to preserve your website account totals. Keep the original export.</p>}
         <div className={styles.backupActions}><button className={styles.primaryButton} onClick={() => void restore()}>Replace data & restore</button><button className={styles.secondaryButton} onClick={() => setPending(null)}>Cancel</button></div>
      </div>}
      {offline && status?.recoveryAvailable && <button className={styles.secondaryButton} onClick={() => run(() => setPending(prepareUzsBackup(JSON.parse(nativeFinance().recoveryState()))))}>Review records from before last restore</button>}
      {message && <p role="status">{message}</p>}
      {!offline && <p>On your phone: open Backups → Import / restore → choose this JSON file → review the counts → Replace data & restore.</p>}
   </section>;
}
