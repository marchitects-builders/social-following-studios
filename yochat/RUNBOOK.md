# YoChat Operator Runbook

The operator's manual for the solo operator (Amaury / Kiminou Knox). YoChat is a
single-tenant, internal messaging automation service for exactly three brands —
Marketing Automation Architects (`marchitects`), Social Following
(`social-following`), Artists And Athletes For Change (`aafc`) — running as one
Next.js service on Vercel with Upstash Redis state, QStash durable ingestion,
and Meta (Messenger + Instagram) delivery. There is no multi-tenant mode, no
self-serve onboarding, and no billing code (see `COMMERCIAL.md`).

Every claim below is grounded in the current code. Where a path has never been
exercised against real infrastructure, it says so — do not assume it works.

## 1. Deploying (Vercel)

1. Create a new Vercel project from `marchitects-builders/social-following-studios`
   and set its **Root Directory** to `yochat` (this is a subdirectory deploy of
   the Social Following repo; the public Social Following site is at the repo
   root and is untouched by this project).
2. Set all environment variables from section 2 in the Vercel project settings.
3. Connect the existing Upstash Redis and QStash resources (or new ones), then
   redeploy.
4. Open the deployed dashboard and run the Control Room's **Test Lab** and
   **AAFC beta** suites (dashboard test tab + Campaigns tab) before doing
   anything else.
5. **Only after** the suites pass: open **Settings → Connection points →
   Activate scheduler** (creates the QStash `yochat-followups-v1` schedule;
   `POST /api/admin/scheduler`).
6. Do NOT change the live Meta webhook callback until the new deployment passes
   both dashboard test suites. The callback URL is
   `https://YOUR-YOCHAT-DOMAIN/api/webhook` and the verification token must
   match `META_VERIFY_TOKEN`.

## 2. Environment variables

Copy `.env.example` to `.env.local` for local work. Never commit `.env.local`
(it is gitignored; the local file holds throwaway test secrets only).

