/**
 * Packages the built site into one self contained HTML file.
 *
 * Run `npm run build:preview`. The output at preview/index.html carries the whole
 * site: every page, the design system, and the reservation form. It opens straight
 * from disk with no server, travels by email or a chat message, and serves from any
 * static host. Fleet photo frames fall back to their drawn class profiles the same
 * way the full build does.
 *
 * The file carries a noindex directive. This build shows a client a proposal. It
 * should never turn up in a search result for the business.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const outDir = join(root, "preview");

const assets = readdirSync(join(dist, "assets"));
const jsFile = assets.find((name) => name.endsWith(".js"));
const cssFile = assets.find((name) => name.endsWith(".css"));

if (!jsFile || !cssFile) {
  throw new Error("Run `npm run build` before packaging the preview.");
}

const js = readFileSync(join(dist, "assets", jsFile), "utf8");
const css = readFileSync(join(dist, "assets", cssFile), "utf8");

if (/^\s*(import|export)[\s{(]/m.test(js)) {
  throw new Error(
    "The bundle carries top level module syntax, so a plain script tag will not run it from file://."
  );
}

let html = readFileSync(join(dist, "index.html"), "utf8");

// Swap the linked stylesheet and bundle for inline copies.
html = html.replace(
  /\s*<script type="module"[^>]*><\/script>/,
  ""
);
html = html.replace(
  /\s*<link rel="stylesheet"[^>]*href="\/assets\/[^"]+"[^>]*>/,
  `\n    <style>\n${css}\n    </style>`
);
html = html.replace(
  "</body>",
  `  <script>\n${js.replace(/<\/script/gi, "<\\/script")}\n  </script>\n  </body>`
);

// A proposal build stays out of search results.
html = html.replace(
  "<title>",
  '<meta name="robots" content="noindex, nofollow" />\n    <title>'
);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`preview/index.html written, ${kb} kB, self contained`);
