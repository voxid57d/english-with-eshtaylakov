"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
   { href: "/dashboard/vocabulary", label: "Vocabulary" },
   { href: "/dashboard/reading", label: "Reading" },
   { href: "/dashboard/listening", label: "Listening" },
];

type SidebarProps = {
   /** Is the mobile sidebar currently open? */
   isOpenOnMobile: boolean;
   /** Close handler for mobile sidebar (e.g. clicking backdrop or link). */
   closeMobile: () => void;
};

export default function Sidebar({ isOpenOnMobile, closeMobile }: SidebarProps) {
   const pathname = usePathname();

   const navLinks = (
      <nav className="space-y-2">
         {links.map((link) => {
            const isActive = pathname.startsWith(link.href);

            return (
               <Link
                  key={link.href}
                  href={link.href}
                  onClick={closeMobile} // close mobile sidebar when navigating
                  className={
                     "block px-3 py-2 rounded-lg text-sm " +
                     (isActive
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-900")
                  }>
                  {link.label}
               </Link>
            );
         })}
      </nav>
   );

   return (
      <>
         {/* Desktop sidebar */}
         <aside className="hidden md:block w-64 bg-slate-950 border-r border-slate-800 p-6">
            {navLinks}
         </aside>

         {/* Mobile sidebar overlay */}
         {isOpenOnMobile && (
            <div className="fixed inset-0 z-40 md:hidden">
               {/* Backdrop */}
               <div
                  className="absolute inset-0 bg-black/50"
                  onClick={closeMobile}
               />

               {/* Sliding panel */}
               <aside className="relative z-50 w-64 h-full bg-slate-950 border-r border-slate-800 p-6">
                  <button
                     onClick={closeMobile}
                     className="mb-4 text-sm text-slate-400 hover:text-slate-200 cursor-pointer">
                     ✕ Close
                  </button>
                  {navLinks}
               </aside>
            </div>
         )}
      </>
   );
}
