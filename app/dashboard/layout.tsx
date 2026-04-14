"use client";

import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { memo, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { getPremiumStatus } from "@/lib/premium";
import { supabase } from "@/lib/supabaseClient";
import { syncDailyStreak } from "@/lib/userStats";

type DashboardViewer = {
   user: User;
   isPremium: boolean;
   username: string | null;
};

const DashboardContent = memo(function DashboardContent({
   children,
}: {
   children: React.ReactNode;
}) {
   return <section className="flex-1 p-4 md:p-6 space-y-6">{children}</section>;
});

export default function DashboardLayout({
   children,
}: {
   children: React.ReactNode;
}) {
   const [viewer, setViewer] = useState<DashboardViewer | null>(null);
   const [isLoadingUser, setIsLoadingUser] = useState(true);
   const [isSidebarOpen, setIsSidebarOpen] = useState(false);
   const router = useRouter();
   const pathname = usePathname();

   useEffect(() => {
      let isActive = true;

      async function checkUser() {
         let { data, error } = await supabase.auth.getUser();
         let refreshFailureMessage: string | null = null;

         if (!data.user) {
            try {
               await getSupabaseAccessToken();
               const retryResult = await supabase.auth.getUser();
               data = retryResult.data;
               error = retryResult.error;
            } catch (refreshError) {
               refreshFailureMessage =
                  refreshError instanceof Error
                     ? refreshError.message
                     : "Failed to refresh your session.";
            }
         }

          if (error || refreshFailureMessage) {
            console.error("Error getting user:", error);
            router.push("/login");
            return;
         }

         if (!data.user) {
            router.push("/login");
            return;
         }

         const authUser = data.user;
         const [premium, profileResult] = await Promise.all([
            getPremiumStatus(authUser.id),
            supabase
               .from("profiles")
               .select("username")
               .eq("id", authUser.id)
               .maybeSingle(),
         ]);

         if (!isActive) return;

         if (profileResult.error) {
            console.error("Error loading profile:", profileResult.error);
         }

         if (!profileResult.data?.username) {
            console.log("No username found in profiles for user:", authUser.id);
         }

         setViewer({
            user: authUser,
            isPremium: premium,
            username: profileResult.data?.username ?? null,
         });
         setIsLoadingUser(false);

         void syncDailyStreak(authUser.id).catch((error) => {
            console.error("Background streak sync failed:", error);
         });
      }

      checkUser();

      return () => {
         isActive = false;
      };
   }, [router]);

   const handleLogOut = useCallback(async () => {
      await supabase.auth.signOut();
      router.push("/");
   }, [router]);

   const handleOpenSidebar = useCallback(() => {
      setIsSidebarOpen(true);
   }, []);

   const handleCloseSidebar = useCallback(() => {
      setIsSidebarOpen(false);
   }, []);

   const isImmersiveWritingRoute = /^\/dashboard\/writing\/(1|2)\/[^/]+$/.test(
      pathname
   );

   if (isLoadingUser || !viewer) {
      return (
         <main className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
               <Image
                  src="/logo-text-white.png"
                  alt="TalkTime logo"
                  width={120}
                  height={40}
                  className="w-auto h-10 opacity-90 animate-pulse"
               />
               <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
            </div>
         </main>
      );
   }

   return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col">
         {isImmersiveWritingRoute ? (
            children
         ) : (
            <>
               <Navbar
                  user={viewer.user}
                  username={viewer.username ?? undefined}
                  isPremium={viewer.isPremium}
                  onLogout={handleLogOut}
                  onToggleSidebar={handleOpenSidebar}
               />

               <div className="flex flex-1">
                  <Sidebar
                     isOpenOnMobile={isSidebarOpen}
                     closeMobile={handleCloseSidebar}
                     isPremium={viewer.isPremium}
                  />
                  <DashboardContent>{children}</DashboardContent>
               </div>
            </>
         )}
      </main>
   );
}
