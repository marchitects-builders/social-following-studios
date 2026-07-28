# Yochat Control Room Guide

Production address: https://yochat-messenger-webhook.vercel.app/dashboard

Yochat manages three brands from one protected dashboard:

- Marketing Automation Architects (Marchitects)
- Social Following
- Artists And Athletes For Change (AAFC)

## 1. Sign in

Open the production address, enter the Yochat dashboard password, and select **Open dashboard**. Sessions expire automatically after 12 hours. Repeated incorrect passwords are temporarily blocked.

## 2. Overview

Use **Overview** as the daily health screen. It shows:

- contacts and conversations across the three brands;
- open human handoffs;
- queued or failed deliveries;
- Meta, AI, storage, scheduler, and delivery status;
- recent messaging activity.

The **Pause all** button is the emergency stop. Incoming activity is still recorded, but automated replies stop until **Resume all** is selected. STOP and START confirmations remain available.

## 3. Inbox and human takeover

Open **Inbox**, then select a conversation to see its complete transcript.

- **Pause bot** stops automation for that contact.
- **Resume bot** turns it back on.
- **Assign** marks a human handoff as assigned to Rashida.
- **Resolve** closes the handoff and resumes the conversation.
- **Review and send** sends a manual reply to a real Meta contact after a confirmation prompt. Manual takeover pauses automation so the bot does not talk over Rashida.

Yochat will not manually message a test identity, an opted-out contact, or a contact whose Meta messaging window has closed.

## 4. Contacts

Use **Contacts** as the lightweight CRM. Each record shows the brand, channel, lead stage, tags, contact details, and last activity.

- Pause or resume automation for one person.
- Delete a contact and their associated Yochat conversation history.
- Use **Export contacts** for a spreadsheet-ready CSV.
- Use **Download backup** for a JSON operational backup.
- Use the brand filter at the top to export only one brand.

## 5. Automations

Use **Automations** to turn keyword rules on or off. Current routing includes:

- shared pricing, booking, lead-capture, and human-help rules;
- Marchitects automation-audit interest;
- Social Following GROW and guide/lead-magnet interest;
- AAFC volunteer, partnership, donation, and event interest.

Follow-up sequences are brand-specific. They stop automatically when the contact replies, opts out, requests a human, automation is paused, or Meta’s messaging window closes.

## 6. Knowledge and brand voice

Use **Knowledge** to edit only facts Yochat is allowed to rely on. Keep entries short, current, and verified. Use **Settings** to edit each brand’s description, voice, automation disclosure, website, and booking link.

Each brand also has its own **Automation on/off** control. This is useful when one organization needs maintenance while the other two remain active.

## 7. AAFC mailing-list beta campaign

Open **Campaigns** to use **AAFC — YoChat Mailing List Beta**. The campaign is locked to the internal test contact and cannot message AAFC’s full list while its audience is set to **test-only**.

1. Select **Deliver beta invitation** to send the internal test contact: `Reply MAILING LIST to join our mailing list.`
2. Use **Manual reply test** to try a single response.
3. Select **Run complete beta test** to test the initial delivery, non-matching reminder, four accepted keyword formats, subscription, preserved contact data, join timestamp, tag, confirmation, activity log, and duplicate protection.
4. Review **Current beta status**, the verification report, and the campaign activity log.
5. Select **Reset beta test** only when you want to remove this campaign’s synthetic contact, subscription, transcript, and test activity.

Accepted replies are case-insensitive. Extra whitespace and punctuation are ignored, but the normalized reply must equal `mailing list`. A successful reply adds the contact to **AAFC Mailing List**, applies **YoChat Mailing List Beta**, records the join time, and sends the confirmation. Repeated replies reuse the existing subscription.

## 8. Analytics

Use **Analytics** to review message volume, automation triggers, lead capture, handoffs, delivery successes/failures, sequence activity, consent events, manual replies, and test results. Use the brand filter to isolate one business.

## 9. Safe Test Lab

The built-in `rashida-test-account` runs the complete decision engine but never sends a real Facebook or Instagram message.

To test one scenario:

1. Open **Test Lab**.
2. Select the brand.
3. Select a trigger such as message, comment, story reply, mention, referral, follow, or postback.
4. Enter a sample message.
5. Select **Run simulation**.
6. Review the detected intent, reply, CRM record, handoff state, and Analytics activity.

To test the whole system, select **Run all checks**. The suite checks booking, pricing, comment keywords, lead magnets, volunteering, partnerships, lead capture, human handoff, STOP, START, and duplicate-event protection. A healthy result is **11 of 11 checks passed**.

Use **Clear test data** whenever you want a clean simulator history.

## 10. Suggested live test

Use a personal Facebook or Instagram account that is not one of the connected business accounts.

1. Send Marchitects: `I want to book a consultation.`
2. Comment `GROW` on a Social Following test post.
3. Send AAFC: `I want to volunteer in my city.`
4. Send `I want a human` and confirm a handoff appears in the Inbox.
5. Send `STOP` and verify the opt-out confirmation.
6. Send `START` and verify automation resumes.

Do not use a real prospect for first-run testing.

## 11. Settings, retention, and scheduling

The default automatic retention period is 90 days. Change it under **Settings → Safety and retention**. Open handoffs are preserved during cleanup.

The scheduler checks due follow-ups every five minutes. Yochat also retries temporary delivery failures, recovers interrupted jobs, and cancels unsafe or expired sends.

## Current verification

- Production build: deployed
- Type safety and production build: passed
- Local integration checks: passed
- Production full-system evaluation: 11/11 passed
- AAFC mailing-list beta: 12/12 checks passed locally
- Real-message safety guard: passed
- Durable storage: connected and persistent
- Five-minute scheduler: connected and active
