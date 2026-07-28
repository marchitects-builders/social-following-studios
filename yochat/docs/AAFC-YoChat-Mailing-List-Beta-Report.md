# AAFC — YoChat Mailing List Beta Verification Report

Production dashboard: https://yochat-messenger-webhook.vercel.app/dashboard

## Campaign

- Campaign name: **AAFC — YoChat Mailing List Beta**
- Organization: **Artists And Athletes For Change (AAFC)**
- Campaign status: **Beta**
- Audience: **Internal test contact only**
- Full-list publishing: **Disabled**
- Mailing list: **AAFC Mailing List**
- Reply keyword: **MAILING LIST**
- Applied tag: **YoChat Mailing List Beta**

## Test contact

- Name: **AAFC Beta Test Contact**
- Username: **aafc-beta-test**
- Email: **aafc.beta.test@example.com**
- Phone: **+1 202-555-0147**
- Channel: **Yochat internal test channel**

## Production results

| Requirement | Result |
|---|---|
| Initial campaign message | Delivered — internal test mode |
| Reply received by YoChat | Passed; recorded in transcript and campaign activity |
| Keyword recognized | Passed |
| Case-insensitive matching | Passed |
| Extra-space handling | Passed |
| Punctuation handling | Passed |
| Non-matching reminder | Passed |
| Mailing-list subscription | Subscribed |
| Contact information preserved | Name, username, email, phone, and fields preserved |
| Join date and time | 2026-07-27 4:08:07 PM PDT / 2026-07-27T23:08:07.901Z |
| Beta tag | Applied |
| Campaign response status | Successful |
| Confirmation message | Delivered — internal test mode |
| Campaign activity log | 22 campaign activity entries recorded |
| Repeated-reply protection | Passed; exactly one subscription entry |
| Campaign safety | Remained beta and test-only |

## Keyword tests

All four accepted reply formats passed:

1. `Mailing List`
2. `MAILING LIST`
3. `mailing list`
4. `  Mailing   List!  `

The non-matching reply `Please add me to the updates` correctly returned:

> To join the mailing list, reply MAILING LIST.

Successful replies returned:

> You’re officially on the mailing list. We’ll keep you updated with new announcements, opportunities, and important information.

## Final verification

- AAFC campaign suite: **12/12 passed in production**
- Existing Yochat regression suite: **11/11 passed in production**
- Production health: **OK**
- Meta connection: **Healthy**
- AI replies: **Healthy**
- Persistent storage: **Healthy**
- Admin protection: **Healthy**
- Real AAFC contacts messaged: **0**
- Full contact list messaged: **0**
- Errors or incomplete steps: **None**
