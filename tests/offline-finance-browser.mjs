import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";
const assets = new URL("../android-finance/app/src/main/assets/finance/", import.meta.url);
const server = createServer(async (request, response) => {
   const name = request.url === "/" ? "index.html" : request.url?.slice(1);
   if (!["index.html", "app.js", "app.css"].includes(name)) { response.writeHead(404); response.end(); return; }
   response.setHeader("Content-Type", name.endsWith(".js") ? "application/javascript" : name.endsWith(".css") ? "text/css" : "text/html");
   response.end(await readFile(new URL(name, assets)));
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const errors = [], requests = [];
const today = new Date().toLocaleDateString("en-CA");
const fixture = { format: "quiet-money-backup", version: 1, exportedAt: new Date().toISOString(), currencyMode: "UZS", conversionRate: null,
   tables: { accounts: [{ id: "cash", name: "Cash", currency: "UZS", account_type: "cash", opening_balance: 100000, color: "#657568", active: true }],
      categories: [{ id: "food", name: "Food", entry_type: "expense", parent_category_id: null, active: true, color: "#E26D5A", icon: "food" }],
      transactions: [], transfers: [], budgets: [], debts: [], debtPayments: [] } };
await context.addInitScript(value => {
   window.FinanceNative = {
      readState: () => localStorage.getItem("fixture-state") || JSON.stringify(value),
      saveState: text => { localStorage.setItem("fixture-state", text); return '{"ok":true}'; },
      restoreState: text => { localStorage.setItem("fixture-recovery", window.FinanceNative.readState()); return window.FinanceNative.saveState(text); },
      recoveryState: () => localStorage.getItem("fixture-recovery"),
      backupStatus: () => JSON.stringify({ folder: null, lastBackup: null, error: null, recoveryAvailable: !!localStorage.getItem("fixture-recovery") }),
      exportBackup: () => { window.exportedBackup = window.FinanceNative.readState(); window.dispatchEvent(new CustomEvent("finance-native", { detail: { kind: "export", message: "Backup exported." } })); },
      importBackup: () => {}, chooseBackupFolder: () => {}, backupNow: () => {},
   };
}, fixture);
const page = await context.newPage(); page.setDefaultTimeout(15000);
await page.emulateMedia({ reducedMotion: "reduce" });
page.on("pageerror", error => errors.push(error.message));
page.on("request", request => requests.push(request.url()));
try {
   await page.goto(base); await page.locator("header").getByRole("button", { name: "Add transaction", exact: true }).waitFor();
   assert.equal(await page.getByRole("button", { name: "USD", exact: true }).count(), 0);
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
   await page.locator("header").getByRole("button", { name: "Add transaction", exact: true }).click();
   const dialog = page.getByRole("dialog");
   await dialog.getByLabel("Amount", { exact: true }).fill("5000");
   await dialog.getByRole("button", { name: "Save transaction", exact: true }).click();
   await dialog.waitFor({ state: "hidden" });
   const saved = await page.evaluate(() => JSON.parse(window.FinanceNative.readState()));
   assert.equal(saved.tables.transactions.length, 1); assert.equal(saved.tables.transactions[0].amount, 5000);
   assert.equal(saved.tables.transactions[0].entry_date, today);
   await page.reload(); await page.locator("header").getByRole("button", { name: "Add transaction", exact: true }).waitFor();
   await page.getByRole("button", { name: "Accounts", exact: true }).click();
   await page.getByText("95,000 UZS", { exact: true }).first().waitFor();
   await page.getByRole("button", { name: "New account", exact: true }).click();
   await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Card");
   assert.equal(await page.getByRole("dialog").getByRole("button", { name: "USD", exact: true }).count(), 0);
   await page.getByRole("dialog").getByRole("button", { name: "Create account", exact: true }).click();
   await page.getByRole("dialog").waitFor({ state: "hidden" });
   for (const name of ["Overview", "Transactions", "Debts", "Plans", "Categories", "Backups"]) {
      await page.getByRole("button", { name, exact: true }).click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name} must fit a phone`);
   }
   await page.getByRole("heading", { name: "Backups & restore" }).waitFor();
   await page.getByRole("button", { name: "Export all data", exact: true }).click();
   const exported = await page.evaluate(() => JSON.parse(window.exportedBackup));
   assert.equal(exported.tables.accounts.length, 2); assert.equal(exported.tables.transactions.length, 1);
   const incoming = structuredClone(fixture); incoming.tables.accounts[0].name = "Imported cash"; incoming.tables.accounts[0].opening_balance = 777;
   await page.evaluate(value => window.dispatchEvent(new CustomEvent("finance-native", { detail: { kind: "import", text: JSON.stringify(value) } })), incoming);
   await page.getByRole("heading", { name: "Review before restoring" }).waitFor();
   await page.getByRole("button", { name: "Replace data & restore", exact: true }).click();
   await page.getByText("All records restored. Check your account balances and history.", { exact: true }).waitFor();
   assert.equal(await page.evaluate(() => JSON.parse(window.FinanceNative.readState()).tables.accounts[0].opening_balance), 777);
   const recovery = await page.evaluate(() => JSON.parse(window.FinanceNative.recoveryState()));
   assert.equal(recovery.tables.transactions.length, 1);
   await page.getByRole("button", { name: "Review records from before last restore", exact: true }).click();
   await page.getByRole("button", { name: "Replace data & restore", exact: true }).click();
   assert.equal(await page.evaluate(() => JSON.parse(window.FinanceNative.readState()).tables.transactions.length), 1);
   await page.getByRole("button", { name: "Overview", exact: true }).click();
   await mkdir(new URL("../artifacts/android-finance/", import.meta.url), { recursive: true });
   await page.screenshot({ path: new URL("../artifacts/android-finance/offline-overview.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), fullPage: false });
   await page.getByRole("button", { name: "Backups", exact: true }).click();
   await page.screenshot({ path: new URL("../artifacts/android-finance/offline-backups.png", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), fullPage: false });
   assert.deepEqual(errors, []);
   assert.equal(requests.every(url => url.startsWith(base)), true, "The packaged interface must never request the website or an API");
   console.log("Packaged phone UI: save/reload, UZS-only controls, all sections, export/restore/recovery, layout and zero remote requests passed.");
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
