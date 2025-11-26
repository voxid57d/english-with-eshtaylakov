"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import Image from "next/image";

import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export default function DashboardLayout({
   children,
}: {
   children: React.ReactNode;
}) {
   const [user, setUser] = useState<any>(null);
   const router = useRouter();

   useEffect(() => {
      const checkUser = async () => {
         const { data } = await supabase.auth.getUser();
         if (!data.user) {
            router.push("/login");
         } else {
            setUser(data.user);
         }
      };
      checkUser();
   }, []);

   if (!user)
      return (
         <main className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
               {/* Logo */}
               <Image
                  src="/logo-text-white.png"
                  alt="TalkTime logo"
                  width={120}
                  height={40}
                  className="w-auto h-10 opacity-90 animate-pulse"
               />

               {/* Spinner */}
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
         <Navbar user={user} onLogout={handleLogOut} />
         <div className="flex flex-1">
            <Sidebar />
            <section className="flex-1 p-6 space-y-6">{children}</section>
         </div>
      </main>
   );
}
