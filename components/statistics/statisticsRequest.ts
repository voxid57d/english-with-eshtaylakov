import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";

/** Calls the Statistics API: GET with a query string, POST when a body is given. */
export async function statisticsRequest(path: string, body?: unknown, signal?: AbortSignal) {
   const token = await getSupabaseAccessToken();
   const response = await fetch(`/api/erp/statistics${path}`, {
      method: body ? "POST" : "GET", cache: "no-store", signal,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
   });
   const result = await response.json();
   if (!response.ok) throw new Error(result.error || "Could not load statistics.");
   return result;
}
