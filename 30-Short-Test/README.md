# SFS 30-Short Prototype Sprint

This directory implements Rashida's operational blueprint for validating the Avatar Studio / Video Remaker with proof instead of invented concepts.

## Production lanes
- `01-SaaS-Founders`
- `02-Course-Creators`
- `03-Coaches`
- `04-Veo-Tests`
- `05-Omni-Tests`
- `06-Final-Scorecards`

Each vertical uses:
`Research/` → `Source-Posts/` → `Blueprints/` → `Scripts/` → `Prompts/` → `Renders/`

## Gate 1 — proven source research
For each vertical, collect 3–5 public posts from the prior 90 days and record:
creator, platform, source URL, topic, opening hook, format, views, shares, comments, why it worked, and date checked.

Do not invent engagement numbers. Leave a metric blank if the platform does not expose it reliably.

Rank sources by:
1. shares
2. comments
3. views
4. fit for the vertical
5. ease of ethical reuse

Reuse the framework, not copyrighted footage, exact scripts, brand identity, or another creator's likeness.

## Gate 2 — blueprint before script
Each chosen post gets a blueprint describing:
hook, topic, information order, hook type, visual style, scene changes, close, CTA, and run time.

Then create 10 original ideas per vertical. Each final short should target 20–45 seconds and include:
spoken script, on-screen hook, shot list, B-roll/graphic direction, scene/cut timing, captions, and CTA.

## Gate 3 — engine split test
Render the first three approved scripts — one per vertical — in both Veo and Google Omni before rendering the remaining 27.

Store Veo outputs under `04-Veo-Tests/` and Omni outputs under `05-Omni-Tests/`.

Score each engine output using the scorecard in `06-Final-Scorecards/`.

Primary decision factors from Rashida:
- Script Match
- Lip Sync
- Person Match
- amount of manual correction required

Secondary factors:
Voice Quality, Scene Flow, Text Accuracy, Visual Quality, Prompt Match, render time, and cost.

## Gate 4 — finish only after the winner is proven
Do not render the remaining 27 until the three-script split test produces a defensible winner.

The selected engine must be documented with the score evidence and the exact correction burden. 'Looks better' is not enough.

## Client safety
- Never invent a client's facts, results, guarantees, credentials, or legal claims.
- Do not use a real person's digital twin without authorization.
- Use test identities or approved assets while validating the system.
- No campaign is considered launched until there is verifiable delivery evidence.

## Definition of productized
The Video Remaker / Avatar Studio is productized only when one source post can move through the same repeatable path:
research → blueprint → original script → production prompt → render → QC score → review package → approved delivery.

The product is not complete because prompts exist. The transaction must work end to end and the correction burden must be known.