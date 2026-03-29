"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const adminLinks = [
   {
      href: "/dashboard/admin",
      label: "Overview",
      exact: true,
   },
   {
      href: "/dashboard/admin/vocabulary",
      label: "Vocabulary",
   },
   {
      href: "/dashboard/admin/reading",
      label: "Reading",
   },
   {
      href: "/dashboard/admin/mock-reading",
      label: "IELTS Reading",
   },
   {
      href: "/dashboard/admin/writing",
      label: "Writing",
   },
   {
      href: "/dashboard/admin/users",
      label: "Users",
   },
   {
      href: "/dashboard/admin/feedback",
      label: "Feedback",
   },
];

export default function AdminSectionNav() {
   const pathname = usePathname();

   return (
      <div className="flex flex-wrap gap-2">
         {adminLinks.map((link) => {
            const isActive = link.exact
               ? pathname === link.href
               : pathname.startsWith(link.href);

            return (
               <Link
                  key={link.href}
                  href={link.href}
                  className={[
                     "rounded-full border px-4 py-2 text-sm transition",
                     isActive
                        ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                        : "border-slate-700 text-slate-300 hover:bg-slate-900",
                  ].join(" ")}>
                  {link.label}
               </Link>
            );
         })}
      </div>
   );
}
