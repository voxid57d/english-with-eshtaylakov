import KpiManager from "@/components/erp/KpiManager";
import { redirect } from "next/navigation";
import { isErpModuleVisible } from "@/lib/erpVisibility";

export default function KpiPage() {
   if (!isErpModuleVisible("kpi")) redirect("/dashboard/tasks");
   return <KpiManager />;
}
