# YoChat System Architecture (as built)

Single-tenant internal messaging automation for three brands
(`marchitects`, `social-following`, `aafc`). One Next.js 16 service
(React 19, Node 24), Upstash Redis for state, QStash for durable ingestion and
scheduling, Meta Graph API for delivery, NVIDIA NIM (Llama 3.1 70B) for AI
replies. Serverless-first: no long-lived processes, no Postgres, no queue
broker beyond QStash.

## 1. Request flow

```
Meta (Messenger/IG) ──POST──▶ /api/webhook ──record ledger──▶ 200 EVENT_RECEIVED
        │ signature verified (x-hub-signature-256, per-object app secret)
        │
        ├─ QSTASH_TOKEN set ──▶ QStash publish (1 msg/event) ──▶ POST /api/ingest/process
        │        (Upstash-Signature verified when signing keys set; bearer otherwise)
        │        idempotent: unknown → ack-skip, processed → ack-skip,
        │        processing → retry; failure → 500 so QStash retries (3)
        │                       │
        │                       ▼
        │              processIncomingEvent (engine) ──▶ processDueJobs (send)
        │
        └─ no QStash ──▶ after() inline: processMetaWebhook + ledger record
                        (publish failure also falls back here — verified
                        events are never dropped)
```

Every 5 minutes, QStash invokes `GET /api/cron/process-jobs` (schedule
`yochat-followups-v1`), which runs: due delivery jobs → due human-handoff
auto-resumes → due flow wait timeouts (with the Wave 9 fire-time 23h Meta
window guard).

## 2. The messaging engine (`lib/engine.ts`)

`processIncomingEvent(event)` is the single entry point for every inbound
message (real or test). Pipeline order:

1. **Route by brand** — the webhook's Page/IG account ID selects the brand
   config (`lib/brands.ts`); unknown accounts are refused.
2. **Consent first** — STOP/START handling halts processing before AI or
   campaign dispatch (Wave 9's outbound seatbelt also denies opted-out,
   paused, and handoff-open contacts).
3. **Rules** — keyword/intent automation rules, then **flows**.
4. **AI** — grounded replies from verified knowledge only (see §3).
5. **Handoff** — unresolved/confused conversations route to the human queue
   with timed auto-resume.
6. **Outbound** — sends become `DeliveryJob`s claimed before send
   (claim-before-send: no duplicate delivery after worker crashes), rate
   limited per brand/channel (700/hr Lua slots, headroom under Meta's ~750/hr
   IG cap), error-classified on failure (see RUNBOOK §8), and audit-logged by
   `authorizeOutbound` with the allow/deny reason.

Safety rails are structural, not cosmetic: the `test` channel marks sends
`simulated` and `deliverMetaJob` throws for any non-Meta channel; global and
per-brand pauses stop all outbound; manual replies are blocked for test
conversations, opted-out contacts, and contacts past the 23h messaging window.

## 3. The flow engine (`lib/flows.ts`, `lib/flow-runner.ts`)

- **Authoring**: flows are authored as drafts in Flow Studio
  (`/dashboard/flows`), validated, and dry-run (no state mutation). Publishing
  requires the operator to deliberately type `PUBLISH`; published flows are
  read-only and every change starts as a new draft. Rollback and duplicate are
  supported.
- **Execution**: compiled triggers fire live messages before rules/AI; each
  run pins the flow version it started on; wait nodes require a resume path and
  are armed per contact with causality records; wait timeouts fire via cron
  with the 23h Meta window guard (sends outside the window are suppressed and
  logged as `wait_timeout_window_closed`).
- **Bounded side effects** (Wave 7): flow nodes may call external HTTP only
  through the bounded-HTTP primitive — 10s hard timeout, 256KB body cap,
  host allowlist, secret resolution into headers (never into logs), and a
  localhost escape hatch that only opens under `YOCHAT_TEST_MODE=1`.

