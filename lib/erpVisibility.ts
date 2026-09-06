import type { ErpModule } from "@/lib/erp";

// Temporarily hide unfinished sections for every role. Remove entries when ready.
const hiddenModules = new Set<ErpModule>(["overview", "branches", "kpi", "metrics"]);

export function isErpModuleVisible(module: ErpModule) {
   return !hiddenModules.has(module);
}
