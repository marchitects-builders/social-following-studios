# lead-acquisition-stack

Documentation and configuration for the local web-acquisition stack used
ahead of enrichment/verification and campaign delivery:

```
SOURCE
  ↓
CRAWLEE       — bulk deterministic crawling
  ↓
FIRECRAWL     — page/site extraction + normalization
  ↓
BROWSER USE   — dynamic/agentic fallback, only when required
  ↓
OPENLEADS     — contact enrichment + email verification
  ↓
CAMPAIGN CSV
  ↓
SWIFTSEND     — delivery (OUTSIDE this stack)
```

This folder does **not** contain the four applications themselves. It
records where each one lives, its current state, and how to start/stop it.
See `STACK_STATUS.md` for the live status of each component (what's
installed, what's verified, what's blocked) and `config.example.json` for a
machine-readable version of the same paths/ports/commands.

## Routing rules

| Situation | Route to |
| --- | --- |
| Normal crawlable site (static/server-rendered HTML) | **Crawlee** (`lead-crawler/`) |
| Need clean page/site extraction + Markdown/structured normalization | **Firecrawl** |
| Site requires actual browser interaction (login walls, click-throughs, infinite scroll a plain crawl can't reach) | **Browser Use** |
| Need contact enrichment / email verification on already-collected leads | **OpenLeads** |

Don't send every URL through every tool — start at Crawlee, escalate only
when a site needs more than deterministic crawling gives you.

## Components at a glance

| Component | Path | Role |
| --- | --- | --- |
| Crawlee | `../lead-crawler/` (this repo) | Bulk deterministic crawling (CLI, Node/Playwright) |
| Firecrawl | `/home/user/firecrawl/firecrawl` (this session's container — see caveat below) | Page/site extraction + normalization (self-hosted API) |
| Browser Use | `/home/user/browser-use/browser-use` (source) + `/home/user/browser-use-local/.venv` (Python env) | Dynamic/agentic browser fallback |
| OpenLeads | not found on this machine — see `STACK_STATUS.md` | Contact enrichment + email verification |

## Important: this environment is ephemeral

This session runs in a Claude Code remote container. Anything **not**
committed into this git repository (Crawlee/`lead-crawler`, and this
`lead-acquisition-stack` folder) disappears when the container is
reclaimed — that includes the Firecrawl clone, the Browser Use clone, and
the `browser-use-local` Python virtual environment. If you need Firecrawl
and Browser Use to persist, install them on a machine/environment that
survives between sessions, or re-run the install commands below each time
a fresh container is provisioned.

## Commands

See `STACK_STATUS.md` for the exact start/stop commands, ports, and output
locations recorded for this session, and for which of these actually run in
this container (some are blocked — see that file for why).

## Output locations

- Crawlee: `../lead-crawler/output/leads.json`, `../lead-crawler/output/leads.csv`
- Firecrawl: not run in this session (see `STACK_STATUS.md`)
- Browser Use: no persistent output by default (agent/task-driven; a
  campaign-specific driver script would write its own output under
  `outputs/`)
- OpenLeads: unknown — installation not located

- This stack's own consolidated outputs: `outputs/` (empty scaffold —
  campaign-specific crawlers are not built yet, per scope)

## Expected input/output format between stages

- **Crawlee → Firecrawl/Browser Use**: a list of URLs (JSON array of
  strings, or one URL per line) that need cleaner extraction or browser
  interaction beyond what Crawlee's deterministic crawl produced.
- **Firecrawl / Browser Use → OpenLeads**: normalized lead records —
  `{ url, domain, companyName, emails: [], phones: [], ... }` (the same
  shape `lead-crawler` already emits; Firecrawl/Browser Use should match it
  so OpenLeads has one consistent input contract).
- **OpenLeads → Campaign CSV**: enriched + verified records, ready for
  SwiftSend's expected campaign CSV columns (SwiftSend integration is out
  of scope for this stack).

## Scope / non-goals

No campaign-specific crawlers yet. No SwiftSend connection. No paid API
keys. No LLM keys added for Browser Use's agent mode (see `STACK_STATUS.md`
for what that would require). No large local model downloads.
