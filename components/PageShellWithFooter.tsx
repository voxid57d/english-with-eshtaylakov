export default function PageShellWithFooter({
   children,
}: {
   children: React.ReactNode;
}) {
   return (
      <div className="min-h-screen flex flex-col bg-slate-950 text-white">
         <main className="flex-1 flex">{children}</main>
      </div>
   );
}
