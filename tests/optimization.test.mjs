import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

function load(path, modules = {}) {
   const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
   const exports = {};
   vm.runInNewContext(outputText, { exports, require: (name) => {
      if (!(name in modules)) throw new Error(`Unexpected import: ${name}`);
      return modules[name];
   } });
   return exports;
}

const { default: DashboardNavigation } = load("components/DashboardNavigation.tsx", {
   react: React,
   "react/jsx-runtime": jsxRuntime,
   "next/link": { default: ({ children, ...props }) => React.createElement("a", props, children) },
   "next/navigation": { usePathname: () => "/dashboard/tasks", useSearchParams: () => new URLSearchParams() },
   "react-icons/pi": new Proxy({}, { get: () => () => null }),
   "@/lib/erpVisibility": { isErpModuleVisible: () => true },
});

test("header navigation preserves view permissions using the profile already loaded by its parent", () => {
   const html = renderToStaticMarkup(React.createElement(DashboardNavigation, {
      permissions: { tasks: ["view"], marketing: ["view", "manage"], staff: ["manage"], settings: "view" },
   }));
   assert.doesNotMatch(html, /href="\/dashboard\/tasks"/);
   assert.match(html, /href="\/dashboard\/marketing"/);
   assert.doesNotMatch(html, /href="\/dashboard\/staff"/);
   assert.doesNotMatch(html, /href="\/dashboard\/settings"/);
   const empty = renderToStaticMarkup(React.createElement(DashboardNavigation, { permissions: {} }));
   assert.doesNotMatch(empty, /href="\/dashboard/);
});
