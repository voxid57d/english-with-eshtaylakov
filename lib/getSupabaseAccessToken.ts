import { supabase } from "@/lib/supabaseClient";

export async function getSupabaseAccessToken() {
   const {
      data: { session },
      error,
   } = await supabase.auth.getSession();

   if (error) {
      throw new Error("Failed to read your session.");
   }

   if (session?.access_token) {
      return session.access_token;
   }

   const { data: refreshData, error: refreshError } =
      await supabase.auth.refreshSession();

   if (refreshError || !refreshData.session?.access_token) {
      throw new Error("You must sign in again.");
   }

   return refreshData.session.access_token;
}
