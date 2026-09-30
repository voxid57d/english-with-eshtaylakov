"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { installUnsavedChangesGuard } from "@/lib/unsavedChanges";
export async function trainingRequest<T>(
  query = "",
  payload?: unknown,
  method = "POST",
  signal?: AbortSignal,
): Promise<T> {
  const token = await getSupabaseAccessToken();
  const response = await fetch(`/api/train${query ? `?${query}` : ""}`, {
    method: payload ? method : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(payload ? { "Content-Type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      window.dispatchEvent(new Event("training:access-lost"));
    throw new Error(data.error || "Request failed. Please retry.");
  }
  return data as T;
}
export function useTrainingQuery<T>(query: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      setData(null);
      void trainingRequest<T>(query, undefined, "GET", abort.signal)
        .then((value) => {
          if (!abort.signal.aborted) setData(value);
        })
        .catch((cause) => {
          if (!abort.signal.aborted) setError(cause.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, version]);
  return { data, error, loading, reload };
}
export function useTrainingAction() {
  const lock = useRef(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please retry.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, run };
}
export function useTrainingDirty(dirty: boolean) {
  useEffect(
    () =>
      dirty
        ? installUnsavedChangesGuard(
            "You have unsaved training changes. Leave and discard them?",
          )
        : undefined,
    [dirty],
  );
}
