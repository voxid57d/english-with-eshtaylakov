import Image from "next/image";

type BrandLogoProps = {
   compact?: boolean;
   className?: string;
};

export default function BrandLogo({ compact = false, className = "" }: BrandLogoProps) {
   return (
      <div className={["flex items-center gap-3", className].join(" ")}>
         <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-slate-800 bg-white">
            <Image
               src="/ielts-zone-icon.jpg"
               alt="IELTS ZONE"
               fill
               sizes="36px"
               className="object-cover"
               priority
            />
         </div>
         {!compact && (
            <div className="leading-tight">
               <p className="text-base font-semibold tracking-[0.14em] text-white">
                  IELTS ZONE
               </p>
               <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
                  Amir Temur
               </p>
            </div>
         )}
      </div>
   );
}
