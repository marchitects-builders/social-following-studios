import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ABOUT,
  BUSINESS,
  DELIVERY,
  FAQ,
  FLEET,
  HERO,
  HOURS,
  NAV,
  PICKUP_LOCATIONS,
  RESERVATION_ENDPOINT,
  RESERVATION_INBOX,
  STEPS,
  TESTIMONIALS,
} from "./data.js";

/* =========================================================================
   Routing
   ========================================================================= */

function parseHash() {
  const raw = (window.location.hash || "#/").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const [route, query = ""] = path.split("?");
  return {
    route: route.length > 1 ? route.replace(/\/$/, "") : "/",
    params: new URLSearchParams(query),
  };
}

function useHashRoute() {
  const [state, setState] = useState(() => ({ route: "/", params: new URLSearchParams() }));

  useEffect(() => {
    const sync = () => setState(parseHash());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  return state;
}

/* =========================================================================
   Icons
   ========================================================================= */

function Icon({ name, ...rest }) {
  const paths = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    check: <path d="m5 13 4 4L19 7" />,
    checkCircle: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
      </>
    ),
    phone: (
      <path d="M15.5 21A13.5 13.5 0 0 1 3 8.5 3 3 0 0 1 6 5.5h1.6a1 1 0 0 1 1 .8l.7 3a1 1 0 0 1-.3 1L7.8 11.6a11 11 0 0 0 4.6 4.6l1.3-1.2a1 1 0 0 1 1-.3l3 .7a1 1 0 0 1 .8 1V18a3 3 0 0 1-3 3Z" />
    ),
    pin: (
      <>
        <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
        <circle cx="12" cy="10" r="2.6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5V12l3 1.8" />
      </>
    ),
    plane: (
      <path d="M10.4 3.4a1.6 1.6 0 0 1 3.2 0v5.3l7.4 4.3v2.2l-7.4-2.4v4.1l2.4 1.8v1.6L12 19.5l-4 .8v-1.6l2.4-1.8v-4.1L3 15.2V13l7.4-4.3Z" />
    ),
    hotel: (
      <>
        <path d="M3 19v-8.5M3 15h18v4M21 15v-3.2a2 2 0 0 0-2-2h-8V15" />
        <circle cx="7" cy="12" r="2.2" />
      </>
    ),
    key: (
      <>
        <circle cx="16.4" cy="7.6" r="3.4" />
        <path d="M14 10 4 20v0M6.4 17.6l2 2M9 15l2 2" />
      </>
    ),
    building: (
      <>
        <path d="M4 10v10h16V10M2.5 21h19" />
        <path d="M3.6 5.5h16.8L22 10H2Z" />
        <path d="M9.5 20v-5.5h5V20" />
      </>
    ),
    seat: (
      <>
        <path d="M6 4h2.5a2 2 0 0 1 2 1.8l.7 6.7H8a2 2 0 0 1-2-1.8Z" />
        <path d="M11.2 12.5H17a2 2 0 0 1 2 2V20H11a2 2 0 0 1-2-2v-1" />
      </>
    ),
    luggage: (
      <>
        <rect x="5" y="7.5" width="14" height="12.5" rx="2" />
        <path d="M9 7.5V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2.5M12 11v5.5" />
      </>
    ),
    gear: (
      <>
        <path d="M7 5.5v13M17 5.5v13M7 12h10" />
        <circle cx="7" cy="4" r="1.6" />
        <circle cx="17" cy="4" r="1.6" />
        <circle cx="7" cy="20" r="1.6" />
        <circle cx="17" cy="20" r="1.6" />
      </>
    ),
    shield: <path d="M12 21s7-3.2 7-8.6V6.2l-7-3-7 3v6.2C5 17.8 12 21 12 21Z" />,
    plus: <path d="M12 6v12M6 12h12" />,
    star: <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8Z" />,
    car: (
      <>
        <path d="M4 16.5v2.2a.8.8 0 0 1-.8.8H2.8a.8.8 0 0 1-.8-.8V12l2.4-5.4A2 2 0 0 1 6.2 5.4h11.6a2 2 0 0 1 1.8 1.2L22 12v6.7a.8.8 0 0 1-.8.8h-.4a.8.8 0 0 1-.8-.8v-2.2" />
        <path d="M2 12h20M6.5 15h2M15.5 15h2" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

/* =========================================================================
   Fleet photo slot

   Each card holds a real photo frame at a fixed 3:2 ratio. Drop a photograph at
   the path named in data.js and it fills the frame. Until then the frame draws
   the class profile so the layout reads at full size during review.
   ========================================================================= */

const CAR_SHAPES = {
  compact: {
    body:
      "M 78 140 L 78 112 C 78 102 84 96 96 94 L 152 84 C 166 58 190 48 226 48 L 286 48 C 316 48 332 60 346 82 L 400 92 C 412 95 418 102 418 112 L 418 140 L 380 140 A 28 28 0 0 0 324 140 L 200 140 A 28 28 0 0 0 144 140 L 78 140 Z",
    glass: [
      "M 166 82 C 178 60 198 52 226 52 L 232 52 L 232 78 Z",
      "M 240 52 L 284 52 C 308 52 322 62 334 80 L 240 78 Z",
    ],
    wheels: [
      [172, 140, 28],
      [352, 140, 28],
    ],
    ground: 172,
  },
  midsize: {
    body:
      "M 56 140 L 56 112 C 56 102 62 96 74 94 L 140 82 C 154 56 178 46 216 46 L 296 46 C 328 46 344 58 358 80 L 418 92 C 430 95 436 102 436 112 L 436 140 L 389 140 A 29 29 0 0 0 331 140 L 179 140 A 29 29 0 0 0 121 140 L 56 140 Z",
    glass: [
      "M 154 80 C 166 58 188 50 216 50 L 224 50 L 224 76 Z",
      "M 232 50 L 294 50 C 318 50 332 60 344 78 L 232 76 Z",
    ],
    wheels: [
      [150, 140, 29],
      [360, 140, 29],
    ],
    ground: 172,
  },
  fullsize: {
    body:
      "M 40 142 L 40 114 C 40 104 46 98 58 96 L 132 84 C 146 58 172 48 212 48 L 306 48 C 340 48 356 60 370 82 L 434 94 C 446 97 452 104 452 114 L 452 142 L 397 142 A 29 29 0 0 0 339 142 L 171 142 A 29 29 0 0 0 113 142 L 40 142 Z",
    glass: [
      "M 146 82 C 158 60 182 52 212 52 L 220 52 L 220 78 Z",
      "M 228 52 L 304 52 C 330 52 344 62 356 80 L 228 78 Z",
    ],
    wheels: [
      [142, 142, 29],
      [368, 142, 29],
    ],
    ground: 174,
  },
  suv: {
    body:
      "M 40 138 L 40 98 C 40 86 46 80 58 76 L 96 64 C 108 40 126 30 156 30 L 320 30 C 348 30 362 40 374 60 L 428 76 C 442 80 448 88 448 100 L 448 138 L 406 138 A 34 34 0 0 0 338 138 L 174 138 A 34 34 0 0 0 106 138 L 40 138 Z",
    glass: [
      "M 108 62 C 118 44 132 36 156 36 L 176 36 L 176 60 Z",
      "M 186 36 L 300 36 L 300 60 L 186 60 Z",
      "M 310 36 L 318 36 C 340 36 352 44 362 60 L 310 60 Z",
    ],
    wheels: [
      [140, 138, 34],
      [372, 138, 34],
    ],
    ground: 174,
  },
};

function CarProfile({ shape = "midsize" }) {
  const car = CAR_SHAPES[shape] || CAR_SHAPES.midsize;
  const gradientId = `carBody-${shape}`;

  return (
    <svg viewBox="0 0 480 200" role="presentation">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f4a75" />
          <stop offset="1" stopColor="#0f2740" />
        </linearGradient>
      </defs>
      <ellipse cx="244" cy={car.ground} rx="196" ry="7" fill="#0a1a2c" opacity=".1" />
      <path d={car.body} fill={`url(#${gradientId})`} />
      {car.glass.map((d, index) => (
        <path key={index} d={d} fill="#ffffff" opacity=".22" />
      ))}
      {car.wheels.map(([cx, cy, r], index) => (
        <g key={index}>
          <circle cx={cx} cy={cy} r={r} fill="#0a1a2c" />
          <circle cx={cx} cy={cy} r={r * 0.44} fill="#c8d4e0" />
          <circle cx={cx} cy={cy} r={r * 0.16} fill="#0f2740" />
        </g>
      ))}
    </svg>
  );
}

function PhotoSlot({ photo, shape, alt, label = "Photo slot", wide = false, art = null }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={`photo-frame${wide ? " photo-frame-wide" : ""}`}>
      {photo && !failed ? (
        <img src={photo} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <>
          <div className="photo-placeholder">{art || <CarProfile shape={shape} />}</div>
          <span className="photo-note">{label}</span>
        </>
      )}
    </div>
  );
}

/* =========================================================================
   Shell
   ========================================================================= */

function Brand({ compact = false }) {
  return (
    <a className="brand" href="#/" aria-label={`${BUSINESS.name} home`}>
      <span className="brand-mark" aria-hidden="true">
        P1
      </span>
      <span className="brand-text">
        <span className="brand-name">A Priority One</span>
        {compact ? null : <span className="brand-sub">Rent-A-Car</span>}
      </span>
    </a>
  );
}

function Header({ route }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  return (
    <header className="header">
      <div className="wrap">
        <div className="header-bar">
          <Brand />

          <nav className="nav-desktop" aria-label="Primary">
            {NAV.map((item) => (
              <a
                key={item.route}
                href={`#${item.route}`}
                aria-current={route === item.route ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="header-actions">
            <a className="header-phone" href={BUSINESS.phoneHref}>
              <span>Call the office</span>
              <strong>{BUSINESS.phoneDisplay}</strong>
            </a>
            <a className="btn btn-primary" href="#/reserve">
              Request Your Car
            </a>
          </div>

          <button
            className="nav-toggle"
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="nav-toggle-bars" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Menu
          </button>
        </div>

        {open ? (
          <nav className="nav-mobile" id="mobile-nav" aria-label="Primary">
            {NAV.map((item) => (
              <a
                key={item.route}
                href={`#${item.route}`}
                aria-current={route === item.route ? "page" : undefined}
              >
                {item.label}
              </a>
            ))}
            <a className="btn btn-navy btn-block" href={BUSINESS.phoneHref}>
              <Icon name="phone" />
              {BUSINESS.phoneDisplay}
            </a>
          </nav>
        ) : null}
      </div>
    </header>
  );
}

function ActionBar() {
  return (
    <div className="action-bar">
      <a className="btn btn-ghost" href={BUSINESS.phoneHref}>
        <Icon name="phone" />
        Call
      </a>
      <a className="btn btn-primary" href="#/reserve">
        Request Your Car
      </a>
    </div>
  );
}

function CtaBand() {
  return (
    <section className="cta-band">
      <div className="wrap cta-band-inner">
        <div>
          <h2>Ready When You Land.</h2>
          <p className="lede" style={{ marginTop: "var(--s-3)" }}>
            Send your dates and we call you back to confirm the car and the pickup spot.
          </p>
        </div>
        <div className="btn-row">
          <a className="btn btn-primary" href="#/reserve">
            Request Your Car
            <Icon name="arrow" />
          </a>
          <a className="btn btn-ghost" href={BUSINESS.phoneHref}>
            <Icon name="phone" />
            {BUSINESS.phoneDisplay}
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-top">
          <div>
            <Brand />
            <p className="footer-blurb">
              Family owned New Orleans car rentals since {BUSINESS.founded}. Compact through SUV,
              with pickup and delivery across the city.
            </p>
          </div>

          <div>
            <h4>Pages</h4>
            <ul className="footer-links">
              {NAV.map((item) => (
                <li key={item.route}>
                  <a href={`#${item.route}`}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4>Visit or call</h4>
            <ul className="footer-links">
              <li>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    BUSINESS.mapQuery
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {BUSINESS.street}
                  <br />
                  {BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}
                </a>
              </li>
              <li>
                <a href={BUSINESS.phoneHref}>{BUSINESS.phoneDisplay}</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            &copy; {new Date().getFullYear()} {BUSINESS.name}. New Orleans, Louisiana.
          </span>
          <span>Preview build. Content marked for review carries placeholder text.</span>
        </div>
      </div>
    </footer>
  );
}

/* =========================================================================
   Storefront placeholder art
   ========================================================================= */

function OfficeProfile() {
  return (
    <svg viewBox="0 0 480 200" role="presentation">
      <defs>
        <linearGradient id="officeWall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#24507c" />
          <stop offset="1" stopColor="#0f2740" />
        </linearGradient>
      </defs>
      <ellipse cx="240" cy="176" rx="200" ry="7" fill="#0a1a2c" opacity=".1" />
      <rect x="96" y="44" width="288" height="128" rx="6" fill="url(#officeWall)" />
      <rect x="96" y="44" width="288" height="16" rx="4" fill="#0a1a2c" opacity=".45" />
      <rect x="120" y="70" width="112" height="10" rx="5" fill="#d6a445" />
      <rect x="120" y="88" width="64" height="7" rx="3.5" fill="#ffffff" opacity=".35" />
      <rect x="120" y="112" width="98" height="60" fill="#ffffff" opacity=".18" />
      <rect x="240" y="112" width="60" height="60" fill="#ffffff" opacity=".12" />
      <rect x="316" y="104" width="46" height="68" rx="3" fill="#0a1a2c" opacity=".55" />
      <circle cx="352" cy="140" r="3" fill="#d6a445" />
      <path d="M96 104h288l-14 16H110Z" fill="#c08a2e" opacity=".9" />
      <g transform="translate(28 96) scale(.42)">
        <path
          d="M 56 140 L 56 112 C 56 102 62 96 74 94 L 140 82 C 154 56 178 46 216 46 L 296 46 C 328 46 344 58 358 80 L 418 92 C 430 95 436 102 436 112 L 436 140 L 389 140 A 29 29 0 0 0 331 140 L 179 140 A 29 29 0 0 0 121 140 L 56 140 Z"
          fill="#1f4a75"
        />
        <path d="M 154 80 C 166 58 188 50 216 50 L 224 50 L 224 76 Z" fill="#ffffff" opacity=".25" />
        <path d="M 232 50 L 294 50 C 318 50 332 60 344 78 L 232 76 Z" fill="#ffffff" opacity=".25" />
        <circle cx="150" cy="140" r="29" fill="#0a1a2c" />
        <circle cx="150" cy="140" r="12" fill="#c8d4e0" />
        <circle cx="360" cy="140" r="29" fill="#0a1a2c" />
        <circle cx="360" cy="140" r="12" fill="#c8d4e0" />
      </g>
    </svg>
  );
}

/* =========================================================================
   Shared blocks
   ========================================================================= */

function SpecList({ specs }) {
  return (
    <ul className="specs">
      <li>
        <Icon name="seat" />
        {specs.seats}
      </li>
      <li>
        <Icon name="luggage" />
        {specs.luggage}
      </li>
      <li>
        <Icon name="gear" />
        {specs.transmission}
      </li>
    </ul>
  );
}

function FleetCard({ vehicle, detailed = false }) {
  return (
    <article className="fleet-card">
      <PhotoSlot
        photo={vehicle.photo}
        shape={vehicle.shape}
        alt={`${vehicle.name} rental car from ${BUSINESS.name}`}
        label={`Photo slot: ${vehicle.name}`}
      />
      <div className="fleet-body">
        <div className="fleet-title-row">
          <h3>{vehicle.name}</h3>
          <span className="fleet-tag">{vehicle.tagline}</span>
        </div>
        <p>{vehicle.body}</p>
        <SpecList specs={vehicle.specs} />
        {detailed ? (
          <ul className="feature-list">
            {vehicle.features.map((feature) => (
              <li key={feature}>
                <Icon name="check" />
                {feature}
              </li>
            ))}
          </ul>
        ) : null}
        <p className="fleet-models">{vehicle.models}</p>
      </div>
      <div className="fleet-cta">
        <a className="btn btn-navy btn-block" href={`#/reserve?class=${vehicle.id}`}>
          Request this class
          <Icon name="arrow" />
        </a>
      </div>
    </article>
  );
}

function Testimonials() {
  return (
    <section className="section section-paper2">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What customers say</span>
          <h2>New Orleans Keeps Coming Back.</h2>
          <p className="lede">
            Three slots mark where customer quotes run. James approves these or supplies quotes from his own customers before launch.
          </p>
        </div>

        <div className="quote-grid">
          {TESTIMONIALS.map((item, index) => (
            <figure className="quote-card" key={index}>
              <span className="chip-placeholder">Placeholder quote</span>
              <span className="quote-mark" aria-hidden="true">
                &ldquo;
              </span>
              <blockquote>{item.quote}</blockquote>
              <figcaption className="quote-attrib">
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        <p className="review-note">
          <strong>For review:</strong> these three quotes stand in for real customer words. Send
          approved quotes and we swap them the same day.
        </p>
      </div>
    </section>
  );
}

function HoursCard() {
  return (
    <div className="info-card">
      <span className="info-card-icon">
        <Icon name="clock" />
      </span>
      <h3>Hours</h3>
      <ul className="hours-list">
        {HOURS.map((row) => (
          <li key={row.days}>
            <span>{row.days}</span>
            <strong>{row.time}</strong>
          </li>
        ))}
      </ul>
      <p className="note-inline">Hours listed for review</p>
    </div>
  );
}

function ContactCards() {
  return (
    <div className="info-grid">
      <div className="info-card">
        <span className="info-card-icon">
          <Icon name="pin" />
        </span>
        <h3>Visit the lot</h3>
        <address>
          {BUSINESS.street}
          <br />
          {BUSINESS.city}, {BUSINESS.state} {BUSINESS.zip}
        </address>
        <a
          className="link-arrow"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            BUSINESS.mapQuery
          )}`}
          target="_blank"
          rel="noreferrer"
        >
          Open in maps
          <Icon name="arrow" />
        </a>
      </div>

      <div className="info-card">
        <span className="info-card-icon">
          <Icon name="phone" />
        </span>
        <h3>Call the office</h3>
        <p>A person from the family answers during business hours and follows your rental start to finish.</p>
        <a className="strong-link" href={BUSINESS.phoneHref}>
          {BUSINESS.phoneDisplay}
        </a>
      </div>

      <HoursCard />
    </div>
  );
}

/* =========================================================================
   Home
   ========================================================================= */

function Home() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div>
            <span className="hero-badge">Family owned since {BUSINESS.founded}</span>
            <h1 style={{ marginTop: "var(--s-5)" }}>
              Rent Local. <em>Get Where You&rsquo;re Going.</em>
            </h1>
            <p className="hero-sub" style={{ marginTop: "var(--s-5)" }}>
              {HERO.subhead}
            </p>
            <div className="btn-row" style={{ marginTop: "var(--s-6)" }}>
              <a className="btn btn-primary btn-block" href="#/reserve">
                {HERO.cta}
                <Icon name="arrow" />
              </a>
              <a className="btn btn-ghost btn-block" href={BUSINESS.phoneHref}>
                <Icon name="phone" />
                {BUSINESS.phoneDisplay}
              </a>
            </div>

            <ul className="hero-trust">
              <li>
                <Icon name="plane" />
                Airport pickup and delivery
              </li>
              <li>
                <Icon name="key" />
                Four vehicle classes
              </li>
              <li>
                <Icon name="phone" />
                A local crew answers
              </li>
              <li>
                <Icon name="pin" />
                209 S Broad Street
              </li>
            </ul>
          </div>

          <div className="hero-art">
            <PhotoSlot
              photo="/fleet/hero.jpg"
              shape="midsize"
              alt="A Priority One Rent-A-Car vehicle in New Orleans"
              label="Photo slot: hero"
              wide
            />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>Three Steps to the Keys.</h2>
          </div>

          <div className="steps">
            {STEPS.map((step) => (
              <div className="step" key={step.number}>
                <span className="step-num">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
                <Icon name="arrow" className="step-arrow" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-paper2">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">The fleet</span>
            <h2>Four Classes. Every One Road Ready.</h2>
            <p className="lede">
              Pick the size that fits the trip. Every car goes out cleaned and serviced the morning it leaves the lot.
            </p>
          </div>

          <div className="fleet-grid fleet-grid-4">
            {FLEET.map((vehicle) => (
              <FleetCard vehicle={vehicle} key={vehicle.id} />
            ))}
          </div>

          <div className="btn-row" style={{ marginTop: "var(--s-6)" }}>
            <a className="btn btn-ghost" href="#/vehicles">
              See full specs for every class
              <Icon name="arrow" />
            </a>
          </div>
        </div>
      </section>

      <DeliverySection />

      <Testimonials />

      <section className="section">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Hours and contact</span>
            <h2>Find Us on South Broad.</h2>
          </div>
          <ContactCards />
        </div>
      </section>

      <CtaBand />
    </>
  );
}

function DeliverySection() {
  const icons = ["plane", "hotel", "pin", "building"];

  return (
    <section className="section section-navy">
      <div className="wrap">
        <div className="delivery-layout">
          <div>
            <div className="section-head">
              <span className="eyebrow">{DELIVERY.eyebrow}</span>
              <h2>{DELIVERY.title}</h2>
              <p className="lede">{DELIVERY.body}</p>
            </div>

            <ul className="delivery-points">
              {DELIVERY.points.map((point, index) => (
                <li className="delivery-point" key={point.title}>
                  <span className="delivery-point-icon">
                    <Icon name={icons[index] || "car"} />
                  </span>
                  <div>
                    <h3>{point.title}</h3>
                    <p>{point.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <aside className="delivery-aside">
            <h3>Your car meets your flight.</h3>
            <p>
              Send your dates and your flight number. We track the arrival and meet you with the keys the moment you land at Louis Armstrong.
            </p>
            <div className="aside-divider" />
            <ul className="aside-steps">
              <li>
                <b>1</b>
                Send your request with the flight number and terminal.
              </li>
              <li>
                <b>2</b>
                We track the flight and adjust for delays.
              </li>
              <li>
                <b>3</b>
                You get the keys and drive out.
              </li>
            </ul>
            <a className="btn btn-primary btn-block" href="#/reserve">
              Request Your Car
              <Icon name="arrow" />
            </a>
          </aside>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   Reserve
   ========================================================================= */

const EMPTY_REQUEST = {
  name: "",
  phone: "",
  email: "",
  pickupDate: "",
  pickupTime: "10:00",
  returnDate: "",
  returnTime: "10:00",
  location: PICKUP_LOCATIONS[0],
  locationDetail: "",
  vehicleClass: "",
  notes: "",
};

function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function validate(values) {
  const errors = {};

  if (!values.name.trim()) errors.name = "Tell us who the rental is for.";
  if (!values.phone.trim()) {
    errors.phone = "Add the number we should call back.";
  } else if (values.phone.replace(/\D/g, "").length < 10) {
    errors.phone = "Use a 10 digit phone number.";
  }
  if (!values.email.trim()) {
    errors.email = "Add an email address for the written confirmation.";
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
    errors.email = "Check this email address.";
  }
  if (!values.pickupDate) errors.pickupDate = "Pick the day the rental starts.";
  if (!values.returnDate) {
    errors.returnDate = "Pick the day the car comes back.";
  } else if (values.pickupDate && values.returnDate < values.pickupDate) {
    errors.returnDate = "Set the return date on or after the pickup date.";
  }
  if (!values.vehicleClass) errors.vehicleClass = "Choose a vehicle class.";

  return errors;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${month}/${day}/${year}`;
}

function formatTime(value) {
  if (!value) return "";
  const [hour, minute] = value.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function requestSummary(values) {
  const vehicle = FLEET.find((item) => item.id === values.vehicleClass);
  return [
    ["Name", values.name],
    ["Phone", values.phone],
    ["Email", values.email],
    ["Pickup", `${formatDate(values.pickupDate)} at ${formatTime(values.pickupTime)}`],
    ["Return", `${formatDate(values.returnDate)} at ${formatTime(values.returnTime)}`],
    ["Location", values.location],
    ["Details", values.locationDetail || "None supplied"],
    ["Vehicle class", vehicle ? vehicle.name : values.vehicleClass],
    ["Notes", values.notes || "None supplied"],
  ];
}

function mailtoLink(values) {
  const lines = requestSummary(values).map(([key, value]) => `${key}: ${value}`);
  const body = [`Reservation request for ${BUSINESS.name}`, "", ...lines].join("\n");
  return `mailto:${RESERVATION_INBOX}?subject=${encodeURIComponent(
    `Car request: ${values.name}, ${formatDate(values.pickupDate)}`
  )}&body=${encodeURIComponent(body)}`;
}

function Field({ label, name, error, hint, required = false, children }) {
  return (
    <div className={`field${error ? " field-error" : ""}`}>
      <label htmlFor={name}>
        {label}
        {required ? (
          <span className="req" aria-hidden="true">
            {" *"}
          </span>
        ) : null}
      </label>
      {children}
      {hint && !error ? <span className="hint">{hint}</span> : null}
      {error ? (
        <span className="error-text" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function ReserveForm({ initialClass }) {
  const [values, setValues] = useState(() => ({
    ...EMPTY_REQUEST,
    vehicleClass: initialClass || "",
  }));
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle");
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState(null);
  const successRef = useRef(null);
  const min = useMemo(todayISO, []);

  useEffect(() => {
    if (initialClass) {
      setValues((current) => ({ ...current, vehicleClass: initialClass }));
    }
  }, [initialClass]);

  useEffect(() => {
    if (status === "done" && successRef.current) {
      successRef.current.focus();
    }
  }, [status]);

  const update = (name) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const found = validate(values);
    setErrors(found);

    if (Object.keys(found).length > 0) {
      const first = document.querySelector(".field-error input, .field-error select, .class-picker");
      if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }

    setSendError("");

    if (!RESERVATION_ENDPOINT) {
      setSent(values);
      setStatus("done");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch(RESERVATION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(values),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      setSent(values);
      setStatus("done");
    } catch (error) {
      setStatus("idle");
      setSendError(
        `Send this one by phone while we look into it. Call ${BUSINESS.phoneDisplay} and we take the request directly.`
      );
    }
  };

  if (status === "done" && sent) {
    return (
      <div className="form-card">
        <div className="form-success" tabIndex={-1} ref={successRef}>
          <span className="form-success-mark">
            <Icon name="checkCircle" />
          </span>
          <h3>Request received.</h3>
          <p>
            Someone from the office calls you back to confirm the car and the pickup spot. Requests that come in during business hours get a call the same day.
          </p>

          <ul className="summary-list">
            {requestSummary(sent).map(([key, value]) => (
              <li key={key}>
                <span className="k">{key}</span>
                <span className="v">{value}</span>
              </li>
            ))}
          </ul>

          <div className="btn-row">
            <a className="btn btn-primary" href={BUSINESS.phoneHref}>
              <Icon name="phone" />
              Call {BUSINESS.phoneDisplay}
            </a>
            {RESERVATION_INBOX ? (
              <a className="btn btn-ghost" href={mailtoLink(sent)}>
                Send a copy by email
              </a>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <div className="form-grid form-grid-2">
          <Field label="Full name" name="name" error={errors.name} required>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={values.name}
              onChange={update("name")}
            />
          </Field>

          <Field label="Phone" name="phone" error={errors.phone} hint="The number we call back" required>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={values.phone}
              onChange={update("phone")}
            />
          </Field>
        </div>

        <Field label="Email" name="email" error={errors.email} hint="Where the written confirmation goes" required>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={update("email")}
          />
        </Field>

        <div className="form-grid form-grid-2">
          <Field label="Pickup date" name="pickupDate" error={errors.pickupDate} required>
            <input
              id="pickupDate"
              name="pickupDate"
              type="date"
              min={min}
              value={values.pickupDate}
              onChange={update("pickupDate")}
            />
          </Field>

          <Field label="Pickup time" name="pickupTime">
            <input
              id="pickupTime"
              name="pickupTime"
              type="time"
              value={values.pickupTime}
              onChange={update("pickupTime")}
            />
          </Field>
        </div>

        <div className="form-grid form-grid-2">
          <Field label="Return date" name="returnDate" error={errors.returnDate} required>
            <input
              id="returnDate"
              name="returnDate"
              type="date"
              min={values.pickupDate || min}
              value={values.returnDate}
              onChange={update("returnDate")}
            />
          </Field>

          <Field label="Return time" name="returnTime">
            <input
              id="returnTime"
              name="returnTime"
              type="time"
              value={values.returnTime}
              onChange={update("returnTime")}
            />
          </Field>
        </div>

        <Field label="Where should we meet you?" name="location">
          <select id="location" name="location" value={values.location} onChange={update("location")}>
            {PICKUP_LOCATIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Pickup address or flight number"
          name="locationDetail"
          hint="A hotel name works too. Flight numbers let us track your arrival and adjust for delays"
        >
          <input
            id="locationDetail"
            name="locationDetail"
            type="text"
            value={values.locationDetail}
            onChange={update("locationDetail")}
          />
        </Field>

        <div className={`field${errors.vehicleClass ? " field-error" : ""}`}>
          <span className="field-label" id="class-label" style={{ fontSize: "var(--t-sm)", fontWeight: 600, color: "var(--ink)" }}>
            Vehicle class
            <span className="req" aria-hidden="true">
              {" *"}
            </span>
          </span>
          <div className="class-picker" role="radiogroup" aria-labelledby="class-label">
            {FLEET.map((vehicle) => (
              <label
                key={vehicle.id}
                className={`class-option${values.vehicleClass === vehicle.id ? " is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="vehicleClass"
                  value={vehicle.id}
                  checked={values.vehicleClass === vehicle.id}
                  onChange={update("vehicleClass")}
                />
                {vehicle.name}
              </label>
            ))}
          </div>
          {errors.vehicleClass ? (
            <span className="error-text" role="alert">
              {errors.vehicleClass}
            </span>
          ) : null}
        </div>

        <Field label="Anything else we should know?" name="notes">
          <textarea id="notes" name="notes" value={values.notes} onChange={update("notes")} />
        </Field>
      </div>

      <div className="form-foot">
        {sendError ? (
          <p className="error-text" role="alert">
            {sendError}
          </p>
        ) : null}

        <button className="btn btn-primary btn-block" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending your request" : "Send My Request"}
          <Icon name="arrow" />
        </button>

        <p className="form-assurance">
          <Icon name="shield" />
          <span>
            This form starts a conversation. We call you back to confirm the vehicle and the rate before anything gets charged.
          </span>
        </p>
      </div>
    </form>
  );
}

function Reserve({ params }) {
  const requested = params.get("class");
  const initialClass = FLEET.some((item) => item.id === requested) ? requested : "";

  return (
    <>
      <section className="section section-tight">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Reserve</span>
            <h1 style={{ fontSize: "var(--t-h1)", marginBottom: "var(--s-4)" }}>
              Request Your Car.
            </h1>
            <p className="lede">
              Send your dates and where you want the keys. Someone from the office calls you back
              to confirm the vehicle and walk you through the paperwork.
            </p>
          </div>

          <div className="reserve-layout">
            <ReserveForm initialClass={initialClass} />

            <aside className="aside-card">
              <h3>What happens next</h3>
              <ul className="aside-steps">
                <li>
                  <b>1</b>
                  Your request lands with the office the moment you send it.
                </li>
                <li>
                  <b>2</b>
                  We check the fleet for your dates and confirm your rate by phone.
                </li>
                <li>
                  <b>3</b>
                  We set the meeting point, whether the car meets you at the airport or at your door.
                </li>
              </ul>

              <div className="aside-divider" />

              <div>
                <h3 style={{ fontSize: "1.05rem", marginBottom: "var(--s-2)" }}>Rather talk it through?</h3>
                <p>Call the office and a person picks up during business hours.</p>
                <a className="btn btn-primary btn-block" href={BUSINESS.phoneHref} style={{ marginTop: "var(--s-4)" }}>
                  <Icon name="phone" />
                  {BUSINESS.phoneDisplay}
                </a>
              </div>

              <div className="aside-divider" />

              <ul className="aside-steps">
                {HOURS.map((row) => (
                  <li key={row.days}>
                    <b>
                      <Icon name="clock" style={{ width: 13, height: 13 }} />
                    </b>
                    <span>
                      {row.days}
                      <br />
                      <strong style={{ color: "#fff" }}>{row.time}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}

/* =========================================================================
   Our Vehicles
   ========================================================================= */

function Vehicles() {
  return (
    <>
      <section className="section section-tight">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Our vehicles</span>
            <h1 style={{ fontSize: "var(--t-h1)", marginBottom: "var(--s-4)" }}>
              Four Classes, Ready to Roll.
            </h1>
            <p className="lede">
              Seats and luggage room for every class we rent. Pick the one that fits
              the trip and send your dates. We confirm the exact vehicle when we call you back.
            </p>
          </div>

          <div className="fleet-grid">
            {FLEET.map((vehicle) => (
              <FleetCard vehicle={vehicle} key={vehicle.id} detailed />
            ))}
          </div>

          <p className="review-note">
            <strong>For review:</strong> each card frames a real photograph of the class at 3:2. Send photos of the lot and they drop straight into these frames. Example
            models listed under each class await confirmation against the real fleet.
          </p>
        </div>
      </section>

      <section className="section section-paper2">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Every rental includes</span>
            <h2>The Same Standard Across the Lot.</h2>
          </div>

          <div className="info-grid">
            <div className="info-card">
              <span className="info-card-icon">
                <Icon name="check" />
              </span>
              <h3>Cleaned and serviced</h3>
              <p>Every car goes out washed inside and out, with fluids checked.</p>
            </div>
            <div className="info-card">
              <span className="info-card-icon">
                <Icon name="car" />
              </span>
              <h3>Automatic transmission</h3>
              <p>Air conditioning and Bluetooth audio come standard across all four classes.</p>
            </div>
            <div className="info-card">
              <span className="info-card-icon">
                <Icon name="key" />
              </span>
              <h3>Delivery on request</h3>
              <p>Any class travels to the airport or to a French Quarter address.</p>
            </div>
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* =========================================================================
   About
   ========================================================================= */

function About() {
  return (
    <>
      <section className="section section-tight">
        <div className="wrap">
          <div className="about-layout">
            <div>
              <span className="eyebrow">{ABOUT.eyebrow}</span>
              <h1 style={{ fontSize: "var(--t-h1)", marginBottom: "var(--s-5)" }}>{ABOUT.title}</h1>
              <p className="lede" style={{ marginBottom: "var(--s-5)" }}>
                {ABOUT.lead}
              </p>
              <div className="about-copy">
                {ABOUT.body.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </div>

            <div className="about-portrait">
              <PhotoSlot
                photo="/fleet/office.jpg"
                alt="A Priority One Rent-A-Car on South Broad Street"
                label="Photo slot: the lot"
                art={<OfficeProfile />}
              />
              <div className="about-portrait-caption">
                <strong>{ABOUT.owner}</strong>
                <span>Owner, {BUSINESS.name}</span>
              </div>
            </div>
          </div>

          <div className="stat-row" style={{ marginTop: "var(--s-8)" }}>
            <div className="stat">
              <b>2001</b>
              <span>The year James opened the doors on South Broad Street</span>
            </div>
            <div className="stat">
              <b>4</b>
              <span>Vehicle classes, from compact through SUV</span>
            </div>
            <div className="stat">
              <b>1</b>
              <span>Phone number that reaches a person who knows your rental</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-paper2">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">How we work</span>
            <h2>What Stays the Same Every Rental.</h2>
          </div>

          <div className="info-grid">
            {ABOUT.values.map((value) => (
              <div className="info-card" key={value.title}>
                <span className="info-card-icon">
                  <Icon name="star" />
                </span>
                <h3>{value.title}</h3>
                <p>{value.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* =========================================================================
   FAQ
   ========================================================================= */

function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <>
      <section className="section section-tight">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Questions</span>
            <h1 style={{ fontSize: "var(--t-h1)", marginBottom: "var(--s-4)" }}>
              Answers Before You Book.
            </h1>
            <p className="lede">
              The questions customers ask most, answered plainly. Anything else, call the office and
              we walk you through it.
            </p>
          </div>

          <div className="faq-list">
            {FAQ.map((item, index) => {
              const isOpen = open === index;
              return (
                <div className={`faq-item${isOpen ? " is-open" : ""}`} key={item.q}>
                  <h2 style={{ margin: 0 }}>
                    <button
                      className="faq-q"
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${index}`}
                      id={`faq-button-${index}`}
                      onClick={() => setOpen(isOpen ? -1 : index)}
                    >
                      {item.q}
                      <span className="faq-icon" aria-hidden="true">
                        <Icon name="plus" />
                      </span>
                    </button>
                  </h2>
                  {isOpen ? (
                    <div className="faq-a" id={`faq-panel-${index}`} role="region" aria-labelledby={`faq-button-${index}`}>
                      {item.a}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="review-note" style={{ maxWidth: "52rem" }}>
            <strong>For review:</strong> these answers carry over the current site&rsquo;s FAQ in
            affirmative framing. Specifics on deposits and mileage route to the call so the site states only what the office confirms.
          </p>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* =========================================================================
   Contact
   ========================================================================= */

function Contact() {
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(BUSINESS.mapQuery)}&output=embed`;

  return (
    <>
      <section className="section section-tight">
        <div className="wrap">
          <div className="section-head">
            <span className="eyebrow">Contact</span>
            <h1 style={{ fontSize: "var(--t-h1)", marginBottom: "var(--s-4)" }}>
              Call the Office or Send Your Dates.
            </h1>
            <p className="lede">
              The office sits at 209 S Broad Street, a short drive from downtown and the French
              Quarter. Come by, or start with the request form.
            </p>
          </div>

          <ContactCards />

          <div className="map-frame" style={{ marginTop: "var(--s-6)" }}>
            <iframe
              src={mapSrc}
              title={`Map to ${BUSINESS.name} at ${BUSINESS.street}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      <CtaBand />
    </>
  );
}

/* =========================================================================
   Root
   ========================================================================= */

const ROUTES = {
  "/": Home,
  "/vehicles": Vehicles,
  "/reserve": Reserve,
  "/about": About,
  "/faq": Faq,
  "/contact": Contact,
};

const TITLES = {
  "/": "A Priority One Rent-A-Car | New Orleans Car Rental",
  "/vehicles": "Our Vehicles | A Priority One Rent-A-Car",
  "/reserve": "Request Your Car | A Priority One Rent-A-Car",
  "/about": "About Us | A Priority One Rent-A-Car",
  "/faq": "Questions and Answers | A Priority One Rent-A-Car",
  "/contact": "Contact | A Priority One Rent-A-Car",
};

export default function App() {
  const { route, params } = useHashRoute();
  const Page = ROUTES[route] || Home;

  useEffect(() => {
    document.title = TITLES[route] || TITLES["/"];
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [route]);

  return (
    <>
      <a className="visually-hidden" href="#main">
        Skip to content
      </a>
      <Header route={route} />
      <main id="main">
        <Page params={params} />
      </main>
      <Footer />
      <ActionBar />
    </>
  );
}
