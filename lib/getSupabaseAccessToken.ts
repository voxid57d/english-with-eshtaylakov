import { supabase } from "@/lib/supabaseClient";

export async function getSupabaseAccessToken() {
   const {
      data: { session },
      error,
   } = await supabase.auth.getSession();

   if (error) {
      throw new Error("Failed to read your session.");
   }

   const nowSeconds = Math.floor(Date.now() / 1000);
   const expiresAt = session?.expires_at ?? 0;
   const needsRefresh =
      !session?.access_token || (expiresAt > 0 && expiresAt <= nowSeconds + 30);

   if (!needsRefresh && session?.access_token) {
      return session.access_token;
   }

   const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();

   if (refreshError || !refreshData.session?.access_token) {
      throw new Error("You must sign in again.");
   }

   return refreshData.session.access_token;
}
