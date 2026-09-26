# YoChat API Reference

Complete route surface of the YoChat Next.js service, generated from the
actual `app/api` tree (25 route files). Base URL is the deployment origin
(locally `http://localhost:3000`).

Auth model (see `ARCHITECTURE.md` § Security):
- **Admin routes** (`/api/admin/*`) require the `yochat_admin` session cookie
  (HMAC-signed, 12h expiry, password-hash-bound revocation). Unauthenticated →
  401. Login is rate-limited (5 attempts / 15 min → 429).
- **Admin mutations** (every admin `POST` except login) additionally require the
  CSRF synchronizer token as the `x-csrf-token` header, minted at
  `GET /api/admin/csrf` from the live session. Missing/wrong token → 403.
- **Server-to-server routes** (`/api/ingest/process`, `/api/cron/process-jobs`)
  require `Authorization: Bearer <CRON_SECRET>`, and when QStash signing keys are
  configured, a valid `Upstash-Signature` (verified with the real
  `@upstash/qstash` `Receiver.verify()`). Without signing keys, bearer-only
  behavior applies (local/dev/test).
- **Public**: only `/api/webhook` (Meta) and `/api/health`.

Mode gate: test-only actions in `POST /api/admin/action` (`simulate_stuck_job`,
`simulate_failed_job`, `force_wait_timeout`) are gated by
`isTestActionsEnabled()` = `NODE_ENV !== "production"` — in production they
return `400 Unsupported action`. `GET /api/admin/test/http-fixture` returns 404
in production. These are the only routes/methods that change by mode.

Brands are one of `marchitects` | `social-following` | `aafc`. Channels are
`messenger` | `instagram` | `test` (test channel never reaches Meta by
construction).

---

## Public routes

### `GET /api/webhook` — Meta subscription verification
- Auth: none. Query: `hub.mode=subscribe`, `hub.verify_token` (must equal
  `META_VERIFY_TOKEN`), `hub.challenge`.
- 200 with the challenge text on match, else 403 `{ error: "Webhook verification failed" }`.

### `POST /api/webhook` — Meta inbound events
- Auth: `x-hub-signature-256` HMAC (Messenger → `META_APP_SECRET`,
  Instagram → `META_INSTAGRAM_APP_SECRET`). Wrong signature → 401; missing app
  secrets → 500; unsupported `object` → 404; invalid JSON → 400.
- Behavior: verified events are recorded in the 48h webhook event ledger; when
  `QSTASH_TOKEN` is set they are published one-per-message to
  `/api/ingest/process` and the webhook returns 200 (`EVENT_RECEIVED`)
  immediately. Otherwise inline `after()` processing. Publish failures fall
  back to inline rather than dropping events.
- 200 `EVENT_RECEIVED` on success.

### `GET /api/health` — service health
- Auth: none.
- Response: `{ status: "ok" | "degraded" | "configuration_required", service,
  timestamp, checks: { meta, ai, persistentStorage, admin }, operational: {
  heartbeats: { ingest, jobs, scheduler }, durableIngest } }`.
- `degraded` = Meta configured but no Redis; `configuration_required` = Meta
  env incomplete. `no-store` cache header.

## Server-to-server routes

### `POST /api/ingest/process` — durable ingest worker
- Auth: QStash signature gate (when keys configured) + `Authorization: Bearer
  <CRON_SECRET>`. Without `CRON_SECRET` → 503.
- Body: `{ eventId }`. Processes exactly one ledger event per invocation:
  unknown/expired events → `{ ok: true, skipped: "unknown-event" }`;
  already-processed → `{ ok: true, skipped: "already-processed" }`; processing
  failure → 500 (so QStash retries). On success runs due delivery jobs.
- Response: `{ ok: true, delivery }` where `delivery` is the `processDueJobs`
  summary.

### `GET /api/cron/process-jobs` — five-minute scheduler tick
- Auth: same as ingest (signature gate + bearer).
- Behavior: heartbeat("scheduler"), processes due delivery jobs, due human
  handoff auto-resumes, and due flow wait timeouts.
- Response: `{ ...deliverySummary, handoffsResumed, flowWaits }`.

## Admin routes

All admin routes below require the admin session cookie (401 without). Every
`POST` additionally requires `x-csrf-token` (403 without).

### `POST /api/admin/login`
- CSRF-exempt by design. Body: `{ password }`. Rate-limited (5/15min → 429).
- Success sets the `yochat_admin` HttpOnly cookie (12h, `secure` in
  production). Password is checked against the runtime override
  (`state.security.adminPasswordHash`) when set, else `ADMIN_PASSWORD`.

### `POST /api/admin/logout`
- Clears the admin cookie. `{ ok: true }`.

### `GET /api/admin/csrf`
- Mints `{ csrfToken }` bound to the current session (HMAC of the session
  cookie). Dashboard clients send it as `x-csrf-token`.

