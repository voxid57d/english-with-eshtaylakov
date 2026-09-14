"use client";

import { useRef, useState, type FormEvent } from "react";
import { parseProfileLink } from "@/lib/marketingMetrics";
import styles from "./marketing.module.css";

export default function PlatformProfileLink({ centreName, platformName, url, canManage, onSave }: {
   centreName: string;
   platformName: string;
   url?: string;
   canManage: boolean;
   onSave: (url: string) => Promise<void>;
}) {
   const dialog = useRef<HTMLDialogElement>(null);
   const submitting = useRef(false);
   const [value, setValue] = useState("");
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState("");

   function edit() {
      setValue(url || ""); setError("");
      dialog.current?.showModal();
   }

   async function save(event: FormEvent) {
      event.preventDefault();
      if (submitting.current) return;
      submitting.current = true; setSaving(true); setError("");
      try {
         await onSave(parseProfileLink(value));
         dialog.current?.close();
      } catch (cause) {
         setError(cause instanceof Error ? cause.message : "Could not save this link. Please retry.");
      } finally { submitting.current = false; setSaving(false); }
   }

   return <div className={styles.platformProfile}>
      {url ? <a className={styles.platformName} href={url} target="_blank" rel="noopener noreferrer" title={`Open ${centreName} on ${platformName} in a new tab`}>{platformName}</a>
         : canManage ? <button type="button" className={styles.platformName} onClick={edit} title={`Add ${centreName}'s ${platformName} link`}>{platformName}</button>
            : <span title="No profile link added yet">{platformName}</span>}
      {url && canManage && <button type="button" className={styles.editProfile} onClick={edit} aria-label={`Edit ${centreName}'s ${platformName} link`} title="Edit profile link">✎</button>}
      {canManage && <dialog ref={dialog} className={styles.linkDialog} aria-label={`${centreName} · ${platformName} profile link`} onCancel={(event) => { if (submitting.current) event.preventDefault(); }}>
         <form onSubmit={(event) => void save(event)}>
            <h2>{url ? "Edit" : "Add"} profile link</h2>
            <p>{centreName} · {platformName}</p>
            <label className={styles.field}>Social profile URL<input name="profileUrl" type="text" inputMode="url" autoComplete="url" required maxLength={2048} placeholder="https://t.me/your_centre" value={value} disabled={saving} onChange={(event) => setValue(event.target.value)} /></label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <div className={styles.dialogActions}><button type="button" className={styles.secondary} disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button><button type="submit" className={styles.primary} disabled={saving}>{saving ? "Saving…" : "Save link"}</button></div>
         </form>
      </dialog>}
   </div>;
}
