"use client";
import { log } from "console";
import Image from "next/image";
import Link from "next/link";

type NavbarProps = {
   user: {
      email: string;
      user_metadata?: {
         avatar_url?: string;
      };
   };
   onLogout: () => void;
};

export default function Navbar({ user, onLogout }: NavbarProps) {
   console.log(user);

   return (
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
         <Link
            href="/dashboard"
            className="hover:opacity-90 transition cursor-pointer">
            <Image
               src="/logo-text-white.png"
               alt="TalkTime logo"
               width={144}
               height={36}
               className="h-9 w-auto"
            />
         </Link>

         <div className="flex items-center gap-4">
            <span className="text-sm text-slate-200">{user.email}</span>
            {user.user_metadata?.avatar_url ? (
               <Image
                  src={user.user_metadata.avatar_url}
                  alt={user.email}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
               />
            ) : (
               <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-600">
                  {user.email[0].toUpperCase()}
               </div>
            )}

            <button
               onClick={onLogout}
               className="px-4 cursor-pointer py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm">
               Log out
            </button>
         </div>
      </header>
   );
}
