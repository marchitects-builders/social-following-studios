# Yochat Messaging Engine

Yochat is the multi-brand messaging and campaign service for:

- Social Following
- Artists And Athletes For Change (AAFC)
- Marketing Automation Architects

It runs as a self-contained Next.js service inside the Social Following repository. The public Social Following website remains at the repository root.

## Included capabilities

- Facebook Messenger and Instagram webhook verification and signed-event validation
- Brand-specific routing, rules, verified knowledge, and AI-assisted replies
- Contacts, tags, custom fields, lead stages, transcripts, analytics, and audit history
- Human handoff and manual takeover
- STOP/START consent handling
- Persistent Upstash Redis storage
- QStash five-minute follow-up processing
- Emergency global and per-brand pauses
- CSV exports and JSON operational backups
- Protected administrative dashboard
- Internal Test Lab and 11-check regression suite
- AAFC reply-to-campaign mailing-list beta and 12-check campaign suite

## Repository layout

- `app/` — dashboard, legal pages, webhook, admin, campaign, health, and scheduler routes
- `lib/` — brand configuration, messaging engine, campaign engine, storage, Meta delivery, and integrations
- `work/smoke-test.mjs` — safe end-to-end test suite
- `docs/` — Rashida’s operating tutorial and campaign verification report

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Fill in the encrypted service credentials locally. Never commit `.env.local`.
3. Install dependencies:

   ```bash
   npm install
   ```

4. Start Yochat:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000/dashboard`.

## Deploy from the Social Following repository

Create a separate Vercel project from `marchitects-builders/social-following-studios` and set its **Root Directory** to `yochat`.

Configure the environment variables documented in `.env.example`. The production service needs:

- Meta verification token, app secrets, and Page/Instagram token maps
- NVIDIA API configuration
- `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET`
- Upstash Redis REST credentials, or Vercel’s `KV_REST_API_*` aliases
- `CRON_SECRET`, `QSTASH_TOKEN`, and `QSTASH_URL`
- `YOCHAT_PUBLIC_URL` set to the deployed Yochat origin

The existing Upstash Redis and QStash resources can be connected to the new Vercel project. Redeploy after connecting them, then open **Settings → Activate scheduler**.

Do not change the live Meta webhook callback until the new deployment passes both dashboard test suites.

## Meta callback

After the deployment is verified, use:

```text
https://YOUR-YOCHAT-DOMAIN/api/webhook
```

The verification token must match `META_VERIFY_TOKEN`.

## AAFC mailing-list beta

Open **Campaigns → AAFC — YoChat Mailing List Beta**.

The campaign is locked to `test-only` and cannot message AAFC’s full contact list.

1. Select **Deliver beta invitation**.
2. Use **Manual reply test** for one response, or select **Run complete beta test**.
3. Confirm the verification report shows 12/12 checks passed.
4. Review the campaign activity log and the synthetic test contact.

The matcher is case-insensitive, ignores punctuation, and collapses extra whitespace. These all work:

- `Mailing List`
- `MAILING LIST`
- `mailing list`
- `Mailing List!`

A successful reply:

- subscribes the contact to **AAFC Mailing List**;
- preserves their name, email, phone, username, and available fields;
- applies **YoChat Mailing List Beta**;
- records the join timestamp;
- marks the response successful;
- sends the configured confirmation;
- reuses an existing subscription instead of creating a duplicate.

## Validation

Run:

```bash
npm run typecheck
npm run build
```

For the full local smoke suite, start the service with safe local test credentials and run:

```bash
npm run test:smoke
```

The expected result is:

- Core Yochat suite: 11/11
- AAFC mailing-list beta: 12/12
- No real messages sent

## Rashida’s tutorials

- [`docs/Yochat-Control-Room-Guide.md`](./docs/Yochat-Control-Room-Guide.md)
- [`docs/AAFC-YoChat-Mailing-List-Beta-Report.md`](./docs/AAFC-YoChat-Mailing-List-Beta-Report.md)
- [`docs/Rashida-Social-Following-Yochat-Tutorial.md`](./docs/Rashida-Social-Following-Yochat-Tutorial.md)
