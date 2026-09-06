import BranchesManager from "@/components/erp/BranchesManager";
import { redirect } from "next/navigation";
import { isErpModuleVisible } from "@/lib/erpVisibility";

export default function BranchesPage() {
   if (!isErpModuleVisible("branches")) redirect("/dashboard/tasks");
   return <BranchesManager />;
}
