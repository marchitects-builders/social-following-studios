#!/usr/bin/env node
/**
 * Minimal lead-acquisition crawler built on Crawlee.
 *
 * Crawls a starting URL (and same-domain links it discovers) and extracts
 * only information that is publicly displayed on the page:
 *   - page URL / title
 *   - company/business name (best-effort, from metadata already on the page)
 *   - website/domain
 *   - publicly displayed email addresses (mailto: links + visible text)
 *   - publicly displayed phone numbers (tel: links + visible text)
 *   - outbound links found on the page
 *
 * It never guesses/generates email addresses, never attempts to bypass
 * authentication, CAPTCHAs, or other access controls, and only follows
 * links that are already present in the page's own markup.
 *
 * Usage:
 *   node src/crawl.js <startUrl> [--max=N] [--engine=playwright|cheerio] [--out=dir]
 *
 * Examples:
 *   node src/crawl.js https://example.com
 *   node src/crawl.js https://example.com --max=10
 *   node src/crawl.js https://example.com --engine=cheerio --max=20
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { PlaywrightCrawler, CheerioCrawler, Dataset, log } from 'crawlee';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const [startUrl, ...rest] = argv;
  const opts = {
    startUrl,
    maxPages: 5,
    engine: 'playwright',
    outDir: path.join(PROJECT_ROOT, 'output'),
  };

  for (const arg of rest) {
    const [flag, value] = arg.replace(/^--/, '').split('=');
    if (flag === 'max' && value) opts.maxPages = Number.parseInt(value, 10);
    if (flag === 'engine' && value) opts.engine = value;
    if (flag === 'out' && value) opts.outDir = path.resolve(value);
  }

  return opts;
}

// ---------------------------------------------------------------------------
// Extraction helpers (shared by both crawler engines via cheerio)
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// Loosely matches common phone formats: (555) 123-4567, 555-123-4567,
// 555.123.4567, +1 555 123 4567, etc.
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b/g;

function uniq(arr) {
  return [...new Set(arr)];
}

function extractEmails($, bodyText) {
  const mailtoEmails = $('a[href^="mailto:"]')
    .map((_, el) => $(el).attr('href').replace(/^mailto:/i, '').split('?')[0].trim())
    .get();
  const textEmails = bodyText.match(EMAIL_RE) || [];
  return uniq([...mailtoEmails, ...textEmails].map((e) => e.toLowerCase()));
}

function extractPhones($, bodyText) {
  const telPhones = $('a[href^="tel:"]')
    .map((_, el) => $(el).attr('href').replace(/^tel:/i, '').trim())
    .get();
  const textPhones = (bodyText.match(PHONE_RE) || [])
    .map((p) => p.trim())
    .filter((p) => p.replace(/\D/g, '').length >= 7); // drop noise like "2024-01"
  return uniq([...telPhones, ...textPhones]);
}

function extractCompanyName($) {
  // Best-effort, in order of reliability. Never invented — only pulled from
  // metadata/markup the page itself already publishes.
  const candidates = [
    $('meta[property="og:site_name"]').attr('content'),
    $('meta[name="application-name"]').attr('content'),
  ];

  // JSON-LD Organization / LocalBusiness name, if present.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && typeof item.name === 'string' && /organization|localbusiness|corporation/i.test(item['@type'] || '')) {
          candidates.push(item.name);
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  });

  candidates.push($('title').first().text());
  candidates.push($('h1').first().text());

  const name = candidates.find((c) => typeof c === 'string' && c.trim().length > 0);
  return name ? name.trim() : null;
}

function extractOutboundLinks($, baseUrl) {
  const baseHost = new URL(baseUrl).hostname;
  const links = $('a[href]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .map((href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((href) => href.startsWith('http'));

  const outbound = links.filter((href) => new URL(href).hostname !== baseHost);
  return uniq(outbound);
}

function extractSameDomainLinks($, baseUrl) {
  const baseHost = new URL(baseUrl).hostname;
  const links = $('a[href]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .map((href) => {
      try {
        return new URL(href, baseUrl).href;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((href) => href.startsWith('http'));

  return uniq(links.filter((href) => new URL(href).hostname === baseHost));
}

function buildRecord({ url, html }) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text().replace(/\s+/g, ' ');

  return {
    url,
    domain: new URL(url).hostname,
    title: $('title').first().text().trim() || null,
    companyName: extractCompanyName($),
    emails: extractEmails($, bodyText),
    phones: extractPhones($, bodyText),
    outboundLinks: extractOutboundLinks($, url),
    scrapedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function writeOutputs(records, outDir) {
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'leads.json');
  fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2));

  const columns = ['url', 'domain', 'title', 'companyName', 'emails', 'phones', 'outboundLinks', 'scrapedAt'];
  const csvLines = [columns.join(',')];
  for (const record of records) {
    const row = columns.map((col) => {
      const value = record[col];
      const flat = Array.isArray(value) ? value.join('; ') : value;
      return csvEscape(flat);
    });
    csvLines.push(row.join(','));
  }
  const csvPath = path.join(outDir, 'leads.csv');
  fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');

  return { jsonPath, csvPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!opts.startUrl) {
    console.error('Usage: node src/crawl.js <startUrl> [--max=N] [--engine=playwright|cheerio] [--out=dir]');
    process.exit(1);
  }

  log.info(`Starting crawl of ${opts.startUrl} (engine=${opts.engine}, max=${opts.maxPages})`);

  const records = [];

  const requestHandler = async ({ request, enqueueLinks, log: reqLog, ...rest }) => {
    reqLog.info(`Processing ${request.url}`);

    // For PlaywrightCrawler we get `page`; for CheerioCrawler we get `$`/`body`.
    let html;
    if (rest.page) {
      html = await rest.page.content();
    } else {
      html = rest.body ?? rest.$.html();
    }

    const record = buildRecord({ url: request.loadedUrl || request.url, html });
    records.push(record);
    await Dataset.pushData(record);

    const same = extractSameDomainLinks(cheerio.load(html), request.loadedUrl || request.url);
    if (same.length > 0) {
      await enqueueLinks({ urls: same, strategy: 'same-domain' });
    }
  };

  const commonOptions = {
    maxRequestsPerCrawl: opts.maxPages,
    requestHandler,
    failedRequestHandler: ({ request, log: reqLog }, error) => {
      reqLog.warning(`Request ${request.url} failed: ${error?.message}`);
    },
  };

  let crawler;
  if (opts.engine === 'cheerio') {
    crawler = new CheerioCrawler(commonOptions);
  } else {
    // Environments with a pre-provisioned Chromium (no network access for the
    // Playwright browser downloader) can point at it explicitly. On a normal
    // local machine with `npx playwright install chromium` already run, this
    // env var can be left unset and Playwright will use its own managed
    // Chromium automatically.
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
    // PLAYWRIGHT_IGNORE_HTTPS_ERRORS is only needed behind a TLS-intercepting
    // proxy (e.g. this sandbox's outbound proxy); leave it unset on a normal
    // local machine.
    const ignoreHTTPSErrors = process.env.PLAYWRIGHT_IGNORE_HTTPS_ERRORS === '1';
    crawler = new PlaywrightCrawler({
      ...commonOptions,
      launchContext: {
        launchOptions: {
          headless: true,
          ...(executablePath ? { executablePath } : {}),
          ...(ignoreHTTPSErrors ? { args: ['--ignore-certificate-errors'] } : {}),
        },
      },
    });
  }

  await crawler.run([opts.startUrl]);

  const { jsonPath, csvPath } = writeOutputs(records, opts.outDir);

  log.info(`Crawl finished. Pages crawled: ${records.length}`);
  log.info(`JSON output: ${jsonPath}`);
  log.info(`CSV output: ${csvPath}`);
}

main().catch((error) => {
  console.error('Crawler failed:', error);
  process.exit(1);
});
