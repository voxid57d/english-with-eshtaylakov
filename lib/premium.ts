import { supabase } from "@/lib/supabaseClient";

/**
 * Check whether a user is premium.
 *
 * - If there is no row in `profiles`, we just return false.
 * - If there is a real error (like DB down), we return false but
 *   log a warning for debugging.
 */
export async function getPremiumStatus(userId: string | null | undefined) {
   // Safety check – if we somehow call this without an id.
   if (!userId) return false;

   const { data, error } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", userId)
      // `maybeSingle()` = no error when 0 rows, just data = null
      .maybeSingle();

   if (error) {
      // Non-fatal: we don’t want Next.js to scream at us.
      console.warn("Non-fatal error checking premium:", error);
      return false;
   }

   // If there’s no row, `data` will be null → treated as not premium.
   return data?.is_premium === true;
}
