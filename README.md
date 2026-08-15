
# Social Following Studios

This repository contains two production-ready applications:

- The Social Following Studios website at the repository root.
- The complete Yochat messaging engine in [`yochat/`](./yochat).

## Website

```bash
npm install
npm run dev
```

The root Vercel project builds the Vite website with the settings in `vercel.json`.

## TikTok analytics

Turns a TikTok Studio export into an organic-only performance report: top videos,
posting-window analysis, and audience-active-hour overlay, with promoted posts
excluded so paid reach does not distort the rankings.

```bash
npm run analyze:tiktok -- --content content.csv --viewers viewers.csv \
  --promoted promoted.txt --tz-offset -5
```

Export the CSVs from TikTok Studio > Analytics (Overview, Content, and Viewers
tabs). `--promoted` accepts either a CSV or a plain text file with one video
link, id, or title per line; supply it whenever you have run a Promote campaign,
since the Content export does not reliably flag boosted posts. Set `--tz-offset`
to your local UTC offset -- TikTok often exports timestamps in UTC, and every
hour-of-day conclusion depends on getting it right. Run
`node scripts/tiktok-analytics.mjs --help` for all options.

## Yochat

Yochat manages Facebook Messenger and Instagram automation for Social Following, Marketing Automation Architects, and Artists And Athletes For Change. It includes the protected control room, CRM, transcripts, human handoff, testing, persistent storage, scheduled follow-ups, and the AAFC mailing-list beta campaign.

See [`yochat/README.md`](./yochat/README.md) for setup and deployment. When deploying from this repository, create a separate Vercel project and set its **Root Directory** to `yochat`. This keeps the public Social Following website and the server-based Yochat application independently deployable.
