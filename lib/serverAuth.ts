import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getBearerToken(req: Request) {
   const authHeader = req.headers.get("authorization");
   return authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
}

export async function requireAuthenticatedUser(req: Request) {
   const token = getBearerToken(req);

   if (!token) {
      throw new Error("Missing bearer token.");
   }

   const { data, error } = await supabaseAdmin.auth.getUser(token);
   if (error || !data.user) {
      throw new Error("Unauthorized.");
   }

   return data.user;
}