| Variable | Required | What it does | What breaks without it |
|---|---|---|---|
| `META_VERIFY_TOKEN` | Yes | Webhook subscription verification (`GET /api/webhook` compares `hub.verify_token`) | Webhook cannot be subscribed; `GET /api/webhook` always 403. Health `meta` check fails. |
| `META_APP_SECRET` | Yes | HMAC validation of Messenger/Page webhook bodies (`x-hub-signature-256`) | `POST /api/webhook` for `page` objects 500s ("missing Meta app secrets"). |
| `META_INSTAGRAM_APP_SECRET` | Yes | HMAC validation of Instagram webhook bodies | `POST /api/webhook` for `instagram` objects 500s. |
| `META_PAGE_ACCESS_TOKENS_JSON` | Yes (for Messenger) | JSON map `{pageId: pageAccessToken}`; the engine routes by Page/account ID and looks up the token per send. `META_PAGE_ACCESS_TOKEN` is a single-account fallback. | Messenger sends fail auth; engine can't resolve a token for the brand's Page. Health `meta` check fails. |
| `META_INSTAGRAM_ACCESS_TOKENS_JSON` | Yes (for IG) | Same as above for Instagram professional accounts. `META_INSTAGRAM_ACCESS_TOKEN` is the single-account fallback. | Instagram sends fail auth. Health `meta` check fails. |
| `META_GRAPH_API_VERSION` | No (default `v26.0`) | Graph API version used for Messenger sends. | Nothing; default applies. |
| `META_INSTAGRAM_GRAPH_API_VERSION` | No (default `v25.0`) | Graph API version used for Instagram sends. | Nothing; default applies. |
| `ADMIN_PASSWORD` | Yes | Plaintext admin secret for `/api/admin/login`. | Login 500s / never succeeds; health `admin` check fails. |
| `ADMIN_SESSION_SECRET` | Yes (falls back to `ADMIN_PASSWORD`) | HMAC signing key for the admin session cookie. Separate from the password so you can rotate one without the other. | Without either, session creation throws; admin is unusable. |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or Vercel `KV_REST_API_*` aliases) | Yes for production | Persistent state. Without them the store runs in-memory (ephemeral). | `storageMode()` returns `"memory"`; dashboard shows "Preview storage is active" and warns production history will not persist; health `status` reports `degraded`; every server restart wipes state. |
| `CRON_SECRET` | Yes | Bearer <redacted> protecting server-to-server routes (`POST /api/ingest/process`, `GET /api/cron/process-jobs`) and the value QStash forwards via `Upstash-Forward-Authorization`. | Cron and ingest worker reject with 401/503; no job processing, no handoff resumes, no flow wait timeouts. |
| `QSTASH_TOKEN` | Yes for production durability | Enables the durable ingest path (webhook → QStash → `/api/ingest/process`) and scheduler activation. | Webhook falls back to legacy inline `after()` processing; health `operational.durableIngest` is `false`; webhook returns 200 before processing completes. |
| `QSTASH_URL` | No (default `https://qstash.upstash.io`) | QStash API endpoint. | Nothing; default applies. |
| `QSTASH_CURRENT_SIGNING_KEY` / `QSTASH_NEXT_SIGNING_KEY` | Required when QStash is live | Signing keys for Upstash signature verification on `/api/ingest/process` and `/api/cron/process-jobs` (`Receiver.verify()`: issuer, expiry, destination binding, body-hash binding). `NEXT` enables zero-downtime rotation. | If unset, the signature gate is SKIPPED (legacy bearer-only auth) — functional but the Wave 9 forged-signature protection is off. Set both, mirroring real Upstash provisioning. |
| `YOCHAT_PUBLIC_URL` | Yes for scheduler | Public origin used to build the QStash schedule destination (`{origin}/api/cron/process-jobs`). | Scheduler activation targets the wrong URL (falls back to the request origin at activation time, which is wrong on preview deploys). |
| `NVIDIA_API_KEY` | Yes for real AI replies | NVIDIA NIM API key for Llama 3.1 70B (`meta/llama-3.1-70b-instruct` via `openai` SDK). | Falls back to the deterministic stub responder (unmetered legacy fallback); AI replies still flow but are not real LLM output. Health `ai` check fails. |
| `NVIDIA_BASE_URL` | No (default `https://integrate.api.nvidia.com/v1`) | NIM endpoint. | Nothing; default applies. |
| `NVIDIA_MODEL_NAME` | No (default `meta/llama-3.1-70b-instruct`) | Model name. | Nothing; default applies. |
| `YOCHAT_TEST_MODE` | Local/dev only | `=1` swaps the AI provider for the deterministic stub (zero paid calls) and relaxes the localhost allowlist in the bounded-HTTP helper. | Without it (and without `NVIDIA_API_KEY`), the legacy unmetered stub still runs — but the smoke suite REQUIRES `YOCHAT_TEST_MODE=1`. |
| `YOCHAT_EVENT_WEBHOOK_URL` / `YOCHAT_EVENT_WEBHOOK_SECRET` | No | Forwards qualified leads and handoffs to an external system (CRM/spreadsheet/email). | Nothing; integrations simply don't forward. |

Note on truthfulness: `lib/test-gate.ts` (`isTestActionsEnabled()`) checks **only**
`NODE_ENV !== "production"`. It does NOT check `YOCHAT_TEST_MODE`. The Wave 9
wave record and the comment at `app/api/admin/action/route.ts` overstated this
as a two-factor gate; the comment has been corrected to match the code. In
practice Vercel production builds set `NODE_ENV=production`, which is the
effective barrier.

## 3. Modes

- **Local / dev**: `npm run dev`. Throwaway secrets from `.env.local`,
  in-memory state, `YOCHAT_TEST_MODE=1` for the stubbed AI provider, QStash
  signing keys set to throwaway values so the signature gate is exercised. The
  smoke suite runs against this mode.
