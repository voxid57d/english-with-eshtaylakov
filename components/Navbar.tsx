"use client";

import Image from "next/image";
import Link from "next/link";

type NavbarProps = {
   user: {
      email: string;
      user_metadata?: {
         avatar_url?: string;
      };
   };
   isPremium: boolean;
   onLogout: () => void;
};

export default function Navbar({ user, isPremium, onLogout }: NavbarProps) {
   return (
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
         <Link href="/dashboard">
            <Image
               src="/logo-text-white.png"
               alt="TalkTime logo"
               width={144}
               height={36}
               className="h-9 w-auto cursor-pointer"
            />
         </Link>

         <div className="flex items-center gap-4">
            {isPremium ? (
               <span className="px-3 py-1 text-sm rounded-full bg-emerald-600/20 border border-emerald-500 text-emerald-300">
                  Premium
               </span>
            ) : (
               <Link
                  href="/premium"
                  className="px-3 py-1 text-sm rounded-full bg-slate-800 hover:bg-slate-700">
                  Go premium
               </Link>
            )}

            <span className="text-sm text-slate-200">{user.email}</span>

            {user.user_metadata?.avatar_url ? (
               <Image
                  src={user.user_metadata.avatar_url}
                  alt={user.email}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full"
               />
            ) : (
               <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-600">
                  {user.email[0].toUpperCase()}
               </div>
            )}

            <button
               onClick={onLogout}
               className="px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer">
               Log out
            </button>
         </div>
      </header>
   );
}
