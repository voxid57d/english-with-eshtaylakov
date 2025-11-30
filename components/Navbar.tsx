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
   /** Called when the user taps the hamburger menu on mobile. */
   onToggleSidebar: () => void;
};

export default function Navbar({
   user,
   isPremium,
   onLogout,
   onToggleSidebar,
}: NavbarProps) {
   return (
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-slate-800">
         <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
               onClick={onToggleSidebar}
               className="md:hidden p-2 rounded-lg border border-slate-800 text-slate-100 hover:bg-slate-900 cursor-pointer"
               aria-label="Open navigation menu">
               ☰
            </button>

            {/* Logo */}
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
         </div>

         <div className="flex items-center gap-3 md:gap-4 flex-wrap justify-end">
            {/* Hide email on very small screens to avoid overflow */}
            <span className="hidden sm:inline text-sm text-slate-200">
               {user.email}
            </span>

            {/* Avatar */}
            {user.user_metadata?.avatar_url ? (
               <Image
                  src={user.user_metadata.avatar_url}
                  alt={user.email}
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full object-cover"
               />
            ) : (
               <div className="h-10 w-10 flex items-center justify-center rounded-full bg-emerald-600 text-sm">
                  {user.email[0].toUpperCase()}
               </div>
            )}

            {/* Premium badge / link */}
            {isPremium ? (
               <span className="text-xs px-2 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Premium
               </span>
            ) : (
               <Link
                  href="/premium"
                  className="text-xs px-3 py-1 rounded-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 transition">
                  Go Premium
               </Link>
            )}

            {/* Log out */}
            <button
               onClick={onLogout}
               className="px-3 md:px-4 py-2 rounded-full bg-slate-800 hover:bg-slate-700 text-sm cursor-pointer">
               Log out
            </button>
         </div>
      </header>
   );
}
