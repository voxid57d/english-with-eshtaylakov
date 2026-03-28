"use client";

import Link from "next/link";
import AdminSectionNav from "@/components/AdminSectionNav";

const adminCards = [
   {
      href: "/dashboard/admin/vocabulary",
      title: "Vocabulary",
      description:
         "Manage folders, decks, cards, and battle availability from one place.",
   },
   {
      href: "/dashboard/admin/reading",
      title: "Reading",
      description:
         "Create and edit reading articles, cover images, and structured body blocks.",
   },
   {
      href: "/dashboard/admin/writing",
      title: "Writing",
      description:
         "Manage prompts and review writing submissions waiting for feedback.",
   },
   {
      href: "/dashboard/admin/users",
      title: "Users",
      description:
         "Search users and manage premium access separately from content tools.",
   },
   {
      href: "/dashboard/admin/feedback",
      title: "Feedback",
      description:
         "Read learner feedback submitted from the dashboard sidebar.",
   },
];

export default function AdminHomePage() {
   return (
      <div className="space-y-8">
         <div className="space-y-4">
            <AdminSectionNav />

            <div className="space-y-2">
               <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">
                  Admin
               </p>
               <h1 className="text-3xl font-semibold">Admin panel</h1>
               <p className="max-w-3xl text-sm text-slate-400">
                  Choose which admin section you want to work in. User management now lives in its own dedicated area.
               </p>
            </div>
         </div>

         <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {adminCards.map((card) => (
               <Link
                  key={card.href}
                  href={card.href}
                  className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-500/30 hover:bg-slate-900">
                  <h2 className="text-lg font-semibold text-slate-100">
                     {card.title}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                     {card.description}
                  </p>
                  <p className="mt-4 text-sm font-medium text-emerald-300">
                     Open section →
                  </p>
               </Link>
            ))}
         </div>
      </div>
   );
}
