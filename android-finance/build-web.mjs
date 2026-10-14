import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const project = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(project, "app/src/main/assets/finance");
await mkdir(outdir, { recursive: true });
await build({ absWorkingDir: path.dirname(project), entryPoints: ["android-finance/web/main.tsx"], bundle: true, outdir, entryNames: "app", minify: true,
   target: ["chrome90"], jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, loader: { ".module.css": "local-css" }, logLevel: "info" });
await writeFile(path.join(outdir, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'"><title>Quiet Money</title><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script src="app.js"></script></body></html>`);
