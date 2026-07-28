# Rashida’s Social Following Yochat Tutorial

## What Yochat is

Yochat is the protected messaging control room for Social Following, AAFC, and Marketing Automation Architects. It receives supported Facebook and Instagram activity, identifies what the person wants, records the conversation, applies the appropriate automation, and either replies or routes the conversation to a person.

The complete Yochat application now lives inside the Social Following GitHub repository under `yochat/`. The public Social Following website remains separate at the repository root.

## Where to use it

Production dashboard:

https://yochat-messenger-webhook.vercel.app/dashboard

Sign in with the private Yochat dashboard password. Do not share the password in messages, documents, or screenshots.

## Your daily routine

### 1. Check Overview

Open **Overview** first.

Confirm:

- Meta says **Connected**.
- AI replies say **Ready**.
- Storage says **Persistent**.
- Delivery says **Healthy**.
- There are no unexpected failed jobs.
- Review recent activity and open handoffs.

### 2. Check Inbox

Open **Inbox** to review conversations.

- Select a conversation to read its transcript.
- Select **Pause bot** if you want Yochat to stop replying to that contact.
- Select **Assign** to claim a human handoff.
- Select **Resolve** after the human conversation is handled.
- Use **Review and send** only when you intend to send a real Meta message. Yochat asks for confirmation first.

### 3. Review Contacts

Open **Contacts** to see each person’s:

- name or username;
- email and phone;
- brand and channel;
- lead stage;
- tags;
- last activity.

Use **Export contacts** for a CSV or **Download backup** for JSON. Use the brand filter when you only want Social Following or AAFC records.

## How the AAFC mailing-list beta works

Open **Campaigns** and select **AAFC — YoChat Mailing List Beta**.

The campaign is currently locked to **test-only**. It cannot send to AAFC’s full list.

### Initial message

Yochat delivers:

> Reply MAILING LIST to join our mailing list.

### Reply recognition

Yochat converts the reply to lowercase, removes punctuation, and collapses extra spaces. It then requires the normalized reply to equal `mailing list`.

These trigger the automation:

- `Mailing List`
- `MAILING LIST`
- `mailing list`
- `Mailing List!`
- `  Mailing   List!  `

An unrelated reply does not subscribe the contact. Yochat sends:

> To join the mailing list, reply MAILING LIST.

### Successful subscription

When the keyword is recognized, Yochat:

1. Finds the existing contact or creates one.
2. Preserves the person’s name, username, email, phone, and available fields.
3. Creates one subscription in **AAFC Mailing List**.
4. Applies **YoChat Mailing List Beta**.
5. Records the join date and time.
6. Marks the campaign response successful.
7. Sends:

   > You’re officially on the mailing list. We’ll keep you updated with new announcements, opportunities, and important information.

8. Records each step in the campaign activity log.

If the same person replies again, Yochat reuses their existing subscription. It does not create a duplicate.

## How to test the campaign

### Complete one-click test

1. Open **Campaigns**.
2. Select **Run complete beta test**.
3. Wait for the verification report.
4. Confirm it says **12 of 12 checks passed**.
5. Review **Current beta status**.
6. Review the campaign activity log.

The complete test checks:

- initial message delivery;
- reply receipt;
- the non-matching reminder;
- four valid keyword formats;
- mailing-list subscription;
- preserved contact information;
- beta tag;
- success state;
- confirmation delivery;
- activity logging;
- duplicate prevention;
- test-only safety.

### Test one reply

1. Select **Deliver beta invitation**.
2. Enter a reply under **Manual reply test**.
3. Select **Process reply**.
4. Review the status and activity log.

Select **Reset beta test** only when you intentionally want to remove this campaign’s synthetic contact, subscription, transcript, and test activity.

## How to test the rest of Yochat

Open **Test Lab**.

- Choose a brand.
- Choose a trigger.
- Enter a sample message.
- Select **Run simulation**.

Nothing in Test Lab is sent to a real Meta account.

Select **Run all checks** for the complete regression suite. A healthy result is **11 of 11 checks passed**.

## Managing automations

Open **Automations** to review brand rules and follow-up sequences.

- Turn off only the rule you intend to pause.
- Use the brand filter to focus on one organization.
- Follow-ups stop when the contact replies, opts out, asks for a person, or leaves Meta’s allowed messaging window.

Open **Knowledge** to update facts Yochat is allowed to use. Keep those entries current and verified. Do not add guesses, temporary promises, unapproved pricing, or private information.

## Emergency controls

Use **Pause all** when automated replies must stop across every brand. Incoming activity is still recorded.

Use **Resume all** only after the issue is resolved.

For one person, use **Pause bot** in Inbox or **Pause** in Contacts.

## Consent and safety

- `STOP` opts a person out and cancels automated follow-ups.
- `START` opts them back in.
- Human requests and high-risk topics create a handoff.
- Test identities cannot receive real manual messages.
- Never test a new workflow on a real prospect first.
- Never publish the AAFC beta to a full audience until its test report passes and the live audience is explicitly approved.

## How the repository is organized

The Social Following repository has two applications:

- `/` — the public Vite website.
- `/yochat` — the complete Next.js Yochat service.

The two applications should use separate Vercel projects. For the Yochat project, set the Vercel Root Directory to `yochat`.

## Questions for Rashida before a live mailing-list launch

The beta does not need these answers, but live activation does:

1. Should AAFC subscriptions remain in Yochat’s **AAFC Mailing List**, or should Yochat also synchronize them to an external email platform? If external, which exact platform and list?
2. Which AAFC Meta channel should send the first live pilot—Facebook Messenger or Instagram—and which approved test recipient should receive it?
3. Who should receive human handoffs or subscription-error alerts?

Until those choices are confirmed, keep the campaign in **beta / test-only**.