- **Production**: Vercel with real credentials, real Upstash Redis, real QStash,
  `NODE_ENV=production`. In production: the three `simulate_*` test actions in
  `POST /api/admin/action` return `400 Unsupported action` (the test gate),
  `GET /api/admin/test/http-fixture` returns 404, and the AI provider calls
  NVIDIA (metered) unless `NVIDIA_API_KEY` is absent (then the unmetered stub).
- The `test` **channel** (Test Lab, evaluation suite, AAFC beta) is safe by
  construction in any mode: the engine marks those sends `simulated`, and
  `deliverMetaJob` throws for any channel that is not `instagram`/`messenger`,
  so test traffic can never reach the Graph API.

## 4. Webhook setup (Meta)

1. Meta Developer App → the YoChat app: add the **Messenger** and
   **Instagram** products.
2. Webhooks → add the subscription with callback URL
   `https://YOUR-YOCHAT-DOMAIN/api/webhook` and verify token `META_VERIFY_TOKEN`
   (`GET /api/webhook` echoes `hub.challenge` only when
   `hub.mode=subscribe` and the token matches, else 403).
3. Subscribe to the page/IG events the engine handles (messages, comments,
   story replies, mentions, postbacks, referrals, follows). Inbound
   `POST /api/webhook` requires the correct `x-hub-signature-256` per object
   type (Messenger → `META_APP_SECRET`, Instagram → `META_INSTAGRAM_APP_SECRET`);
   wrong signatures get 401, unsupported objects get 404, invalid JSON gets 400.
