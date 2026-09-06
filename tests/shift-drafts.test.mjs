import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(relativePath, globals = {}) {
   const source = readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
   const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
   });
   const exports = {};
   vm.runInNewContext(outputText, { exports, AbortController, ...globals });
   return exports;
}

const { removeSavedDrafts, createLatestRequest } = load("lib/shiftDrafts.ts");

test("saving one date preserves drafts on other dates and branches", () => {
   const monday = { shiftDate: "2026-09-07", branchId: "a", note: "Monday" };
   const tuesday = { shiftDate: "2026-09-08", branchId: "b", note: "Tuesday" };
   const drafts = { monday, tuesday };
   const remaining = removeSavedDrafts(drafts, { monday });
   assert.deepEqual(Object.keys(remaining), ["tuesday"]);
   assert.equal(remaining.tuesday, tuesday);
   assert.equal(drafts.monday, monday);
});

test("edits made after a save starts are never cleared by that save", () => {
   const sent = { note: "Original edit" };
   const newer = { note: "Later edit" };
   const remaining = removeSavedDrafts({ shift: newer }, { shift: sent });
   assert.equal(remaining.shift, newer);
});

test("a successful save clears its entire snapshot across filters", () => {
   const drafts = { a: { note: "One" }, b: { note: "Two" } };
   assert.equal(Object.keys(removeSavedDrafts(drafts, { ...drafts })).length, 0);
});

test("only the newest request may update data, error or loading state", async () => {
   const requests = createLatestRequest();
   const old = requests.begin();
   const latest = requests.begin();
   assert.equal(old.signal.aborted, true);
   let displayed;
   await Promise.resolve().then(() => { if (latest.isCurrent()) displayed = "new date"; });
   await Promise.resolve().then(() => { if (old.isCurrent()) displayed = "old date"; });
   assert.equal(displayed, "new date");
   assert.equal(old.isCurrent(), false);
   assert.equal(latest.isCurrent(), true);
});

test("unmount invalidates even a completed transport awaiting JSON parsing", () => {
   const requests = createLatestRequest();
   const request = requests.begin();
   requests.cancel();
   assert.equal(request.signal.aborted, true);
   assert.equal(request.isCurrent(), false);
   assert.equal(requests.begin().isCurrent(), true);
});

function guardEnvironment(answer = false) {
   const window = new EventTarget();
   const document = new EventTarget();
   window.navigation = new EventTarget();
   window.location = new URL("https://app.test/dashboard/shifts");
   let prompts = 0;
   window.confirm = () => { prompts++; return answer; };
   class Element {}
   class HTMLAnchorElement extends Element {
      constructor(href, target = "") { super(); this.href = href; this.target = target; }
      closest() { return this; }
      hasAttribute() { return false; }
   }
   const api = load("lib/unsavedChanges.ts", { window, document, Element, HTMLAnchorElement, Event, URL });
   const cleanup = api.installUnsavedChangesGuard();
   function click(href, target = "") {
      const event = new Event("click", { cancelable: true });
      Object.defineProperty(event, "target", { value: new HTMLAnchorElement(href, target) });
      Object.defineProperty(event, "button", { value: 0 });
      document.dispatchEvent(event);
      return event;
   }
   return { window, document, api, cleanup, click, prompts: () => prompts };
}

test("canceling a sidebar link blocks navigation before the router runs", () => {
   const env = guardEnvironment();
   assert.equal(env.click("https://app.test/dashboard/tasks").defaultPrevented, true);
   assert.equal(env.prompts(), 1);
   env.cleanup();
});

test("links in a new tab and same-page anchors do not discard this page", () => {
   const env = guardEnvironment();
   assert.equal(env.click("https://app.test/dashboard/tasks", "_blank").defaultPrevented, false);
   assert.equal(env.click("https://app.test/dashboard/shifts#rating").defaultPrevented, false);
   assert.equal(env.prompts(), 0);
   env.cleanup();
});

test("logout is canceled before changing the session", () => {
   const env = guardEnvironment();
   assert.equal(env.api.confirmPageLeave(), false);
   env.cleanup();
   assert.equal(env.api.confirmPageLeave(), true);
});

test("refresh and closing the tab request the browser's unsaved-changes warning", () => {
   const env = guardEnvironment();
   const event = new Event("beforeunload", { cancelable: true });
   Object.defineProperty(event, "returnValue", { value: "", writable: true });
   env.window.dispatchEvent(event);
   assert.equal(event.defaultPrevented, true);
   env.cleanup();
});

test("Back/Forward can be canceled without modifying the history stack", () => {
   const env = guardEnvironment();
   const event = new Event("navigate", { cancelable: true });
   event.navigationType = "traverse";
   event.destination = { url: "https://app.test/dashboard/tasks" };
   env.window.navigation.dispatchEvent(event);
   assert.equal(event.defaultPrevented, true);
   env.cleanup();
});

test("confirmed navigation does not immediately prompt again on unloading", () => {
   const env = guardEnvironment(true);
   assert.equal(env.click("https://app.test/dashboard/tasks").defaultPrevented, false);
   const event = new Event("beforeunload", { cancelable: true });
   Object.defineProperty(event, "returnValue", { value: "", writable: true });
   env.window.dispatchEvent(event);
   assert.equal(event.defaultPrevented, false);
   assert.equal(env.prompts(), 1);
   env.cleanup();
});

test("saving or discarding removes navigation listeners", () => {
   const env = guardEnvironment();
   env.cleanup();
   assert.equal(env.click("https://app.test/dashboard/tasks").defaultPrevented, false);
   assert.equal(env.prompts(), 0);
});
