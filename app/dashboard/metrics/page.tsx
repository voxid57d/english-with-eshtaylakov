import MetricsManager from "@/components/erp/MetricsManager";
import { redirect } from "next/navigation";
import { isErpModuleVisible } from "@/lib/erpVisibility";

export default function MetricsPage() {
   if (!isErpModuleVisible("metrics")) redirect("/dashboard/tasks");
   return <MetricsManager />;
}
