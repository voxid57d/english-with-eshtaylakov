import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function setup({ manager = true, payrollFails = false, denied = false } = {}) {
   const executed = [];
   const cache = new Map();
   const mocks = {
      "next/server": { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
      "@/lib/erpAuth": {
         requireErpPermission: async () => {
            if (denied) throw new Error("Forbidden");
            return { staff: { userId: "worker-1", role: "salesman" } };
         },
         canErp: async () => manager,
      },
      "@/lib/supabaseAdmin": {
         supabaseAdmin: {
            from(table) {
               const query = { table, filters: [] };
               const builder = {};
               for (const method of ["select", "eq", "in", "gte", "lte", "order"]) {
                  builder[method] = (...args) => {
                     query.filters.push([method, ...args]);
                     return builder;
                  };
               }
               builder.then = (resolve, reject) => {
                  executed.push(query);
                  const error = payrollFails && table.startsWith("erp_") ? { message: "Payroll unavailable" } : null;
                  return Promise.resolve({ data: [], error }).then(resolve, reject);
               };
               return builder;
            },
         },
      },
   };
   function load(file) {
      if (cache.has(file)) return cache.get(file);
      const exports = {};
      cache.set(file, exports);
      const { outputText } = ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
         compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      });
      vm.runInNewContext(outputText, {
         exports, URL, Error,
         require: (name) => {
            if (mocks[name]) return mocks[name];
            if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
            throw new Error(`Unexpected import: ${name}`);
         },
      });
      return exports;
   }
   const { GET } = load("app/api/erp/shifts/route.ts");
   return {
      executed,
      get: (scope) => GET(new Request(`http://localhost/api/erp/shifts?weekStart=2026-09-14&weekEnd=2026-09-20&payrollMonth=2026-09&branchId=branch-1${scope ? `&scope=${scope}` : ""}`)),
   };
}

test("daily shifts execute no monthly or payroll queries, even when payroll is unavailable", async () => {
   const { get, executed } = setup({ payrollFails: true });
   const result = await get("daily");
   assert.equal(result.status, 200);
   assert.equal("monthlySummaries" in result.body, false);
   assert.deepEqual(executed.map((query) => query.table).sort(), ["branches", "shifts", "staff_profiles"]);
   const shifts = executed.find((query) => query.table === "shifts");
   assert.ok(shifts.filters.some(([method, field, value]) => method === "gte" && field === "shift_date" && value === "2026-09-14"));
});

test("monthly scope loads only monthly shifts and payroll settings", async () => {
   const { get, executed } = setup();
   const result = await get("monthly");
   assert.equal(result.status, 200);
   assert.ok(Array.isArray(result.body.monthlySummaries));
   assert.deepEqual(executed.map((query) => query.table).sort(), ["erp_penalty_rules", "erp_role_compensation_settings", "shifts"]);
   const shifts = executed.find((query) => query.table === "shifts");
   assert.ok(shifts.filters.some(([method, field, value]) => method === "gte" && field === "shift_date" && value === "2026-09-01"));
});

test("both scopes preserve worker and branch restrictions", async () => {
   for (const scope of ["daily", "monthly"]) {
      const { get, executed } = setup({ manager: false });
      assert.equal((await get(scope)).status, 200);
      const shifts = executed.find((query) => query.table === "shifts");
      for (const [field, value] of [["staff_user_id", "worker-1"], ["branch_id", "branch-1"]]) {
         assert.ok(shifts.filters.some(([method, key, filter]) => method === "eq" && key === field && filter === value));
      }
   }
});

test("existing combined requests still return monthly summaries", async () => {
   const { get, executed } = setup();
   assert.ok(Array.isArray((await get()).body.monthlySummaries));
   assert.equal(executed.length, 6);
});

test("denied requests never execute data queries", async () => {
   const { get, executed } = setup({ denied: true });
   assert.equal((await get("monthly")).body.error, "Forbidden");
   assert.equal(executed.length, 0);
});