## 4. The AI control plane (Wave 5)

- **One seam**: `lib/ai-provider.ts` (provider name + `complete()`). NVIDIA NIM
  (`meta/llama-3.1-70b-instruct`) behind it; `YOCHAT_TEST_MODE=1` swaps a
  deterministic stub so tests never make paid calls. Without a key and outside
  test mode, the stub runs unmetered as the legacy fallback.
- **Verified knowledge only**: the AI may cite only brand knowledge docs with
  `lastVerifiedAt` set; edits bump the version and clear verification. The
  knowledge CRUD lives in `POST /api/admin/knowledge`; listing is
  tenant-isolated per brand.
- **Write levels L0–L3** (`set_ai_write_level`): AI reply autonomy is an
  explicit operator setting per brand; L2/L3 are opt-in.
- **Cost controls** (`lib/ai-budget.ts`): 500-char inbound truncation, strict
  350 max-tokens clamp, per-brand daily token budget (default 20,000) with an
  atomic pre-flight spend check. On exhaustion: a hardcoded degradation reply
  and routing to the human-handoff queue — never a silent fail, never a 500.
- **Red-teaming**: the eval surface (`POST /api/admin/ai-eval`) includes
  injection refusal, hallucination, intent allowlist (identity intents are
  never writable), and clamp/truncation probes.

## 5. The data layer

**Before Wave 9**: one monolithic JSON blob (`yochat:state:v1`) with a
lock-guarded read-modify-write (`yochat:state:lock`).

**After Wave 9 (current)**: surgical keyed migration, phase 1 —
- Contacts → `yochat:contact:{brand}:{contactId}` + `yochat:contact-index` set.
- Transcripts → `yochat:transcript:{brand}:{contactId}` lists (RPUSH,
  timestamp-sorted) + cursor + index set.
- Write-through mirroring on every blob save; dual-read (keyed first, blob
  fallback with lazy backfill); a parity report (`keyed_migration_status`)
  and round-trip probe (`keyed_probe`) prove the migration continuously.
- Brand config and flow definitions stay as blobs by design (low-write).
- Blob cleanup is an explicit, not-yet-done follow-up; the blob is still the
  source of truth during transition.

The migration targets Gemini R5's concurrency risk (lock spin + write
amplification under viral traffic) for the two hottest write paths. The
remaining blob write path still serializes all other state — 40–100
inbound/sec sustained traffic is unproven.

**Persistence semantics**: with Redis configured, state persists (`redis`
mode). Without it, the store and the keyed layer both fall back to in-memory
equivalents and everything evaporates on restart. The webhook event ledger
(48h TTL, 500-entry index), ops log (7-day, 500 cap), heartbeats (120s TTL),
AI spend keys (TTL to UTC midnight), and rate-limit slots are all TTL'd by
design.

## 6. Security model (Waves 1+9)

- **Webhook integrity**: per-object HMAC signature verification; unsigned =
  401. Tampered-payload replay = 401.
- **Admin**: password login (rate-limited 5/15min), HMAC-signed 12h session
  cookies (`secure` in production), password-hash-bound sessions — a password
  change revokes every prior session instantly, no session table needed.
- **CSRF**: synchronizer tokens on every admin mutation (login exempt by
  design); missing/wrong token = 403.
- **Server-to-server**: `CRON_SECRET` bearer + real Upstash `Receiver.verify()`
  signature gate on the two QStash-invoked endpoints when signing keys are
  configured; unsigned/forged/stale/destination-mismatched = 401.
- **Credential separation**: state vs ops Redis credential scopes; the ops
  `redis_creds_status` action reports booleans only.
- **Outbound seatbelt**: `authorizeOutbound` audits every allow/deny
  (paused brand, global pause, unknown-brand contact, opted-out, paused
  contact, handoff-open conversation, cross-brand contactId, AI budget
  exhaustion) into the audit log.