4. Connect each brand's Page/IG account ID in `META_PAGE_ACCESS_TOKENS_JSON`
   and `META_INSTAGRAM_ACCESS_TOKENS_JSON` (the engine routes by the
   webhook's Page/account ID and refuses to send without a matching token).
5. **Blast-radius rule** (commercial policy, see `COMMERCIAL.md`): this
   deployment's single Meta App serves the three internal brands. Any external
   client engagement requires its own Meta app and its own Page/IG tokens — an
   external client's 24-hour-window violation can get the shared app flagged or
   revoked and would kill messaging for all three brands at once. Promotional
   blasts for third parties on the shared app are prohibited.

## 5. QStash configuration

1. Set `QSTASH_TOKEN`, `QSTASH_URL` (or default), `CRON_SECRET`,
   `YOCHAT_PUBLIC_URL`, and both QStash signing keys.
2. Activate the scheduler from the dashboard (**Settings → Connection points →
   Activate scheduler**), which creates schedule `yochat-followups-v1`
   (`Upstash-Cron: */5 * * * *`, method GET, 3 retries) targeting
   `{YOCHAT_PUBLIC_URL}/api/cron/process-jobs`, forwarding
   `Authorization: Bearer <CRON_SECRET>`.
3. Verify: `GET /api/admin/scheduler` reports `{ configured: true, active: true }`
   and `/api/health` → `operational.durableIngest: true`.
4. How it flows: verified webhook events are recorded in the event ledger and
   published one-per-message to `/api/ingest/process` (immediate 200 to Meta).
   The ingest worker processes exactly one event per invocation with
   already-processed/unknown-event idempotency guards, then runs due delivery
   jobs. Publish failures fall back to inline `after()` processing rather than
   dropping the event.
5. Never exercised: end-to-end QStash publish → delivery → redelivery against
   real Upstash credentials. The code path was reviewed against the scheduler's
   confirmed QStash REST pattern and tested with locally-minted Upstash-format
   JWTs, but real-infrastructure behavior is unverified.

## 6. Redis (Upstash)

- State scope credentials: `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
  (or Vercel `KV_REST_API_*` aliases). `lib/redis.ts` supports separate
  state vs ops credential scopes with legacy fallback; `POST /api/admin/ops`
  `redis_creds_status` reports booleans only, never values.
- Where state lives now (after the Wave 9 keyed migration):
  - `yochat:state:v1` — the monolithic state blob (still written, still the
    source of truth during transition; nothing deleted from it).
  - `yochat:state:lock` — blob write lock.
  - `yochat:contact:{brand}:{contactId}` + `yochat:contact-index` — keyed
    contacts, write-through mirrored on every blob save (`mirrorKeyedState`),
    dual-read (keyed first, blob fallback with lazy backfill).
  - `yochat:transcript:{brand}:{contactId}` (list) + `:cursor` +
    `yochat:transcript-index` — keyed transcripts, timestamp-sorted via RPUSH.
  - `yochat:ratelimit:{brand}:{channel}` — Lua rate-limit slots (default
    700/hour).
  - `yochat:ai:spend:{brand}:{YYYY-MM-DD}` / `yochat:ai:usage:{brand}:{YYYY-MM-DD}` —
    per-brand daily AI token budgets (TTL to next UTC midnight).
  - Webhook event ledger entries (48h TTL, 500-entry index), ops event log
    (7-day, 500-entry cap), heartbeats (120s TTL).
- Brand config and flow definitions remain blobs by design (low-write,
  cache-friendly). Cleanup of the blob copies of contacts/transcripts is an
  explicit follow-up, not yet done.
- **Local caveat**: without Redis configured, everything is in-memory and
  evaporates when the dev server stops. That is expected for local/test runs,
  never acceptable for production.

## 7. Backups and recovery

- **JSON operational backup**: `GET /api/admin/export?format=json` downloads
  the full state as `yochat-backup-<date>.json` (auth required). This is the
  primary backup artifact.
- **CSV contact export**: `GET /api/admin/export?format=csv&brand=<brand>`
  (brand optional) — contacts only.
- **Restore**: there is no automated restore path; restore means re-importing
  state from the JSON backup. Redis provider-level backups (Upstash dashboard)
  are the disaster-recovery backstop — enable them on the Upstash database.
- **Event ledger** (`GET /api/admin/events?limit=50`): every verified inbound
  event recorded with `receivedAt`, status, and outcome (48h TTL) — the
  first place to look when asking "did Meta's event reach us?".
- **Ops log** (`POST /api/admin/ops` `ops` action): leveled 7-day log of
  ingest/jobs/scheduler activity; `heartbeats` action shows ingest/jobs/
  scheduler freshness (stale after 180s).
- **Outbound audit**: every `authorizeOutbound` decision (allow/deny + reason)
  is written to the audit log; `outbound_auth_log` inspects them. If a message
  didn't send, this says why (opted out, handoff open, budget exhausted,
  paused, cross-brand, unknown brand).
- What is NOT backed up: QStash schedule definitions (recreate via Activate
  scheduler), Meta app configuration (Meta developer dashboard), Vercel env
  vars (Vercel project settings).

## 8. Incident response

**Delivery failures** — check `POST /api/admin/ops` `job_status` with the
`jobId`, then `classify_error` for the Meta error class:
- `window_closed` / `permanent` / `auth` → fail fast, no retry storm. `auth`
  means the Page/IG token is bad or revoked: re-issue the token in Meta and
  update the token JSON env var.
- `rate_limited` → requeued +30min without counting an attempt; check
  `ratelimit_usage` for the brand/channel budget (default 700/hr under Meta's
  ~750/hr IG cap).
- `template_rejected` → retried once as plain text (+1min, no attempt counted).
- `transient` → exponential backoff.
- Stuck `processing` jobs older than 10 minutes are counted as
  `staleProcessingJobs` in the dashboard snapshot; the next cron run re-claims
  them (claim-before-send prevents duplicate delivery).

**Rate limits** — `ratelimit_check` (reserve/release probe) and
`ratelimit_usage` show per-brand/per-channel budgets. A denied slot requeues the
job without burning an attempt — no action needed beyond watching usage.

**Stuck jobs / silent workers** — `/api/health` → `operational.heartbeats`:
if `ingest`, `jobs`, or `scheduler` heartbeats are stale (>180s), the worker
path is dead. Check QStash dashboard for the `yochat-followups-v1` schedule
state, verify `CRON_SECRET` matches, and re-run **Activate scheduler**.

**Budget exhaustion** — `ai_budget` shows per-brand daily spend vs budget
(default 20,000 tokens/day). On exhaustion the engine sends the hardcoded
degradation reply and routes to the human-handoff queue (never a silent fail).
Raise with the `set_ai_budget` action; budgets reset at UTC midnight. If the AI
replies look wrong/expensive, check `set_ai_write_level` (L0–L3; L2/L3 are
explicit operator opt-ins).

**Global/per-brand pause** — `set_global_pause` stops all outbound; the
dashboard header reflects pause state. Manual replies are blocked for opted-out
contacts, test-channel conversations, and contacts outside the 23h safe window.

**Password/security incident** — `change_admin_password` revokes all prior
sessions instantly (password-linked session revocation). Rotate
`ADMIN_SESSION_SECRET` too if the signing key itself is suspect. Never paste
credentials into docs, issues, or chat.

## 9. Daily checklist

- [ ] Open `/dashboard`: scan brand health cards (24h inbound/outbound, AI
      cost, open handoffs, delivery failures, opt-outs, leads).
- [ ] `POST /api/admin/ops` → `heartbeats`: all three fresh (<180s).
- [ ] `/api/health`: `status` is `ok` (not `degraded`/`configuration_required`);
      `operational.durableIngest` is `true`.
- [ ] Open handoffs: none sitting unresolved past their expected SLA.
- [ ] AI spend vs budget per brand (`ai_budget` action); confirm no brand is
      near exhaustion unexpectedly.
- [ ] Event ledger (`GET /api/admin/events?limit=50`): no unexplained
      `failed` events.

## 10. Weekly checklist

- [ ] Download a JSON operational backup (`GET /api/admin/export?format=json`)
      and store it off the Upstash database.
- [ ] Review the ops event log (`ops` action) for warnings/errors; confirm
      QStash schedule `yochat-followups-v1` is still `active`
      (`GET /api/admin/scheduler`).
- [ ] Review the outbound audit (`outbound_auth_log`) for unexpected denials.
- [ ] Check the keyed-migration parity report (`keyed_migration_status`) —
      should report zero mismatches (contacts/transcripts still dual-written).
- [ ] Verify Meta tokens still valid (a failed `auth` error class anywhere is
      the canary); note any Meta dashboard policy warnings.
- [ ] Review `analytics` rollups per brand (24h/7d/30d) for anomalies
      (delivery failure spikes, opt-out spikes, cost-per-lead drift).

## 11. What has never been exercised (honest list)

- Real Meta webhook traffic end-to-end (verification + signature + processing +
  delivery) against production infrastructure. The Meta verify/sign paths are
  unit-proven locally with minted signatures only.
- Real QStash publish → ingest → retry behavior with live Upstash credentials.
- Lua rate-limit scripts against real Upstash (trivial scripts, reviewed by
  inspection; memory fallback fully tested).
- Real NVIDIA AI replies in production (metered path). The stub path is the
  only one the smoke suite exercises.
- Multi-brand traffic at viral scale (40–100 inbound/sec) — the keyed
  migration reduced the lock-contention surface for contacts/transcripts, but
  the blob write path (`yochat:state:v1` + `yochat:state:lock`) still serializes
  all other state.
- Any external (non-Amaury) brand or user. The entire service is single-tenant
  and internal.

## 12. Change discipline

- All work is local and uncommitted by standing rule: no pushes, PRs, commits,
  merges, comments, production webhook/Meta changes, spending, or contact with
  real users.
- Every change follows the mission's wave discipline: implement → `npm run
  typecheck` (zero errors) → `npm run test:smoke` (all green, including the
  embedded 11-check engine eval and 12-check AAFC beta) → record a wave file in
  `~/workspace/yochat-unification/waves/`.
- The public Social Following site (repo root) is never touched by YoChat work.
