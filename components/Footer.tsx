// components/Footer.tsx

import Image from "next/image";
import Link from "next/link";
import { FiInstagram, FiSend, FiMail } from "react-icons/fi";

export default function Footer() {
   return (
      <footer className="border-t border-slate-800 bg-slate-950 text-slate-400">
         <div className="max-w-6xl mx-auto px-4 py-3 md:py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            {/* Left: logo + short description */}
            <div className="flex items-center gap-3">
               <Image
                  src="/rgb-logo.png"
                  alt="Talk Time logo"
                  width={160}
                  height={40}
                  className="h-8 w-auto opacity-90"
               />
               <p className="text-xs text-slate-500 max-w-xs">
                  Practice vocabulary, reading, listening and IELTS CDI mock
                  exams — all in one place.
               </p>
            </div>

            {/* Right: social + contact + copyright */}
            <div className="flex flex-col items-start gap-2 md:items-end">
               <div className="flex flex-wrap items-center gap-3">
                  {/* Instagram */}
                  <Link
                     href="https://instagram.com/talktimelc"
                     className="flex items-center gap-1.5 rounded-full border border-slate-700/70 px-3 py-1.5 text-xs hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-900/60 transition">
                     <FiInstagram className="h-4 w-4" />
                     <span>Instagram</span>
                  </Link>

                  {/* Telegram */}
                  <Link
                     href="https://t.me/talktimelc"
                     className="flex items-center gap-1.5 rounded-full border border-slate-700/70 px-3 py-1.5 text-xs hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-900/60 transition">
                     <FiSend className="h-4 w-4" />
                     <span>Telegram</span>
                  </Link>

                  {/* Email */}
                  <a
                     href="mailto:voxid.mr@gmail.com"
                     className="flex items-center gap-1.5 rounded-full border border-slate-700/70 px-3 py-1.5 text-xs hover:border-emerald-400 hover:text-emerald-300 hover:bg-slate-900/60 transition">
                     <FiMail className="h-4 w-4" />
                     <span>Email</span>
                  </a>
               </div>

               <p className="text-[11px] text-slate-600 mt-1">
                  © {new Date().getFullYear()} Talk Time. All rights reserved.
               </p>
            </div>
         </div>
      </footer>
   );
}