### `GET /api/admin/dashboard`
- Full control-room snapshot: `storageMode` (`redis`|`memory`), settings,
  operational counters (failed jobs, stale processing jobs, scheduler config),
  per-brand 24h health (conversations, messages in/out, AI replies, AI cost,
  open handoffs, delivery failures, opt-outs, leads). `no-store`.

### `POST /api/admin/action` — admin command multiplexer
Body: `{ action, ...params }`. Actions:
- `reset_test` — sweep all test/probe data (channel `test`, evaluation fixtures,
  keyed probes).
- `delete_contact` — `{ contactId }` → `{ ok }`.
- `update_brand` — `{ brand, voice?, description?, disclosure?, website?, bookingUrl? }`.
- `set_global_pause` — `{ paused }` — emergency stop for all outbound.
- `set_retention` — `{ days }`.
- `resolve_handoff` / `assign_handoff` — `{ handoffId }`.
- `toggle_contact` — `{ contactId }` (pause/resume contact).
- `retry_job` — `{ jobId }`.
- `save_sequence` — `{ sequence }`.
- `set_handoff_resume` — `{ handoffId, minutes }` (timed auto-resume).
- `add_contact_note` / `delete_contact_note` — `{ contactId, text | noteId }`.
- `set_lead_stage` — `{ contactId, stage }` (validated against lead stages).
- `merge_contacts` — `{ primaryId, secondaryId }` (cross-brand rejected).
- `set_ai_budget` — `{ brand, tokens }` — per-brand daily AI token budget
  (legitimate production action).
- `set_ai_write_level` — `{ brand, level }` 0–3 (L2/L3 = explicit operator
  opt-in; legitimate production action).
- `change_admin_password` — `{ current, new }` → `{ ok: true, sessionsRevoked:
  true }`; revokes every existing session instantly (Wave 9 item 6). New
  password must be 8–200 chars.
- **Test-only (gated, production-unreachable)**: `simulate_stuck_job`
  (`{ jobId | contactId }`), `simulate_failed_job` (`{ brand }`),
  `force_wait_timeout` (`{ contactId }`) — corrupt real delivery state;
  `NODE_ENV=production` → `400 Unsupported action`.

### `POST /api/admin/ops` — diagnostics multiplexer
Body: `{ action, ...params }`. Actions:
- `heartbeats` — ingest/jobs/scheduler heartbeat freshness.
- `ops` — leveled 7-day ops event log (cap 500).
- `ratelimit_check` — `{ brand, channel }` reserve/release probe.
- `ratelimit_usage` — `{ brand, channel }` current budget usage.
- `classify_error` — `{ kind }` Meta send-error classification.
- `authorize_outbound` — `{ brand, channel, recipientId }` dry-run of the
  outbound seatbelt.
- `job_status` — `{ jobId }`.
- `ai_budget` — per-brand daily AI spend vs budget.
- `outbound_auth_log` — recent allow/deny decisions with reasons.
- `redis_creds_status` — booleans only (never credential values).
- `keyed_migration_status` — contacts/transcripts parity report (zero
  mismatches expected).
- `keyed_probe` — write-new→read-old / write-old→read-new round trip.
- `keyed_get_contact` — brand-scoped keyed contact lookup.
- `test_action_gate` — `{ enabled, nodeEnv }` (proves the gate reads live env).
- `qstash_status` — `{ signatureConfigured }` (proves the QStash signature gate
  is live).

### `GET /api/admin/events?limit=50`
- Webhook event ledger: recent entries with summarized payloads (text preview
  only; full payloads stay server-side). First stop for "did Meta's event
  reach us?".

### `GET /api/admin/export?format=csv|json&brand=<brand>`
- `format=json` → full JSON operational backup download
  (`yochat-backup-<date>.json`) — the primary backup artifact.
- `format=csv` (default) → contacts CSV (`brand` optional filter).

### `GET /api/admin/analytics?brand=<brand>&window=24h|7d|30d`
- On-demand rollups: conversations, messages in/out, AI replies + cost,
  handoffs, delivery failures, opt-outs, leads, flow completion. Brand omitted
  → all three; window omitted → 24h. Invalid window → 400.

### `GET /api/admin/timeline?contactId=<id>`
- Contact timeline: last 200 messages (newest first), handoffs, notes,
  audit-relevant events. Missing → 400; unknown contact → 404.

### `GET /api/admin/flows?flowId=<id>&brand=<brand>`
- List flows (optional brand filter) or fetch one flow. Unknown flow → 400.

