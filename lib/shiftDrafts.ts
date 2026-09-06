// Clear only the versions that were saved; preserve edits made during a request.
export function removeSavedDrafts<T>(current: Record<string, T>, saved: Record<string, T>) {
   return Object.fromEntries(
      Object.entries(current).filter(([id, draft]) => draft !== saved[id]),
   );
}

export function createLatestRequest() {
   let active: AbortController | null = null;
   return {
      begin() {
         active?.abort();
         const request = new AbortController();
         active = request;
         return {
            signal: request.signal,
            isCurrent: () => active === request && !request.signal.aborted,
         };
      },
      cancel() {
         active?.abort();
         active = null;
      },
   };
}
