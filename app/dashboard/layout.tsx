"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";
import { getPremiumStatus } from "@/lib/premium";

export default function DashboardLayout({
   children,
}: {
   children: React.ReactNode;
}) {
   const [user, setUser] = useState<any>(null);
   const [isPremium, setIsPremium] = useState<boolean>(false);
   const [isSidebarOpen, setIsSidebarOpen] = useState(false); // mobile sidebar state
   const router = useRouter();

   useEffect(() => {
      const checkUser = async () => {
         const { data } = await supabase.auth.getUser();
         if (!data.user) {
            router.push("/login");
         } else {
            setUser(data.user);
            const premium = await getPremiumStatus(data.user.id);
            setIsPremium(premium);
         }
      };
      checkUser();
   }, [router]);

   if (!user)
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
               <div className="w-8 h-8 border-4 border-slate-700 border-t-emerald-400 rounded-full animate-spin"></div>
            </div>
         </main>
      );

   const handleLogOut = async () => {
      await supabase.auth.signOut();
      router.push("/");
   };

   return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col">
         <Navbar
            user={user}
            isPremium={isPremium}
            onLogout={handleLogOut}
            onToggleSidebar={() => setIsSidebarOpen(true)}
         />

         <div className="flex flex-1">
            {/* Sidebar handles both desktop + mobile versions */}
            <Sidebar
               isOpenOnMobile={isSidebarOpen}
               closeMobile={() => setIsSidebarOpen(false)}
            />

            <section className="flex-1 p-4 md:p-6 space-y-6">
               {children}
            </section>
         </div>
      </main>
   );
}
