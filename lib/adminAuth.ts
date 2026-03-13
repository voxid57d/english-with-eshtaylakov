import { supabaseAdmin } from "@/lib/supabaseAdmin";

function getAdminUserIdAllowlist() {
   return (process.env.ADMIN_USER_IDS || "")
      .split(",")
      .map((userId) => userId.trim())
      .filter(Boolean);
}

function getAdminEmailAllowlist() {
   return (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
}

export async function requireAdminUser(req: Request) {
   const authHeader = req.headers.get("authorization");
   const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;

   if (!token) {
      throw new Error("Missing bearer token.");
   }

   const { data, error } = await supabaseAdmin.auth.getUser(token);
   if (error || !data.user) {
      throw new Error("Unauthorized.");
   }

   const userId = data.user.id;
   const email = data.user.email?.trim().toLowerCase() || "";
    const userIdAllowlist = getAdminUserIdAllowlist();
   const allowlist = getAdminEmailAllowlist();

   const hasUserIdAccess =
      userIdAllowlist.length > 0 && userIdAllowlist.includes(userId);
   const hasEmailAccess =
      email.length > 0 && allowlist.length > 0 && allowlist.includes(email);

   if (!hasUserIdAccess && !hasEmailAccess) {
      throw new Error("Forbidden.");
   }

   return data.user;
}