### `POST /api/admin/flows` — flow lifecycle
Body `{ action, ... }`: `create`, `update`, `create_draft`, `validate`,
`publish` (requires `confirm: "PUBLISH"` — the operator must deliberately type
it), `unpublish`, `archive`, `rollback`, `duplicate`, `dry_run` (no state
mutation), `delete`. Published flows are read-only; every change starts as a
draft; versions are pinned on execution records.

### `GET /api/admin/flow-runs?runId=<id>&contactId=<id>&flowId=<id>&limit=<n>`
- Flow execution records (pinned flow version, step trace). `limit` clamped
  1–200, default 50.

### `POST /api/admin/knowledge` — knowledge base
Body `{ action, ... }`: `list` (`{ brand }`), `get` (`{ id }`), `create`
(`{ brand, title, content }`), `update` (`{ id, content }` — bumps version,
clears verification), `verify` (`{ id }` — sets `lastVerifiedAt`, no version
bump), `delete` (`{ id }`). Docs are brand-scoped; listing is tenant-isolated.
The AI may only cite verified knowledge (see `ARCHITECTURE.md`).

### `POST /api/admin/integrations` — secrets & allowlist
Body `{ action, ... }`: `add_secret` / `delete_secret` (`{ brand, name }`),
`set_allowlist` (`{ brand, ... }`). Secrets back the bounded-HTTP flow node
(secret resolution into headers); the allowlist gates which external hosts
flows may call.

### `POST /api/admin/reply` — manual reply
- Body: `{ conversationId, text }` (text ≤ 1000 chars). Creates a queued
  delivery job and processes due jobs.
- Guards: test-channel conversations → "Test conversations cannot send real
  messages"; opted-out contacts → refused; last contact activity older than 23h
  → "The Meta messaging window has closed". (Production path — this sends
  through Meta.)

### `POST /api/admin/test` — Test Lab simulation
- Body: `{ brand, trigger, text, persona? }`. Runs one message through the
  complete engine on channel `test` (persona defaults to
  `rashida-test-account`). Creates test CRM records and analytics; **never
  sends externally** (safe by construction in every mode).

### `GET /api/admin/test/http-fixture?mode=ok|slow|large|echo`
- **Test-only**: returns 404 in production. Fixture for the bounded-HTTP flow
  node: `ok` (small fast JSON), `slow` (15s delay, exceeds the 10s timeout),
  `large` (512KB body, exceeds the 256KB cap), `echo` (header echo proving
  secret resolution). Localhost calls are only permitted under
  `YOCHAT_TEST_MODE=1`.

### `POST /api/admin/evaluate` — 11-check engine regression
- Runs the embedded engine eval (`channel: "test"`, suite id) and returns
  per-check `{ name, brand, passed, detail }`. Safe in every mode (test
  channel only). Expected: 11/11.

### `POST /api/admin/ai-eval`
- AI control-plane probes: `provider_info`, `stub` / `stub_last_call`,
  `intent_check`, `hallucination`, `redteam`, `clamp_check`, `truncate_check`.
  In `YOCHAT_TEST_MODE=1` these exercise the deterministic stub (zero paid
  calls).

### `GET /api/admin/campaigns`
- AAFC mailing-list beta verification report (12-check suite status,
  enrollment, activity log).

### `POST /api/admin/campaigns`
- Body `{ action: "start" | "reply" | "run_full" | "reset", text? }`. All
  actions run on the **test-only** beta contact (`AAFC_BETA_TEST_CONTACT`);
  the campaign is locked to test-only and cannot message AAFC's real contact
  list. `reply` requires non-empty `text`.

### `GET /api/admin/scheduler`
- `{ configured, active, schedule? }` — whether QStash is connected and the
  `yochat-followups-v1` schedule exists and is unpaused.

### `POST /api/admin/scheduler`
- Creates/refreshes the QStash `yochat-followups-v1` schedule (`*/5 * * * *`
  → `GET {YOCHAT_PUBLIC_URL}/api/cron/process-jobs`, 3 retries, forwards
  `Bearer <CRON_SECRET>`). Requires `QSTASH_TOKEN` + `CRON_SECRET`; 400
  otherwise. Dashboard: "Activate scheduler".

---

## Admin pages (dashboard UI)

- `/` — public status page (config checklist, `operational`/`degraded`/`configuration_required`).
- `/login` — admin sign-in (password only).
- `/dashboard` — the Control Room: overview, inbox, contacts, automations,
  campaigns, knowledge, analytics, Test Lab, settings. Auth via
  `app/dashboard/layout.tsx` (redirects to `/login`).
- `/dashboard/flows` — Flow Studio (draft → simulate → typed-PUBLISH publish;
  published flows read-only).
- `/privacy`, `/terms`, `/data-deletion` — legal pages (Meta app compliance).

## What is NOT here (by design)

No signup, no billing, no pricing, no self-serve onboarding, no multi-tenant
provisioning — the service is single-tenant and internal. See `COMMERCIAL.md`
for why.
