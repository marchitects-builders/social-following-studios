<div align="center">

# Social Following Studios

### Own your audience.

**Audience infrastructure for brands that want direct relationships with the people they attract.**

[Website](https://www.socialfollowing.shop) · [Avatar Studio](./Avatar-Studio) · [YoChat](./yochat)

![React](https://img.shields.io/badge/React-18-20232A?logo=react)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Production-3178C6?logo=typescript&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel&logoColor=white)

</div>

---

## What Social Following Studios builds

Social Following Studios builds the systems between attention and an owned audience.

The work in this repository supports four operating layers:

| System | What it does |
| --- | --- |
| **Audience Builder** | Converts anonymous and paid attention into identifiable audience data and usable first-party relationships. |
| **Lifecycle Activation** | Reactivates databases and runs email journeys that move known contacts toward action. |
| **Avatar Studio** | Produces digital-twin video systems that keep founders, experts, and brands present in the feed without making content production another full-time job. |
| **YoChat** | Operates direct-message automation, routing, CRM capture, follow-up, human handoff, and campaign logic across Meta messaging channels. |

The operating principle is simple: platforms can distribute attention. The business should own the relationship.

---

## Repository structure

This repository contains the public Social Following Studios website plus production systems and campaign work.

```text
social-following-studios/
├── src/                 # Public website application
├── public/              # Static production assets
├── content/             # Site and campaign content
├── Avatar-Studio/       # Avatar Studio assets and implementation
├── yochat/              # Multi-brand messaging and automation engine
├── 30-Short-Test/       # Short-form content testing work
└── scripts/             # Build and asset utilities
```

### Public website

The repository root contains the Social Following Studios site.

**Stack:** React, Vite, Tailwind CSS, Three.js, Vercel.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

---

## YoChat

[`yochat/`](./yochat) is the direct-message automation and campaign engine.

It includes:

- Facebook Messenger and Instagram webhook handling
- Brand-specific routing and verified knowledge
- Contacts, tags, custom fields, transcripts, analytics, and audit history
- Human handoff and manual takeover
- Consent handling
- Persistent Redis storage
- Scheduled follow-up processing
- Protected administrative controls
- Test and regression suites

See the dedicated [YoChat README](./yochat/README.md) for setup, deployment, environment variables, and validation.

---

## Avatar Studio

[`Avatar-Studio/`](./Avatar-Studio) contains the production layer for Social Following Studios' digital-twin video work.

Avatar Studio is built for founders, subject-matter experts, hospitality brands, dealerships, and organizations that need a consistent human presence across short-form channels while reducing the production burden on the person behind the brand.

---

## Deployment model

The public Social Following Studios website and YoChat deploy independently.

- **Website:** repository root
- **YoChat:** separate Vercel project with `yochat` set as the Root Directory

This keeps the public experience and server-based messaging infrastructure independently deployable.

---

## About Social Following Studios

Social Following Studios is the execution arm of Marchitects.

We build audience systems that help businesses identify, grow, activate, and operate the audience around them.

**Own your audience.**

[www.socialfollowing.shop](https://www.socialfollowing.shop)
