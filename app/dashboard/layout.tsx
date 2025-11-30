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
   const [isPremium, setIsPremium] = useState(false);
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
   }, []);

   if (!user)
      return (
         <main className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
            <Image
               src="/logo-text-white.png"
               alt="Loading"
               width={120}
               height={40}
               className="animate-pulse"
            />
         </main>
      );

   const handleLogout = async () => {
      await supabase.auth.signOut();
      router.push("/");
   };

   return (
      <main className="min-h-screen bg-slate-950 text-white flex flex-col">
         <Navbar user={user} isPremium={isPremium} onLogout={handleLogout} />
         <div className="flex flex-1">
            <Sidebar />
            <section className="flex-1 p-6">{children}</section>
         </div>
      </main>
   );
}
