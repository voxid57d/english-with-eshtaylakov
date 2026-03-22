import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const MAINTENANCE_PATH = "/maintenance";

function isMaintenanceEnabled() {
   return process.env.MAINTENANCE_MODE === "true";
}

function isPublicPath(pathname: string) {
   return (
      pathname === MAINTENANCE_PATH ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/favicon") ||
      pathname.startsWith("/public") ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/auth/callback") ||
      pathname.startsWith("/signup") ||
      pathname.startsWith("/login") ||
      pathname.startsWith("/forgot-password") ||
      pathname.startsWith("/reset-password") ||
      pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$/i) !== null
   );
}

function getAdminUserIds() {
   return new Set(
      (process.env.ADMIN_USER_IDS || "")
         .split(",")
         .map((value) => value.trim())
         .filter(Boolean),
   );
}

function getSupabaseUserId(req: NextRequest) {
   const possibleCookies = req.cookies.getAll();

   for (const cookie of possibleCookies) {
      if (!cookie.name.startsWith("sb-")) continue;
      if (!cookie.name.endsWith("-auth-token")) continue;

      try {
         const parsed = JSON.parse(cookie.value);
         const accessToken =
            parsed?.access_token ||
            parsed?.currentSession?.access_token ||
            parsed?.session?.access_token;

         if (typeof accessToken !== "string") {
            continue;
         }

         const payload = JSON.parse(
            Buffer.from(accessToken.split(".")[1], "base64url").toString("utf8"),
         ) as { sub?: string };

         if (typeof payload.sub === "string" && payload.sub) {
            return payload.sub;
         }
      } catch {
         continue;
      }
   }

   return null;
}

export function proxy(req: NextRequest) {
   if (!isMaintenanceEnabled()) {
      return NextResponse.next();
   }

   const { pathname } = req.nextUrl;

   if (isPublicPath(pathname)) {
      return NextResponse.next();
   }

   const userId = getSupabaseUserId(req);
   const adminUserIds = getAdminUserIds();

   if (userId && adminUserIds.has(userId)) {
      return NextResponse.next();
   }

   const maintenanceUrl = new URL(MAINTENANCE_PATH, req.url);
   return NextResponse.redirect(maintenanceUrl);
}

export const config = {
   matcher: ["/((?!_next/static|_next/image|robots.txt|sitemap.xml).*)"],
};
