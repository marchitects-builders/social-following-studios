# A Priority One Rent-A-Car

Comparable site build for the pitch to James Washington. Same base as the rest of the
Marchitects 10K builder: Vite, React 18, hash routing, and a CSS variable design system
in `src/index.css`. No Tailwind, no component library, no build step beyond Vite.

```bash
cd clients/priority-one
npm install
npm run dev      # http://localhost:5100
npm run build    # static output in dist/
```

Deploy it as its own Vercel project with **Root Directory** set to `clients/priority-one`,
the same pattern `yochat/` uses. The root Social Following Studios site stays untouched.

---

## Pages

| Route | Page | Contents |
|-------|------|----------|
| `#/` | Home | Hero, three step flow, four fleet cards, delivery block, testimonial strip, hours and contact |
| `#/reserve` | Reserve | Request Your Car form with validation and a confirmation panel |
| `#/vehicles` | Our Vehicles | Full fleet gallery with specs and features per class |
| `#/about` | About | Family story, 2001 founding, James Washington |
| `#/faq` | FAQ | Nine questions in affirmative framing |
| `#/contact` | Contact | Address, phone, hours, map embed |

Fleet cards deep link into the form with the class preselected: `#/reserve?class=suv`.

---

## Where the content lives

Everything a person would edit sits in `src/data.js`. No copy is hardcoded in components
except section headings. Items tagged `REVIEW` in that file are placeholders.

---

## Review checklist for James

Six items need his confirmation before this goes live.

1. **Fleet photography.** Every card holds a real 3:2 photo frame. Until a photograph
   arrives, the frame draws the class profile and tags itself as a photo slot. Drop files
   at these exact paths and they appear with no code change:
   `public/fleet/compact.jpg`, `midsize.jpg`, `fullsize.jpg`, `suv.jpg`,
   `hero.jpg` (16:9, home hero), `office.jpg` (the lot on South Broad).
2. **Testimonials.** Three placeholder quotes hold the section, each marked with a
   Placeholder chip. He approves them or sends his own. No Yelp or Google review text
   appears anywhere on this site.
3. **Hours.** `HOURS` in `src/data.js` carries a standard schedule as a stand in. The
   card shows a "Hours listed for review" note until he confirms the real one.
4. **Example models.** Each class names a representative model. Confirm against the
   real fleet or remove the line.
5. **Reservation destination.** Set `RESERVATION_ENDPOINT` and `RESERVATION_INBOX` in
   `src/data.js`. See below.
6. **FAQ specifics.** Answers on deposits, driver age, and mileage route the caller to
   the office rather than committing to a number. Replace with real terms once confirmed.

---

## Reservation form

The form validates in the browser, then behaves one of two ways.

**Preview mode** (`RESERVATION_ENDPOINT` empty, the current state). The form validates the
request and shows the confirmation panel with a full summary. Good for the pitch, and it
never silently drops a real customer request because nothing claims to have been sent.

**Connected mode.** Paste a lead capture URL into `RESERVATION_ENDPOINT` and the same form
POSTs JSON to it. Formspree, Zoho Web to Lead, Netlify Forms, or a custom handler all work.
Set `RESERVATION_INBOX` to the address that should receive requests and the confirmation
panel also offers a prepared email as a second route. A failed POST tells the visitor to
call the office rather than losing the request.

Fields: name, phone, email, pickup date and time, return date and time, pickup location,
address or flight number, vehicle class, notes.

---

## Design system

Defined as tokens at the top of `src/index.css`.

- **Color.** Navy `#0a1a2c` through `#1f4a75` as the base, warm gold `#c08a2e` as the
  accent, paper `#fbf8f2` as the ground. New Orleans warmth without the Mardi Gras palette.
- **Typography.** Fraunces for display, Inter for body and UI, loaded from Google Fonts
  with Georgia and system sans fallbacks.
- **Spacing.** A 4px base scale, `--s-1` through `--s-10`.
- **Type scale.** Clamp based, from `--t-xs` through `--t-display`.
- **Radius and elevation.** Three radii, three shadow levels.

Mobile first throughout. Every layout rule starts at the phone and widens with `min-width`
queries at 560, 640, 700, 860, 900, and 940px. A fixed bottom action bar carries Call and
Request Your Car on phones and disappears at 940px, since most of this traffic arrives on
a phone at the airport.

---

## Copy rules applied

All copy ran through `ai-verb-cleaner` and `no-hyphen-cleaner`.

- No em dashes anywhere.
- Hyphens only where a compound modifier sits directly before its noun. Standalone class
  labels read Midsize and Full Size for that reason.
- No three part lists in a single sentence.
- No constructed comparisons against rental chains.
- Affirmative framing throughout: every line states what the service does.
- No price, rate, deposit, or mileage figure appears anywhere on the site.

---

## Known constraint

The four fleet frames, the hero frame, and the lot frame await real photography. The build
environment had no access to stock photo sources, so the frames ship with drawn class
profiles rather than photographs. Every frame is a real `<img>` at the correct aspect ratio
with an `onError` fallback, so dropping a file at the documented path swaps it instantly.
