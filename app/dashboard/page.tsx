import OverviewDashboard from "@/components/erp/OverviewDashboard";
import { redirect } from "next/navigation";
import { isErpModuleVisible } from "@/lib/erpVisibility";

export default function DashboardPage() {
   if (!isErpModuleVisible("overview")) redirect("/dashboard/tasks");
   return <OverviewDashboard />;
}
