
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

## Yochat

Yochat manages Facebook Messenger and Instagram automation for Social Following, Marketing Automation Architects, and Artists And Athletes For Change. It includes the protected control room, CRM, transcripts, human handoff, testing, persistent storage, scheduled follow-ups, and the AAFC mailing-list beta campaign.

See [`yochat/README.md`](./yochat/README.md) for setup and deployment. When deploying from this repository, create a separate Vercel project and set its **Root Directory** to `yochat`. This keeps the public Social Following website and the server-based Yochat application independently deployable.
