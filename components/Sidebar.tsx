"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
   { href: "/dashboard/vocabulary", label: "Vocabulary" },
   { href: "/dashboard/reading", label: "Reading" },
   { href: "/dashboard/listening", label: "Listening" },
];

export default function Sidebar() {
   const pathname = usePathname();

   return (
      <aside className="w-64 bg-slate-950 border-r border-slate-800 p-6">
         <nav className="space-y-2">
            {links.map((link) => {
               const isActive = pathname.startsWith(link.href);

               return (
                  <Link
                     key={link.href}
                     href={link.href}
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
      </aside>
   );
}
