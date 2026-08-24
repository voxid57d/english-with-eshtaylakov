import type { IconType } from "react-icons";
import { PiCheckCircleLight } from "react-icons/pi";

type ModuleScaffoldProps = {
   title: string;
   eyebrow: string;
   description: string;
   icon: IconType;
   primaryItems: string[];
   nextItems: string[];
};

export default function ModuleScaffold({
   title,
   eyebrow,
   description,
   icon: Icon,
   primaryItems,
   nextItems,
}: ModuleScaffoldProps) {
   return (
      <div className="space-y-5">
         <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
               <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-300">
                     {eyebrow}
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                     {title}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                     {description}
                  </p>
               </div>
               <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200">
                  <Icon size={25} />
               </div>
            </div>
         </section>

         <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <h2 className="text-lg font-semibold text-white">First version</h2>
               <div className="mt-4 space-y-3">
                  {primaryItems.map((item) => (
                     <div key={item} className="flex gap-3">
                        <PiCheckCircleLight className="mt-0.5 shrink-0 text-emerald-300" size={20} />
                        <p className="text-sm leading-6 text-slate-300">{item}</p>
                     </div>
                  ))}
               </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
               <h2 className="text-lg font-semibold text-white">Next build steps</h2>
               <div className="mt-4 space-y-3">
                  {nextItems.map((item, index) => (
                     <div key={item} className="flex gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-semibold text-slate-300">
                           {index + 1}
                        </span>
                        <p className="text-sm leading-6 text-slate-300">{item}</p>
                     </div>
                  ))}
               </div>
            </div>
         </section>
      </div>
   );
}
