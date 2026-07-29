# ManyChat UI Audit and YoChat Design Brief

Audit date: July 28, 2026

## Scope and guardrails

This audit used publicly delivered pages, browser-visible resources, and the public ManyChat sign-in bundle. It does not copy ManyChat source code, layouts, photography, illustrations, icons, or brand assets. The resulting YoChat system applies broad product-design lessons through original code, copy, visual assets, and interaction design.

## Twenty-screen visual audit

The BrowserClaw audit captured these distinct screens:

1. Home hero and social-proof messaging
2. Creator testimonial carousel
3. Comment-to-DM feature demonstration
4. Personal conversation demonstration
5. Story-mention and audience-growth demonstration
6. Full-bleed channel discovery image
7. Channel cards entering the viewport
8. Instagram, TikTok, and WhatsApp channel cards
9. Inbox “before and after” introduction
10. Outcome checklist card
11. Automation template gallery and phone demonstration
12. Three-step onboarding layout
13. Pricing hero, period toggle, and free-plan card
14. Pricing testimonials and plan-finder transition
15. Channel-based pricing selector and comparison intro
16. ManyChat application sign-in screen
17. Instagram product hero
18. Instagram creator-proof carousel
19. ManyChat AI product hero
20. WhatsApp product hero

## Observable technology

### Public marketing website

- Next.js resource structure under `/_next/`
- Turbopack-generated client chunks
- React component output
- Tailwind-style utility classes
- CSS Modules for page-specific components
- Responsive image optimization through ManyChat’s CDN
- CSS transforms, transitions, sticky navigation, scroll-triggered media, horizontal carousels, and looping product demonstrations
- No clear public bundle signature for Framer Motion or GSAP was found; the visible motion can be achieved with CSS, intersection observers, and carousel/video components

### ManyChat application sign-in bundle

- React application
- TypeScript and TSX are the dominant source formats in the public source map
- Modern Vite/Rolldown-style runtime output
- Redux-style slices, reducers, actions, and thunks
- Sentry React monitoring
- Usercentrics consent management
- AWS WAF challenge integration
- Stripe client integration

The public source map included 602 TypeScript, 367 TSX, 24 JSX, and 151 JavaScript source entries. Observable application areas included account connection, ads, agencies, AI agents, AI automation playgrounds, tone of voice, lead qualification, fields, audiences, and notifications.

## Functional patterns observed

- Multi-channel account connection
- Unified inbox and conversation organization
- Comment-to-DM automation
- Welcome messages and new-follower journeys
- Keyword and intent recognition
- Lead capture for email and phone
- Links, lead magnets, appointments, giveaways, and broadcasts
- FAQs and out-of-hours responses
- Follow-up messages
- AI replies, AI comments, and AI goals
- AI flow-builder assistance
- Text improvement and tone adjustment
- AI steps and intention recognition
- Contact limits, channel limits, team roles, labels, rules, and support tiers

## Design lessons worth adopting

1. **Art direction creates product confidence.** Human imagery, oversized type, and memorable color fields make the product feel intentional before the user reads details.
2. **Show the outcome, not only the control.** ManyChat demonstrates comments turning into DMs and messages turning into leads rather than presenting settings in isolation.
3. **Use color as structure.** Large color zones separate stories and functions more clearly than a wall of identical dark cards.
4. **Keep controls compact.** Operational actions stay small so primary product stories and results remain dominant.
5. **Make proof visible.** Testimonials, status states, before/after comparisons, and product demonstrations continually answer “does this work?”
6. **Use motion to explain state.** Motion is most effective when it shows a message, automation, or user journey progressing.

## Original YoChat direction: Signal Studio

YoChat’s redesign deliberately avoids the appearance of Slack, a generic AI dashboard, or a ManyChat clone.

- Warm editorial canvas instead of a dark chat shell
- Ink-black navigation rail with a custom YoChat signal mark
- Oversized page statements and concise operational context
- Aqua, violet, coral, and acid accents used as functional color zones
- Original human editorial photography created specifically for YoChat
- A welcome stage that summarizes system activity in plain language
- Color-coded live metrics with visible system status
- Clean, paper-like panels with lighter borders and restrained shadows
- Purposeful hover and entrance motion with reduced-motion support
- Responsive horizontal navigation on small screens
- Existing safety, testing, automation, CRM, campaign, and inbox functionality preserved

## Original asset

`public/images/yochat-signal-studio.webp`

The image was generated for this project and optimized to WebP. It contains no ManyChat photography, logos, UI, or other copied assets.
