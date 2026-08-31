# lead-crawler

Local [Crawlee](https://crawlee.dev/)-based crawler for the outbound
lead-generation pipeline:

```
Crawlee (this project) → enrichment / email verification → campaign CSV → SwiftSend
```

This project only crawls and extracts. It does not verify emails, build
campaigns, or touch SwiftSend — those stay downstream steps in separate
tooling.

## What it extracts

For a starting URL and the same-domain pages it links to, `src/crawl.js`
pulls only information that is already publicly displayed on the page:

- page URL and title
- company/business name (best-effort, from `og:site_name`, JSON-LD
  `Organization`/`LocalBusiness` markup, `<title>`, or `<h1>` — never
  invented)
- website/domain
- publicly displayed email addresses (`mailto:` links and visible text)
- publicly displayed phone numbers (`tel:` links and visible text)
- outbound links (links to other domains found on the page)

It does **not** guess or generate email addresses, and it does not attempt
to bypass authentication, CAPTCHAs, or other access controls — it only
follows links that are already present in a page's own markup.

## Installation

```bash
cd lead-crawler
npm install
npx playwright install chromium
```

`npx playwright install chromium` downloads only the Chromium browser (not
Firefox/WebKit) that Playwright needs.

> **Note for sandboxed/CI environments without general internet egress:**
> if the browser download is blocked by a network policy, point the
> crawler at a pre-installed Chromium binary instead of downloading one,
> via `PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node src/crawl.js ...`
> (see [Environment variables](#environment-variables) below). On a normal
> developer machine with unrestricted internet access, `playwright install
> chromium` is all you need and this variable can be left unset.

## Running a crawl

```bash
node src/crawl.js <startUrl>
```

Example:

```bash
node src/crawl.js https://example-business.com
```

This crawls the start URL plus up to 4 more same-domain pages it discovers
(5 pages total by default) using `PlaywrightCrawler`, and writes results to
`output/leads.json` and `output/leads.csv`.

### Changing the max page count

Pass `--max=N`:

```bash
node src/crawl.js https://example-business.com --max=25
```

### Switching crawler engines

By default the crawler uses `PlaywrightCrawler` (a real, headless Chromium
browser — handles JavaScript-rendered pages, slower). For plain server-rendered
HTML sites, switch to `CheerioCrawler`, a much faster HTTP-only engine with no
browser overhead:

```bash
node src/crawl.js https://example-business.com --engine=cheerio
```

Use `--engine=playwright` (the default) or omit the flag for the Playwright
engine.

### Changing the output directory

```bash
node src/crawl.js https://example-business.com --out=/path/to/dir
```

Defaults to `./output` inside this project.

## Output locations

- **JSON**: `output/leads.json` — array of extracted records
- **CSV**: `output/leads.csv` — same records, flattened (list fields like
  `emails`/`phones`/`outboundLinks` are semicolon-joined)

Each record has the shape:

```json
{
  "url": "https://example-business.com/contact",
  "domain": "example-business.com",
  "title": "Contact Us - Example Business",
  "companyName": "Example Business",
  "emails": ["info@example-business.com"],
  "phones": ["+1 555-123-4567"],
  "outboundLinks": ["https://linkedin.com/company/example-business"],
  "scrapedAt": "2026-08-31T00:00:00.000Z"
}
```

## Environment variables

| Variable                          | Purpose                                                                                          |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `PLAYWRIGHT_CHROMIUM_PATH`         | Absolute path to a Chromium executable to use instead of Playwright's managed download.           |
| `PLAYWRIGHT_IGNORE_HTTPS_ERRORS`   | Set to `1` to launch Chromium with `--ignore-certificate-errors`. Only needed behind a TLS-intercepting proxy (e.g. some sandboxes); leave unset on a normal machine. |

## Testing

A quick smoke test against any small, publicly accessible site:

```bash
node src/crawl.js https://example-business.com --max=5
```

Verify:

- Chromium launches (no `executablePath`/download errors)
- Crawlee logs each page it processes
- `output/leads.json` and `output/leads.csv` are created and structured as above
- the process exits with code `0`

## Current dependencies

- [`crawlee`](https://www.npmjs.com/package/crawlee) `^3.18.1`
- [`playwright`](https://www.npmjs.com/package/playwright) `^1.62.1`

Run `npm ls` inside this directory for the exact resolved versions.

## Scope / non-goals

This is intentionally a minimal, generic crawler. It does not (yet) build
dealership-, franchise-, legal-, or founder-specific extraction logic, and
it does not modify or interact with existing campaigns, approved email
copy, lead files, the OpenLeads installation, or SwiftSend configuration.
Enrichment, email verification, and campaign CSV formatting for SwiftSend
are separate, downstream steps outside this project.
