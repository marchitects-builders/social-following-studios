# Social Following Studios — Operating Rules for Claude Code

## Phase 0 is mandatory before any visual or structural build

Do not modify production code (`src/App.jsx`, `src/index.css`, page components, layout, or
motion) until a Phase 0 research pass has been done and reviewed. This applies to any task
that changes page structure, visual system, component choices, or motion — not to copy edits,
bug fixes, or config-only changes (Zoho fields, routing, build config).

### PHASE 0: RESEARCH BEFORE BUILD

Determine what has already proven effective for the type of site SFS is becoming before
choosing any visual direction. Research live, current examples across:

- premium B2B product websites
- high-end agency/product hybrid sites
- data/intelligence products
- lifecycle/CRM/marketing infrastructure companies
- founder-led authority sites
- law firm marketing / legal technology sites
- editorial content hubs built for SEO + AEO

For every reference, document: URL, page type, hero structure, navigation model, typography,
motion pattern, section sequencing, proof mechanism, CTA architecture, product explanation
method, mobile behavior, what's reusable for SFS, and what should not be copied. Do not use a
screenshot as inspiration without explaining why the pattern works — no mood boards.

Then audit the current SFS repo: every installed frontend package, local visual component,
animation utility, font, layout system, chart library, 3D/WebGL feature, and media component.

Build a mapping: **proven external pattern → installed SFS capability → target SFS page.**
Example: sticky narrative section → existing scroll/motion library → Audience Builder
explanation. Do not introduce new libraries until the installed stack is exhausted.

Produce page-specific recommendations (2-3 directly relevant reference sites max per page, not
a generic list) for: Homepage, Audience Builder, Avatar Studio, YoChat / Signal Studio, Lawyer
page, Insights index, Article template.

**One constraint specific to SFS: research should converge on one dominant visual system for
the whole site, then adapt it per page.** Audience Builder, Avatar Studio, the lawyer page, and
the homepage must not drift into four different design languages — same type system, same
motion vocabulary, same component set, same proof/CTA architecture, varied only by content.

### Research gate

A recommendation only survives if it answers all five:

1. What design pattern is being used
2. Where that pattern already works on a comparable live site
3. Which installed SFS capability can reproduce it
4. Why it belongs on that specific SFS page
5. How it supports conversion or comprehension

Discard anything that can't answer all five.

### SEO / AEO requirements

Verify against current primary documentation before implementing, not from memory:

- Google Search Essentials (helpful, people-first content; crawlable internal links; clear
  titles/headings)
- Article / BlogPosting structured data
- canonical guidance
- sitemap behavior
- indexing controls
- structured-data validation

Don't assume a schema type produces a rich result — validate markup before shipping.

### Deliverable before build

- Benchmark matrix
- Installed frontend inventory
- Proven-pattern-to-SFS mapping
- Page-by-page design direction
- SEO/AEO requirements
- Specific references
- Implementation order

Stop there for review. Do not touch production code until the deliverable is reviewed and the
build is explicitly approved.
