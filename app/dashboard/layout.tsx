"use client";

import type { User } from "@supabase/supabase-js";
import { memo, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import { getSupabaseAccessToken } from "@/lib/getSupabaseAccessToken";
import { supabase } from "@/lib/supabaseClient";
import { confirmPageLeave } from "@/lib/unsavedChanges";

type DashboardViewer = {
   user: User;
   fullName: string | null;
   roleLabel: string | null;
};

type PendingViewer = {
   user: User;
   message: string;
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
   const [pendingViewer, setPendingViewer] = useState<PendingViewer | null>(null);
   const [isLoadingUser, setIsLoadingUser] = useState(true);
   const [isSidebarOpen, setIsSidebarOpen] = useState(false);
   const router = useRouter();

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
         let fullName: string | null = null;
         let roleLabel: string | null = null;
         let pendingMessage: string | null = null;

         try {
            const token = await getSupabaseAccessToken();
            const response = await fetch("/api/erp/me", {
               headers: { Authorization: `Bearer ${token}` },
               cache: "no-store",
            });
            const payload = await response.json();

            if (response.ok) {
               fullName = payload.staff?.fullName ?? null;
               roleLabel = payload.staff?.roleLabel ?? null;
            } else {
               console.error("Error loading staff profile:", payload.error);
               pendingMessage =
                  typeof payload.error === "string" &&
                  payload.error.includes("staff access is not enabled")
                     ? "If you are IELTS ZONE staff member, please wait for verification."
                     : "Your staff profile is not ready yet. Please wait for verification.";
            }
         } catch (profileError) {
            console.error("Error loading staff profile:", profileError);
            pendingMessage =
               "Your staff profile is not ready yet. Please wait for verification.";
         }

         if (!isActive) return;

         if (pendingMessage) {
            setPendingViewer({
               user: authUser,
               message: pendingMessage,
            });
            setViewer(null);
            setIsLoadingUser(false);
            return;
         }

         setViewer({
            user: authUser,
            fullName,
            roleLabel,
         });
         setPendingViewer(null);
         setIsLoadingUser(false);
      }

      checkUser();

      return () => {
         isActive = false;
      };
   }, [router]);

   const handleLogOut = useCallback(async () => {
      if (!confirmPageLeave()) return;
      await supabase.auth.signOut();
      router.push("/");
   }, [router]);

   const handleOpenSidebar = useCallback(() => {
      setIsSidebarOpen(true);
   }, []);

   const handleCloseSidebar = useCallback(() => {
      setIsSidebarOpen(false);
   }, []);

   if (pendingViewer) {
      return (
         <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
            <section className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
               <BrandLogo className="justify-center" />
               <div className="mt-8 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-5 py-6">
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     Verification
                  </p>
                  <h1 className="mt-3 text-2xl font-semibold text-white">
                     Please wait
                  </h1>
                  <p className="mt-3 text-sm leading-6 text-slate-300">
                     {pendingViewer.message}
                  </p>
                  <p className="mt-3 text-xs text-slate-500">
                     Signed in as {pendingViewer.user.email}
                  </p>
               </div>
               <button
                  type="button"
                  onClick={handleLogOut}
                  className="mt-6 w-full rounded-lg border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-slate-800">
                  Log out
               </button>
            </section>
         </main>
      );
   }

   if (isLoadingUser || !viewer) {
      return (
         <main className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
               <BrandLogo className="animate-pulse" />
               <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin" />
            </div>
         </main>
      );
   }

   return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col">
         <Navbar
            user={viewer.user}
            username={viewer.fullName ?? undefined}
            roleLabel={viewer.roleLabel ?? undefined}
            onLogout={handleLogOut}
            onToggleSidebar={handleOpenSidebar}
         />

         <div className="flex flex-1">
            <Sidebar
               isOpenOnMobile={isSidebarOpen}
               closeMobile={handleCloseSidebar}
            />
            <DashboardContent>{children}</DashboardContent>
         </div>
      </main>
   );
}
