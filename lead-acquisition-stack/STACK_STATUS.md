# Stack status

Recorded during setup on 2026-08-31, in this Claude Code remote container.
Re-verify after any fresh container provision — see the ephemeral-environment
note in `README.md`.

---

## 1. Crawlee — ✅ INSTALLED & VERIFIED (done in a prior session)

- **Path:** `lead-crawler/` (this repo's root)
- **Version:** crawlee 3.18.1, playwright 1.62.1 (see `lead-crawler/package.json`)
- **Chromium:** pre-installed system Chromium at `/opt/pw-browsers/chromium`
  (141.0.7390.37), referenced via `PLAYWRIGHT_CHROMIUM_PATH`
- **Start:** `cd lead-crawler && node src/crawl.js <startUrl> [--max=N] [--engine=playwright|cheerio]`
- **Stop:** it's a one-shot CLI process — exits on its own when the crawl finishes
- **Ports:** none (no server)
- **Output:** `lead-crawler/output/leads.json`, `lead-crawler/output/leads.csv`
- **Not modified** in this session, per instructions.

## 2. Firecrawl — ❌ BLOCKED (installation could not complete)

- **Path:** `/home/user/firecrawl/firecrawl` (shallow clone, `main` branch,
  commit `9bf1242b9562cfc710b85cd74127f2628561737a`, cloned 2026-08-31 — not
  pinned to a stable tag; see "What's outstanding" below)
- **Version:** N/A — no service ever started
- **API:** did not start
- **Status: BLOCKED at the Docker layer, verified.**

### Exact blocker

This session's outbound network policy blocks the CDN hosts that serve
container image layers, for every registry tried:

```
$ docker pull redis:alpine
alpine: Pulling from library/redis
failed to copy: httpReadSeeker: failed open: failed to do request:
Get "https://production.cloudfront.docker.com/...": Forbidden

$ docker pull ghcr.io/actions/actions-runner:latest
latest: Pulling from actions/actions-runner
failed to copy: httpReadSeeker: failed open: failed to do request:
Get "https://pkg-containers.githubusercontent.com/...": Forbidden
```

The session's own proxy status endpoint confirms these are policy denials,
not transient failures:

```
{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT
 (policy denial or upstream failure)","host":"production.cloudfront.docker.com:443"}
{"kind":"connect_rejected","detail":"gateway answered 403 to CONNECT
 (policy denial or upstream failure)","host":"pkg-containers.githubusercontent.com:443"}
```

This repo's `docker-compose.yaml` needs, at minimum:

- `node:22-slim`, `golang:1.24` (Docker Hub — to build `apps/api`)
- `node:22-slim` again, `postgres:${PG_MAJOR}` (Docker Hub — `apps/playwright-service-ts`, `apps/nuq-postgres`)
- `redis:alpine`, `rabbitmq:3-management` (Docker Hub, pre-built)
- The documented pre-built alternative (`ghcr.io/firecrawl/firecrawl`,
  `ghcr.io/firecrawl/playwright-service`, `ghcr.io/firecrawl/nuq-postgres`)
  is equally blocked — GHCR's blob CDN returns the same policy 403.

Docker itself works fine here (daemon started, `docker ps`/`docker build`
metadata operations succeed) — only the registry blob-download step is
denied. Per this session's own network-troubleshooting guidance: a 403 from
the egress policy is to be reported, not routed around.

### What's outstanding

- Nothing further can be installed or tested (API start, scrape, crawl/map,
  clean-exit test) until image/layer downloads are permitted from this
  session, or Firecrawl is installed on a host with open registry access.
- Not yet pinned to a specific stable release tag (the instructions
  said "when practical" — since the Docker layer already blocks any
  progress, this was left at the default branch head; re-clone with
  `git -C /home/user/firecrawl/firecrawl fetch --depth 1 origin <tag>` once
  registry access exists).

## 3. Browser Use — ✅ INSTALLED & VERIFIED

- **Source path:** `/home/user/browser-use/browser-use` (shallow clone,
  `main`, commit `d379a328879f41cbece3b052fb5102c82032c2e5`)
- **Environment:** `/home/user/browser-use-local/.venv` (uv-managed
  virtualenv, Python 3.11.15)
- **Version:** browser-use 0.13.8
- **Browser:** reuses the existing Crawlee/Playwright Chromium at
  `/opt/pw-browsers/chromium` via `BrowserProfile(executable_path=...)` —
  **no second browser binary installed.** This is an officially supported
  path (`executable_path` is a first-class `BrowserProfile` field; browser-use
  does not depend on Playwright at all — it drives Chrome directly over CDP
  via its own `cdp-use` client).
- **Install:**
  ```bash
  uv venv browser-use-local/.venv --python 3.11
  uv pip install --python browser-use-local/.venv/bin/python browser-use
  ```
- **Start (smoke test, no LLM):** `browser-use-local/.venv/bin/python browser-use-local/test_smoke.py`
- **Stop:** the script closes its own browser session (`session.kill()`) and exits; no resident process.
- **Ports:** none published — Chrome's own CDP debug port is ephemeral/loopback-only per run.
- **Test:** PASS. Ran against `https://pypi.org/` (a real public site,
  reachable from this session):
  ```
  [1/5] Starting browser session (launching Chromium)...   OK
  [2/5] Navigating to https://pypi.org/ ...                OK
  [3/5] Page title: 'pypi.org', url: 'https://pypi.org/'
  [4/5] Inspecting page elements (DOM/state summary)...    OK: found 56 interactive elements
  [5/5] Closing browser session...                         OK: browser exited cleanly
  ```
  Confirmed via `ps` after exit: no leftover Chromium process.

### Two environment-specific fixes were required (documented, not workarounds around the task's rules)

1. **Sandbox flag.** Chrome refuses to launch as root without `--no-sandbox`
   (`Running as root without --no-sandbox is not supported`, crbug.com/638180).
   browser-use only omits `--no-sandbox` because its `CONFIG.IN_DOCKER`
   auto-detect doesn't recognize this container. Fix: pass the library's own
   documented `chromium_sandbox=False` field on `BrowserProfile`.
2. **TLS interception.** This session's outbound proxy re-terminates TLS
   with its own CA, which a fresh Chromium profile doesn't trust
   (`net::ERR_CERT_AUTHORITY_INVALID`). Fix: pass
   `args=["--ignore-certificate-errors"]`, gated behind a
   `PLAYWRIGHT_IGNORE_HTTPS_ERRORS=1` env var — same pattern already used in
   `lead-crawler`. Not needed on a normal machine with direct internet
   access.
3. Default extension downloads (uBlock Origin Lite, "I don't care about
   cookies", Force Background Tab) failed with 403 for the same network-policy
   reason. This is non-fatal — browser-use logs a warning and continues
   without them.

### LLM requirement (per the task's stop-here boundary)

`session.start()` / navigation / DOM inspection above required **no LLM at
all** — that's raw `BrowserSession`, not the agent. Autonomous agent mode
(`browser_use.Agent(...).run()`) does require an LLM to decide actions.

- **Supported providers** (bundled SDKs under `browser_use/llm/`): OpenAI,
  Anthropic, Google (Gemini), Groq, AWS Bedrock, Azure OpenAI, Mistral,
  DeepSeek, Cerebras, OpenRouter, Oracle Cloud, LiteLLM (proxies many more),
  Vercel AI Gateway, and Browser Use's own hosted model
  (`ChatBrowserUse`, requires a `BROWSER_USE_API_KEY`).
- **Local-model option:** Ollama (`browser_use.llm.ollama`) — talks to a
  locally-run Ollama server; would need Ollama installed and a model pulled.
- **Can anything currently installed satisfy this?** No. No LLM API key is
  configured, Ollama is not installed, and no model weights are present on
  this machine. **Stopping here as instructed — no key added, no model
  downloaded.** Agent/autonomous mode is not available until the user
  supplies a provider (a key for one of the above) or approves an Ollama +
  local-model install.

## 4. OpenLeads — ❌ NOT FOUND

```
OPENLEADS PATH:            not found
VERSION:                   n/a
INSTALL HEALTH:            n/a — no installation located
CLI STATUS:                n/a — no `openleads` command on PATH
DOCTOR STATUS:             n/a — nothing to run a doctor check against
ENRICH COMMAND:            n/a
VERIFICATION AVAILABLE:    n/a
LICENSE:                   n/a
```

Searched: full filesystem for `*openleads*` (case-insensitive), pip/uv/pipx
package lists, global npm packages, `PATH` lookup, `/home/user`, `/root`,
systemd units, crontab, and this git repo's full commit history (all
branches). No trace anywhere.

**This is expected, not a fault of OpenLeads:** this session runs in a
freshly provisioned, ephemeral container (see the `README.md` note). If
OpenLeads was installed in a prior session or on a different machine, that
installation does not carry over here unless it was committed into a git
repo this session has access to — it wasn't.

**No reinstall was attempted** — this task's instructions are to verify
before reinstalling, and there is nothing here to verify. Reinstalling
blind isn't safe either: OpenLeads' repository/package location, license
terms, and expected config were never specified, so an install here could
easily not match whatever "the existing OpenLeads installation" the user
has in mind elsewhere. **This needs the user to confirm**: is OpenLeads
supposed to live in this same container (in which case: what's its
source — a git repo, a pip/npm package, an internal install script?), or
does the pipeline expect to reach it on another host?

## 5. Resource check (Phase 6)

| Measurement | Value |
| --- | --- |
| RAM, everything stopped (session baseline, before any install) | ~692 MiB used / 15 GiB total |
| RAM with Firecrawl running | N/A — Firecrawl never started (blocked, see above) |
| RAM during Crawlee test | not re-measured this session (Crawlee was installed and tested in a prior session); the crawl is a short-lived Node process, not a resident service |
| RAM during Browser Use test | headless Chromium + the Python driver together stayed well within the idle headroom; no OOM or swywap activity observed (`Swap: 0B` throughout) |
| RAM idle at end of this session (Docker daemon stopped, no browsers/containers running) | ~739 MiB used / 15 GiB total |
| Disk added — `lead-crawler/` (repo) | 126 MB (mostly `node_modules`) |
| Disk added — Firecrawl clone (`/home/user/firecrawl`) | 85 MB (source only — no images built) |
| Disk added — Browser Use clone (`/home/user/browser-use`) | 15 MB (source) |
| Disk added — `browser-use-local/.venv` | 231 MB |
| Disk headroom remaining | ~30 GB available (`df -h /`) |

**End-of-session cleanup performed:** Docker daemon stopped (`SIGTERM`,
confirmed exited); no Chromium/browser processes left running (confirmed via
`ps`); no Docker containers were ever created (nothing to remove). Nothing
resident was left running.
