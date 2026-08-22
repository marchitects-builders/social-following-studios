/**
 * Packages the built site into one self contained HTML file.
 *
 * Two targets.
 *
 * `npm run build:preview` writes preview/index.html, a complete HTML document. It
 * opens straight from disk with no server, travels by email or a chat message, and
 * serves from any static host.
 *
 * `npm run build:artifact` writes preview/artifact.html, the same page as a body
 * fragment for hosts that supply their own document shell. That build also turns the
 * map embed off, since those hosts block third party frames.
 *
 * Fleet photo frames fall back to their drawn class profiles in both targets, and the
 * document target carries a noindex directive. This build shows a client a proposal.
 * It should never turn up in a search result for the business.
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

const asFragment = process.argv.includes("--artifact");

if (asFragment) {
  // Keep the title, the font links, the styles, the mount point, and the bundle.
  // The host supplies the document shell, so everything else comes out.
  const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
  const keep = [
    ...(head.match(/<link rel="preconnect"[^>]*>/g) || []),
    (head.match(/<link\s+href="https:\/\/fonts\.googleapis\.com[\s\S]*?>/) || [])[0],
    (head.match(/<title>[\s\S]*?<\/title>/) || [])[0],
    (head.match(/<style>[\s\S]*?<\/style>/) || [])[0],
  ].filter(Boolean);

  const bodyInner = html.slice(html.indexOf("<body>") + "<body>".length, html.lastIndexOf("</body>"));

  // Galleries list the page by its title, so the fragment carries the business name
  // on its own. The search description stays on the hosted build.
  const fragment = `${keep.join("\n")}\n${bodyInner.trim()}\n`.replace(
    /<title>([^<|]+?)\s*\|[^<]*<\/title>/,
    "<title>$1</title>"
  );

  writeFileSync(join(outDir, "artifact.html"), fragment);
  const kb = (Buffer.byteLength(fragment) / 1024).toFixed(0);
  console.log(`preview/artifact.html written, ${kb} kB, body fragment`);
} else {
  writeFileSync(join(outDir, "index.html"), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`preview/index.html written, ${kb} kB, self contained document`);
}
