"use client";

import type { User } from "@supabase/supabase-js";
import { memo } from "react";
import Image from "next/image";
import Link from "next/link";
import { LuLogOut } from "react-icons/lu";

type NavbarProps = {
   user: Pick<User, "email" | "user_metadata">;
   username?: string;
   isPremium: boolean;
   onLogout: () => void;
   onToggleSidebar: () => void;
};

function Navbar({
   user,
   username,
   isPremium,
   onLogout,
   onToggleSidebar,
}: NavbarProps) {
   const displayName = username ?? "";
   const fallbackIdentity = user.email ?? "User";
   const avatarLetter = (username || fallbackIdentity)[0]?.toUpperCase();

   return (
      <header className="flex items-center justify-between px-3 md:px-6 py-2 border-b border-slate-800">
         <div className="flex items-center gap-2">
            <button
               onClick={onToggleSidebar}
               className="md:hidden inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full
                  border border-emerald-400/70 bg-slate-900/90
                  text-slate-100 shadow-sm shadow-emerald-900/40
                  hover:bg-emerald-500 hover:text-slate-950 hover:border-emerald-300
                  transition">
               <span className="flex flex-col gap-[3px]">
                  <span className="w-3.5 h-[2px] rounded-full bg-current" />
                  <span className="w-3.5 h-[2px] rounded-full bg-current" />
                  <span className="w-3.5 h-[2px] rounded-full bg-current" />
               </span>
               <span className="inline text-xs font-medium">Menu</span>
            </button>

            <Link
               href="/dashboard"
               className="hover:opacity-90 transition cursor-pointer">
               <Image
                  src="/logo-text-white.png"
                  alt="TalkTime logo"
                  width={120}
                  height={32}
                  className="h-5 w-auto md:h-7"
               />
            </Link>
         </div>

         <div className="flex items-center gap-1.5 md:gap-3 flex-nowrap">
            {displayName && (
               <Link
                  href="/username"
                  className="hidden sm:inline text-xs md:text-sm text-slate-200 max-w-[140px] truncate hover:text-emerald-300 transition cursor-pointer"
                  title="Change username">
                  {displayName}
               </Link>
            )}

            <Link
               href="/username"
               className="cursor-pointer"
               title="Change username">
               {user.user_metadata?.avatar_url ? (
                  <Image
                     src={user.user_metadata.avatar_url}
                     alt={displayName || fallbackIdentity}
                     width={32}
                     height={32}
                     className="h-8 w-8 rounded-full object-cover"
                  />
               ) : (
                  <div className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-600 text-xs md:text-sm">
                     {avatarLetter}
                  </div>
               )}
            </Link>

            <Link
               href="/username"
               className="hidden sm:inline-flex text-[11px] md:text-xs px-2.5 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition whitespace-nowrap">
               Edit username
            </Link>

            {isPremium ? (
               <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                  Premium
               </span>
            ) : (
               <Link
                  href="/premium"
                  className="text-[11px] md:text-xs px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition whitespace-nowrap">
                  Go Premium
               </Link>
            )}

            <button
               onClick={onLogout}
               className="cursor-pointer hidden sm:inline-flex items-center gap-1
                  text-xs md:text-sm px-2.5 py-1 rounded-full border border-slate-700
                  text-slate-300 hover:bg-slate-800 transition whitespace-nowrap">
               <LuLogOut size={14} />
               <span>Log out</span>
            </button>

            <button
               onClick={onLogout}
               className="cursor-pointer inline-flex sm:hidden items-center justify-center
                  w-8 h-8 rounded-full border border-slate-700 text-slate-300
                  hover:bg-slate-800 transition"
               aria-label="Log out">
               <LuLogOut size={16} />
            </button>
         </div>
      </header>
   );
}

export default memo(Navbar);
