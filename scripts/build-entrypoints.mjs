/**
 * Post-build step: generate standalone, crawlable static HTML entry points for
 * the unlisted product pages.
 *
 * The SPA keeps its hash router. These shells give search engines and ad
 * tracking pixels permanent URLs (/avatar-studio/, /yochat/) with static
 * canonical tags, Open Graph meta, and Service schema baked in before the
 * client bundle loads. On a real browser the same bundle boots and the router
 * reads the pathname, so the visitor lands on the funnel with no redirect.
 *
 * Run automatically after `vite build` (see package.json).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = resolve(ROOT, "dist");
const ORIGIN = "https://www.socialfollowing.shop";

const ENTRYPOINTS = [
  {
    slug: "avatar-studio",
    name: "Avatar Studio",
    eyebrow: "Avatar Studio",
    title: "Avatar Studio | Social Following Studios",
    heading: "Your twin, everywhere.",
    description:
      "Avatar Studio builds a high-fidelity digital twin of your likeness and voice, then turns your knowledge into finished video content for continuous distribution.",
    serviceType: "Video production",
  },
  {
    slug: "yochat",
    name: "YoChat",
    eyebrow: "YoChat",
    title: "YoChat | Social Following Studios",
    heading: "Always-on conversation.",
    description:
      "YoChat runs the conversational layer of your program across Messenger and Instagram, with a protected control room, CRM, transcripts, and human handoff.",
    serviceType: "Conversational messaging management",
  },
];

const escapeHtml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function serviceSchema(entry) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: entry.name,
      serviceType: entry.serviceType,
      description: entry.description,
      url: `${ORIGIN}/${entry.slug}/`,
      provider: {
        "@type": "Organization",
        name: "Social Following Studios",
        url: `${ORIGIN}/`,
        parentOrganization: { "@type": "Organization", name: "Marchitects" },
      },
    },
    null,
    2
  );
}

function fallbackMarkup(entry) {
  // Lives inside #root. React clears it on mount; crawlers and no-JS visitors
  // still get real content and a working link into the funnel.
  return [
    '<div id="static-entry" style="max-width:680px;margin:0 auto;padding:64px 24px;font-family:Georgia,serif;color:#0b0f0d">',
    `<p style="font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#0a7d59;margin:0 0 24px">${escapeHtml(
      entry.eyebrow
    )}</p>`,
    `<h1 style="font-size:44px;line-height:1.02;margin:0 0 20px">${escapeHtml(entry.heading)}</h1>`,
    `<p style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#5b625c;margin:0 0 28px">${escapeHtml(
      entry.description
    )}</p>`,
    `<p style="font-family:Arial,sans-serif;font-size:15px"><a href="/#/${entry.slug}" style="color:#0a7d59;font-weight:700">Continue to ${escapeHtml(
      entry.name
    )}</a></p>`,
    "</div>",
  ].join("");
}

function transform(template, entry) {
  const url = `${ORIGIN}/${entry.slug}/`;
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(entry.title)}</title>`);

  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${url}" />`
  );

  html = html.replace(
    /<meta\s+name="description"[\s\S]*?\/>/,
    `<meta name="description" content="${escapeHtml(entry.description)}" />`
  );

  html = html.replace(
    /<meta\s+property="og:title"[\s\S]*?\/>/,
    `<meta property="og:title" content="${escapeHtml(entry.title)}" />`
  );
  html = html.replace(
    /<meta\s+property="og:description"[\s\S]*?\/>/,
    `<meta property="og:description" content="${escapeHtml(entry.description)}" />`
  );
  html = html.replace(
    /<meta\s+name="twitter:description"[\s\S]*?\/>/,
    `<meta name="twitter:description" content="${escapeHtml(entry.description)}" />`
  );

  // Open Graph / Twitter extras that the base template does not carry.
  html = html.replace(
    "</title>",
    [
      "</title>",
      `    <meta property="og:type" content="website" />`,
      `    <meta property="og:url" content="${url}" />`,
      `    <meta name="twitter:card" content="summary_large_image" />`,
      `    <meta name="twitter:title" content="${escapeHtml(entry.title)}" />`,
    ].join("\n")
  );

  // Swap the Organization schema for a page-specific Service schema.
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">\n${serviceSchema(entry)}\n    </script>`
  );

  html = html.replace('<div id="root"></div>', `<div id="root">${fallbackMarkup(entry)}</div>`);

  return html;
}

const template = await readFile(resolve(DIST, "index.html"), "utf8");

for (const entry of ENTRYPOINTS) {
  const outDir = resolve(DIST, entry.slug);
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, "index.html"), transform(template, entry), "utf8");
  console.log(`entrypoint  dist/${entry.slug}/index.html`);
}