- **Tenant isolation**: verified at store + API layers for contacts,
  transcripts, flows, knowledge, secrets, and analytics; cross-brand contact
  reads and outbound use are denied.
- **Test-action gate**: the three `simulate_*` actions that corrupt real
  delivery state sit behind `isTestActionsEnabled()` = `NODE_ENV !==
  "production"`. Note: the Wave 9 wave record and an earlier code comment
  described this as a two-factor gate including `YOCHAT_TEST_MODE=1`; the code
  checks only `NODE_ENV` — document the code, not the record. (The smoke
  harness additionally sets `YOCHAT_TEST_MODE=1` for the stubbed AI provider,
  which is a separate concern.)

## 7. TEST vs PRODUCTION

| | Local/dev (`YOCHAT_TEST_MODE=1`) | Production (Vercel) |
|---|---|---|
| AI provider | Deterministic stub, zero paid calls | NVIDIA NIM (metered), or unmetered stub if no key |
| State | In-memory (evaporates) unless Redis set | Upstash Redis |
| Ingest | Inline `after()` (no QStash locally) | QStash durable ingest (when configured) |
| Test-only actions | Reachable (admin) | `400 Unsupported action` |
| `http-fixture` | Live at `/api/admin/test/http-fixture` | 404 |
| Bounded-HTTP localhost | Allowed | Blocked |
| Cookie `secure` | Off | On |

The `test` channel (Test Lab, engine eval, AAFC beta) is safe in every mode:
sends are `simulated`, never delivered.

## 8. Honest: what is local-only / unverified

- **Production Redis**: no production deployment has exercised the keyed Redis
  paths; Lua rate-limit scripts are reviewed-by-inspection only (memory
  fallback fully tested). The in-memory equivalents mirror the Redis structure
  exactly, which is why the smoke suite proves the *logic* but not the
  *infrastructure*.
- **QStash end-to-end**: publish → ingest → retry/redelivery with real Upstash
  credentials has never run. Local tests mint real-format JWTs through the
  actual `Receiver.verify()` path, which proves the gate logic, not the
  network behavior.
- **Meta end-to-end**: webhook verification, signature validation, and
  delivery (`deliverMetaJob` → Graph API) have never run against real Meta
  infrastructure with real tokens. The send path's Meta error classification
  is exercised only against simulated error kinds.
- **NVIDIA**: the metered AI path is untested in production; only the stub is
  exercised by the suites.
- **Scale**: sustained high inbound rates are unproven; the keyed migration
  reduced lock contention for contacts/transcripts but the blob write path
  still serializes everything else.
- **Any external brand/user**: the entire system has only ever served
  Amaury's three internal brands. There is no multi-tenant code path at all —
  not a locked-down one, not an experimental one. It does not exist.

## 9. Key modules

`lib/engine.ts` (messaging pipeline) · `lib/flows.ts`, `lib/flow-runner.ts`
(flow engine) · `lib/jobs.ts` (delivery jobs, rate limiting hooks, outbound
seatbelt) · `lib/meta.ts` (webhook parsing, signature verification, Graph API
delivery) · `lib/store.ts`, `lib/store-keys.ts` (state, keyed migration) ·
`lib/redis.ts`, `lib/qstash.ts`, `lib/events.ts`, `lib/ops.ts`,
`lib/rate-limit.ts`, `lib/send-errors.ts` (Wave 1 reliability) ·
`lib/ai-provider.ts`, `lib/ai-budget.ts`, `lib/ai-intents.ts`,
`lib/ai-knowledge.ts`, `lib/ai-eval.ts` (AI control plane) ·
`lib/admin-auth.ts`, `lib/csrf.ts`, `lib/test-gate.ts` (security) ·
`lib/analytics.ts`, `lib/campaigns.ts`, `lib/handoffs.ts`,
`lib/integrations.ts`, `lib/http.ts`, `lib/brands.ts`, `lib/types.ts`.
