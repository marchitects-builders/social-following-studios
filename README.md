<div align="center">

# YoChat

### Direct-message infrastructure for owned audiences.

**Meta messaging, campaign logic, CRM capture, follow-up, human handoff, and AI-assisted replies in one operating system.**

[Product Repository](./yochat) · [AAFC Verified Implementation](https://github.com/marchitectsio/AAFC-BUILD) · [Social Following Studios](https://www.socialfollowing.shop)

![Next.js](https://img.shields.io/badge/Next.js-Production-000000?logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Production-3178C6?logo=typescript&logoColor=white)
![Meta](https://img.shields.io/badge/Meta-Messenger_%26_Instagram-0866FF?logo=meta&logoColor=white)
![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-000000?logo=vercel&logoColor=white)

</div>

---

## What YoChat does

YoChat is the messaging engine built inside Social Following Studios for organizations that need to turn social attention into direct, governed audience relationships.

It manages the operating layer behind conversational campaigns:

- Facebook Messenger and Instagram webhook handling
- Brand-specific routing, rules, and verified knowledge
- Contacts, tags, custom fields, lead stages, and transcripts
- CRM capture and campaign activity history
- Human handoff and manual takeover
- STOP/START consent handling
- Scheduled follow-up processing
- Persistent storage
- Protected administrative controls
- AI-assisted replies
- Test and regression suites

The goal is simple: a social interaction should become an owned relationship the organization can identify, manage, and continue.

---

## Verified implementation: AAFC

**Artists And Athletes For Change (AAFC)** is the current verified implementation example.

The AAFC mailing-list beta tested the full reply-to-subscription flow in production-safe mode:

| Verification | Result |
| --- | --- |
| Campaign message delivery | Passed |
| Reply received and recorded | Passed |
| Keyword recognition | Passed |
| Case-insensitive matching | Passed |
| Punctuation and spacing handling | Passed |
| Mailing-list subscription | Passed |
| Contact data preservation | Passed |
| Confirmation message | Passed |
| Duplicate protection | Passed |
| Campaign safety controls | Passed |

**AAFC campaign suite: 12/12 passed.**  
**Existing YoChat regression suite: 11/11 passed.**  
**Real AAFC contacts messaged during the beta: 0.**

See the [AAFC verification report](./yochat/docs/AAFC-YoChat-Mailing-List-Beta-Report.md) and the public [AAFC build repository](https://github.com/marchitectsio/AAFC-BUILD).

---

## Representative deployment model

YoChat is designed as a reusable messaging layer rather than a one-off bot.

Each deployment can define its own:

- organization and brand rules
- reply keywords and campaign logic
- verified knowledge
- contact fields and tags
- follow-up behavior
- escalation and human-handoff rules
- consent controls
- campaign-specific reporting

AAFC is the public proof implementation. Additional cohort and client demos can use the same underlying architecture without exposing internal operating repositories.

---

## Repository structure

This repository contains the Social Following Studios public site and the YoChat production service.

```text
social-following-studios/
├── yochat/              # YoChat messaging and campaign engine
├── src/                 # Social Following Studios public site
├── public/              # Public assets
└── ...
```

For YoChat setup, environment variables, deployment, and validation, see the dedicated [YoChat README](./yochat/README.md).

---

## YoChat stack

YoChat runs as a self-contained Next.js service.

Core infrastructure includes:

- Next.js
- TypeScript
- Meta Messenger and Instagram integrations
- Upstash Redis
- QStash scheduled processing
- Vercel deployment
- protected admin controls
- production test suites

The public Social Following Studios website and the YoChat service deploy independently.

---

## Built by Social Following Studios

Social Following Studios builds systems that help organizations move from rented attention to direct audience relationships.

**Own your audience.**

[www.socialfollowing.shop](https://www.socialfollowing.shop)

<!-- production redeploy trigger: 2026-09-24 -->
