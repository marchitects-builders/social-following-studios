import React, { useEffect, useMemo, useRef, useState } from "react";

const BRAND_LOGO = "/brand/sfs-logo.png";
const LOGOS_APPROVED = "/logos-approved.png";

/* ------------------------------------------------------------------ *
 * VISIBILITY CONTROL
 * One place to govern hidden products and menu placement.
 *   status: "LIVE"   the product name and page are public
 *   status: "HIDDEN" the page is unreachable and the name never renders
 *   nav:    true      show a menu item (only takes effect when LIVE)
 * Flip a value here. Nothing else needs to change.
 * ------------------------------------------------------------------ */
const PRODUCTS = {
  audienceBuilder: { status: "LIVE", nav: true, label: "Audience Builder", route: "/audience-builder" },
  avatarStudio: { status: "HIDDEN", nav: false, label: "Avatar Studio", route: "/avatar-studio" },
  yochat: { status: "HIDDEN", nav: false, label: "YoChat", route: "/yochat" },
};

const isLive = (key) => PRODUCTS[key]?.status === "LIVE";
const showInNav = (key) => Boolean(PRODUCTS[key]?.nav) && isLive(key);

const BASE_NAV = [
  { label: "The System", href: "#system" },
  { label: "Who We Serve", href: "#who-we-serve" },
  { label: "Proof", href: "#proof" },
  { label: "Assessment", href: "#assessment" },
];

function buildNav() {
  const productItems = Object.entries(PRODUCTS)
    .filter(([key]) => showInNav(key))
    .map(([, product]) => ({ label: product.label, href: `#${product.route}` }));
  return [...BASE_NAV.slice(0, 3), ...productItems, ...BASE_NAV.slice(3), { label: "Contact", href: "#/contact" }];
}

const SECTION_IDS = ["system", "who-we-serve", "proof", "assessment", "newsletter"];

/* ------------------------------------------------------------------ *
 * ROUTING + MOTION HOOKS
 * ------------------------------------------------------------------ */
function useHashRoute() {
  const getRoute = () => {
    const raw = (window.location.hash || "#/").replace(/^#/, "");
    return raw.startsWith("/") ? raw : `/${raw}`;
  };
  const [route, setRoute] = useState("/");

  useEffect(() => {
    const syncRoute = () => setRoute(getRoute());
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    return () => window.removeEventListener("hashchange", syncRoute);
  }, []);

  return route;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useReveal(route) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window) || prefersReducedMotion()) {
      nodes.forEach((node) => node.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [route]);
}

function useHeroMotion(ref) {
  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    let frame = 0;
    const setVars = (mx, my, sy) => {
      element.style.setProperty("--mx", mx);
      element.style.setProperty("--my", my);
      if (sy !== undefined) element.style.setProperty("--sy", sy);
    };
    const onPointerMove = (event) => {
      const rect = element.getBoundingClientRect();
      const mx = ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3);
      const my = ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVars(mx, my));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setVars(undefined, undefined, String(Math.min(window.scrollY, 700))));
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [ref]);
}

/* ------------------------------------------------------------------ *
 * PRIMITIVES
 * ------------------------------------------------------------------ */
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Button({ children = "Book Your Assessment", className = "", href = "#assessment" }) {
  return (
    <a className={`btn btn-primary ${className}`} href={href}>
      <span>{children}</span>
      <Arrow />
    </a>
  );
}

function Logo({ className = "" }) {
  return <img className={`logo ${className}`} src={BRAND_LOGO} alt="Social Following Studios" />;
}

function MovementHead({ index, label, title, lede, id }) {
  return (
    <header className="movement-head" id={id} data-reveal>
      <div className="movement-kicker">
        <span className="movement-index">{index}</span>
        <span className="section-label">{label}</span>
      </div>
      <h2>{title}</h2>
      {lede && <p className="movement-lede">{lede}</p>}
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * HERO
 * ------------------------------------------------------------------ */
function HeroStage() {
  return (
    <div className="hero-stage" aria-hidden="true">
      <div className="hero-aurora" />
      <div className="hero-grid">
        <div className="hero-grid-plane" />
      </div>
      <div className="hero-horizon" />
      <div className="hero-orb hero-orb-a" />
      <div className="hero-orb hero-orb-b" />
    </div>
  );
}

function Chart() {
  return (
    <svg viewBox="0 0 420 200" role="img" aria-label="Reachable audience recovering month over month">
      <defs>
        <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#008b61" stopOpacity=".22" />
          <stop offset="1" stopColor="#008b61" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#e4ded6" strokeWidth="1">
        <path d="M0 40h420" />
        <path d="M0 90h420" />
        <path d="M0 140h420" />
      </g>
      <path
        d="M0 168 40 150 80 156 120 128 160 132 200 104 240 108 280 74 320 82 360 44 420 30 420 190 0 190Z"
        fill="url(#chartFill)"
      />
      <path
        d="M0 168 40 150 80 156 120 128 160 132 200 104 240 108 280 74 320 82 360 44 420 30"
        fill="none"
        stroke="#008b61"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="420" cy="30" r="6" fill="#008b61" stroke="#dfece5" strokeWidth="5" />
    </svg>
  );
}

function AssessmentPanel() {
  return (
    <article className="visual-panel assessment-panel" data-reveal aria-label="Assessment snapshot">
      <div className="panel-head">
        <p className="card-label">Assessment Snapshot</p>
        <span className="status-pill">
          <span className="dot" />
          Ready to deploy
        </span>
      </div>
      <div className="panel-body">
        <div className="panel-score">
          <p className="score-label">Dormant revenue estimate</p>
          <p className="score-value">$3.8M</p>
          <p className="score-note">Recoverable from the audience you already own.</p>
        </div>
        <div className="panel-chart">
          <Chart />
        </div>
      </div>
      <div className="panel-metrics">
        <PanelMetric label="Reachable audience" value="246K" note="Permissioned and deliverable" />
        <PanelMetric label="Database health" value="78%" note="Above sector median" />
        <PanelMetric label="Inbox placement" value="95%" note="Held through active governance" />
      </div>
    </article>
  );
}

function PanelMetric({ label, value, note }) {
  return (
    <div className="panel-metric">
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      <p className="metric-note">{note}</p>
    </div>
  );
}

function Hero() {
  const stageRef = useRef(null);
  useHeroMotion(stageRef);

  return (
    <section className="hero" ref={stageRef}>
      <HeroStage />
      <div className="hero-inner page-shell">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Social Following Studios</p>
          <h1 className="hero-title">
            Own your
            <br />
            audience.
          </h1>
          <p className="hero-descriptor">
            Social Following Studios is a full-service ESP and a strategic growth and communications agency.
          </p>
          <p className="hero-support">
            We build and run the audience infrastructure that turns existing customer data and new interest into direct
            relationships and measurable growth.
          </p>
          <div className="hero-actions">
            <Button>Book Your Assessment</Button>
            <a className="text-link" href="#system">
              See the system <Arrow />
            </a>
          </div>
        </div>
        <AssessmentPanel />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 01 — THE OPERATIONAL PROBLEM
 * ------------------------------------------------------------------ */
function OperationalProblem() {
  const machine = ["Program ownership", "Deployment", "Deliverability", "Sender reputation", "Targeting", "Execution"];

  return (
    <section className="page-shell movement problem-movement">
      <MovementHead
        index="01"
        label="The operational problem"
        title={
          <>
            Your database is real.
            <br />
            Somebody has to run the machine.
          </>
        }
        lede="Your customer records, your past buyers, the interest you capture every week: that asset is already yours. What it lacks is an operator."
      />
      <div className="problem-body" data-reveal>
        <p>
          Program ownership, deployment, deliverability, sender reputation, targeting, and day to day execution are
          full-time disciplines. Run part-time, they decay. The list ages, placement slips, and the audience stops
          hearing from you before anyone decides whether to respond.
        </p>
        <p>
          Social Following Studios takes the machine off your desk and runs it as one accountable program, so the asset
          you already paid for starts producing again.
        </p>
        <ul className="machine-parts">
          {machine.map((part) => (
            <li key={part}>{part}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 02 — THE SYSTEM
 * ------------------------------------------------------------------ */
function SystemArchitecture() {
  const avatarLive = isLive("avatarStudio");

  const functions = [
    {
      index: "F1",
      name: "Audience Capture",
      copy: "We install the capture layer that converts website traffic, paid campaigns, and new interest into permissioned first-party contacts you keep.",
    },
    {
      index: "F2",
      name: "Audience Builder",
      copy: "We consolidate and clean your existing customer data, segment it by real buying signal, and build the reachable audience underneath every send.",
    },
    {
      index: "F3",
      name: "Full-Service ESP",
      copy: "We operate the sending infrastructure end to end: authentication, warm up, reputation, deliverability governance, and inbox placement.",
    },
    {
      index: "F4",
      name: avatarLive ? PRODUCTS.avatarStudio.label : "24/7 Communications",
      copy: avatarLive
        ? "Avatar Studio builds a high-fidelity twin of your likeness and voice, then turns your knowledge into finished video for continuous distribution."
        : "Always-on communication across the channels your audience actually uses, staffed and monitored around the clock.",
      hidden: !avatarLive,
    },
  ];

  return (
    <section className="page-shell movement system-movement">
      <MovementHead
        id="system"
        index="02"
        label="The system"
        title="Four functions. One operator."
        lede="The full stack that stands between a database and a result. We build it, run it, and stay accountable for the outcome."
      />
      <div className="system-stack" data-reveal>
        {functions.map((fn) => (
          <article className={`system-layer ${fn.hidden ? "is-veiled" : ""}`} key={fn.index}>
            <div className="layer-index">{fn.index}</div>
            <div className="layer-body">
              <h3>{fn.name}</h3>
              <p>{fn.copy}</p>
            </div>
            <div className="layer-status" aria-hidden="true">
              <span className="layer-dot" />
              {fn.hidden ? "Underneath the architecture" : "Managed"}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 03 — WHO WE SERVE
 * ------------------------------------------------------------------ */
function WhoWeServe() {
  const audiences = [
    {
      name: "Founders",
      copy: "Founder-led companies with a real customer base and nobody running lifecycle communication as a discipline.",
    },
    {
      name: "Hospitality",
      copy: "Hotels, groups, and venues sitting on years of guest data that never gets reactivated into repeat stays.",
    },
    {
      name: "Compliance-Heavy Organizations",
      copy: "Legal, financial, healthcare, and public-sector programs where deliverability and records discipline are not optional.",
    },
  ];

  return (
    <section className="page-shell movement serve-movement">
      <MovementHead id="who-we-serve" index="03" label="Who we serve" title="Built for operators with an audience to protect." />
      <div className="serve-grid" data-reveal>
        {audiences.map((audience, i) => (
          <article className="serve-card" key={audience.name}>
            <span className="serve-number">{`0${i + 1}`}</span>
            <h3>{audience.name}</h3>
            <div className="small-rule" />
            <p>{audience.copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 04 — PROOF
 * ------------------------------------------------------------------ */
const CASE_STUDIES = [
  {
    type: "Government",
    title: "Federal housing agency",
    outcome: "Constituent engagement recovered at program scale with no new budget and no new infrastructure.",
    narrative:
      "A federal housing agency managing constituent communication across active waitlist programs engaged Social Following Studios to run the full outreach program. Coordinated communication reached applicants across every live channel inside the existing infrastructure. Constituent engagement returned to active status at program scale.",
  },
  {
    type: "Manufacturing",
    title: "Manufacturing organization",
    outcome: "Procurement relationships that had gone silent after a program transition returned to active engagement.",
    narrative:
      "A manufacturing organization had a vendor and procurement database that went quiet after a program transition. Relationships representing active buying history had stopped responding entirely. A reactivation sequence ran across the existing database. Procurement contacts returned to active engagement within the first program cycle, on the existing budget.",
    quote: "We recovered relationships we assumed were gone permanently.",
  },
  {
    type: "Real Estate",
    title: "Regional broker",
    outcome: "11 signed listing agreements in 45 days from a database the business had stopped using.",
    narrative:
      "A regional broker had a past-client database of buyers and sellers who had gone quiet while the business kept paying to acquire new leads. A unified reactivation sequence ran across email, conversational, and voice channels at once. The existing database and existing budget produced 11 signed listing agreements within 45 days.",
    quote: "The buyers and sellers we thought were gone came back through the same list we had ignored for years.",
  },
];

function Proof({ withHeader = true }) {
  return (
    <section className="page-shell movement proof-movement" id={withHeader ? undefined : "proof-inner"}>
      {withHeader && (
        <MovementHead
          id="proof"
          index="04"
          label="Proof"
          title="Verified case studies from the actual work."
          lede="Documented results in customer acquisition, database reactivation, deliverability, hospitality, communications, and growth. No ownership-economics substitute for real outcomes."
        />
      )}

      <article className="visual-panel featured-case" data-reveal aria-label="Featured case study">
        <div className="panel-head">
          <p className="card-label">Featured case study</p>
          <span className="status-pill">
            <span className="dot" />
            Legal / Mass Tort
          </span>
        </div>
        <div className="featured-case-body">
          <h3>A dormant plaintiff database reached a multi-million dollar resolution after competing firms reached the same claimant pool.</h3>
          <p>
            The plaintiff database had gone dormant while competing firms reached the same claimant pool. Inbox placement
            decides whether a claimant ever sees the message. We ran the deliverability program at 95% inbox placement,
            sequenced the outreach, and built the communication program around claimant trust. The matter reached a
            multi-million dollar resolution.
          </p>
          <blockquote>
            Our messaging reached our claimants. That was the difference.
            <cite>Managing Attorney, mass tort firm. Quoted anonymously at the client's request.</cite>
          </blockquote>
        </div>
      </article>

      <div className="proof-grid" data-reveal>
        {CASE_STUDIES.map(({ type, title, outcome, narrative, quote }) => (
          <article className="proof-card" key={title}>
            <p className="card-label">{type}</p>
            <h3>{title}</h3>
            <p className="proof-outcome">{outcome}</p>
            <p>{narrative}</p>
            {quote && <p className="proof-quote">{quote}</p>}
          </article>
        ))}
      </div>

      <div className="logo-bar" data-reveal>
        <p className="section-label">Trusted by organizations that lead</p>
        <img src={LOGOS_APPROVED} alt="Trusted organizations" />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 05 — ASSESSMENT
 * ------------------------------------------------------------------ */
function Assessment() {
  const outputs = [
    ["Database health", "Structure, hygiene, duplication, and suppression state of your contact data."],
    ["Reachable audience", "How many contacts are permissioned, deliverable, and worth sending to today."],
    ["Deliverability", "Authentication, sender reputation, and current inbox placement against a 95% target."],
    ["Dormant revenue estimate", "The recoverable value sitting in segments that have stopped hearing from you."],
    ["Deployment path", "The build order and timeline to move from assessment to first send."],
  ];

  return (
    <section className="page-shell movement assessment-movement" id="assessment">
      <MovementHead
        index="05"
        label="The assessment"
        title="Book your assessment."
        lede="Every engagement starts here. The assessment produces the numbers. The numbers drive the decision."
      />
      <div className="assessment-layout" data-reveal>
        <ol className="assessment-outputs">
          {outputs.map(([label, copy], i) => (
            <li key={label}>
              <span className="output-index">{`0${i + 1}`}</span>
              <div>
                <h3>{label}</h3>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ol>
        <BookingForm />
      </div>
    </section>
  );
}

function BookingForm() {
  return (
    <form className="form-card" action="https://crm.zoho.com/crm/WebToLeadForm" method="POST">
      <input type="hidden" name="xnQsjsdp" value="b45ce04ddd76914bbfeade30ab0a6e86446ed07ddcd64b5425a1a4d9d5a467b8" readOnly />
      <input type="hidden" name="xmIwtLD" value="97ca543a3d1ea88492628d126d9ab329b04cea167679b0225170279c6fc6e4f3684dbc3fb82c598c93398f0f68dcd29b" readOnly />
      <input type="hidden" name="actionType" value="TGVhZHM=" readOnly />
      <input type="hidden" name="Last Name" value="Assessment Request" readOnly />
      <input type="hidden" name="returnURL" value="https://www.socialfollowing.shop/#/thank-you" readOnly />
      <p className="card-label">Schedule your assessment call</p>
      <div className="form-grid">
        <Field label="Organization name" name="Company" required full />
        <Field label="Corporate email" name="Email" type="email" required full />
        <Field label="Brief description of your program" name="Description" textarea required full />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit">
          <span>Request Your Assessment</span>
          <Arrow />
        </button>
        <div className="privacy-note">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Your information is processed within governed systems under defined access controls.</span>
        </div>
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", full = false, textarea = false, required = false }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {textarea ? (
        <textarea id={name} name={name} required={required} />
      ) : (
        <input id={name} name={name} type={type} required={required} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * MOVEMENT 06 — NEWSLETTER
 * ------------------------------------------------------------------ */
function Newsletter() {
  return (
    <section className="page-shell movement newsletter-movement" id="newsletter">
      <div className="newsletter-panel" data-reveal>
        <div className="newsletter-copy">
          <div className="movement-kicker">
            <span className="movement-index">06</span>
            <span className="section-label">The newsletter</span>
          </div>
          <h2>
            Own your audience,
            <br />
            in writing.
          </h2>
          <p>
            Audience strategy and distribution. The same thinking we run for client programs, capture, deliverability,
            reactivation, and distribution, written down every week. Not a mailing list. A working feed on how to own
            your audience.
          </p>
        </div>
        <form className="newsletter-form" onSubmit={(event) => event.preventDefault()}>
          <label htmlFor="newsletter-email">Email address</label>
          <div className="newsletter-row">
            <input id="newsletter-email" type="email" placeholder="you@company.com" aria-label="Email address" />
            <button type="submit">
              <span>Subscribe</span>
              <Arrow />
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * HEADER + FOOTER
 * ------------------------------------------------------------------ */
function Header({ route }) {
  const [open, setOpen] = useState(false);
  const nav = useMemo(() => buildNav(), []);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  return (
    <header className="site-header page-shell">
      <a className="brand" href="#/" aria-label="Social Following Studios home">
        <Logo />
      </a>
      <nav className="nav-links" aria-label="Primary navigation">
        {nav.map((item) => (
          <a key={item.href} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="btn btn-primary nav-cta" href="#assessment">
        <span>Book Your Assessment</span>
        <Arrow />
      </a>
      <button
        className="menu-button"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label="Toggle navigation"
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation">
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a href="#assessment">Book Your Assessment</a>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer page-shell">
      <div className="footer-lede">
        <p className="footer-headline">Own your audience.</p>
        <p className="footer-name">Social Following Studios</p>
        <p className="footer-imprint">An imprint of Marchitects.</p>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Social Following Studios</span>
        <span className="footer-legal">
          <a href="#/terms">Terms</a>
          <a href="#/privacy">Privacy</a>
          <a href="#/contact">Contact</a>
        </span>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ *
 * PAGES
 * ------------------------------------------------------------------ */
function Home() {
  return (
    <>
      <Hero />
      <OperationalProblem />
      <SystemArchitecture />
      <WhoWeServe />
      <Proof />
      <Assessment />
      <Newsletter />
    </>
  );
}

function AudienceBuilder() {
  const steps = [
    ["01", "Ingest", "We pull the data your program already owns: list age, engagement history, and delivery performance."],
    ["02", "Resolve", "Records are deduplicated, corrected, and unified into one clean contact layer with suppression logic in place."],
    ["03", "Segment", "Contacts are grouped by real buying signal: recency, product interest, channel behavior, and compliance state."],
    ["04", "Activate", "Each segment gets a sequence. Reactivation for dormant contacts, retention for engaged ones, compliance for the rest."],
  ];

  return (
    <>
      <section className="hero page-shell subpage-hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Audience Builder</p>
          <h1 className="hero-title">The reachable audience under every send.</h1>
          <p className="hero-support">
            Audience Builder is the function that turns a raw contact list into a segmented, deliverable audience. It is
            the foundation the rest of the program runs on.
          </p>
          <Button href="#assessment">Book Your Assessment</Button>
        </div>
      </section>

      <section className="page-shell movement">
        <div className="process-grid" data-reveal>
          {steps.map(([number, title, copy]) => (
            <article className="serve-card" key={number}>
              <span className="serve-number">{number}</span>
              <h3>{title}</h3>
              <div className="small-rule" />
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <CtaBand title="Your audience, built and maintained." />
    </>
  );
}

function AvatarStudio() {
  return (
    <>
      <section className="hero page-shell subpage-hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Avatar Studio</p>
          <h1 className="hero-title">Your twin, everywhere.</h1>
          <p className="hero-support">
            We build a high-fidelity digital twin of your likeness and voice, then turn your knowledge into finished
            video content built for continuous distribution.
          </p>
          <Button href="#assessment">Build My Digital Twin</Button>
        </div>
      </section>
      <CtaBand title="Convert your expertise into continuous video production." cta="Build My Digital Twin" />
    </>
  );
}

function YoChat() {
  return (
    <>
      <section className="hero page-shell subpage-hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">YoChat</p>
          <h1 className="hero-title">Always-on conversation.</h1>
          <p className="hero-support">
            YoChat runs the conversational layer of the program across Messenger and Instagram, with a protected control
            room, CRM, transcripts, and human handoff.
          </p>
          <Button href="#assessment">Book Your Assessment</Button>
        </div>
      </section>
      <CtaBand title="Put a staffed conversation on every channel." />
    </>
  );
}

function CtaBand({ title, copy, cta = "Book Your Assessment" }) {
  return (
    <section className="page-shell">
      <div className="cta-band" data-reveal>
        <div>
          <h2>{title}</h2>
          {copy && <p>{copy}</p>}
        </div>
        <Button>{cta}</Button>
      </div>
    </section>
  );
}

function Contact() {
  return (
    <>
      <section className="hero page-shell subpage-hero contact-hero">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Start the conversation</p>
          <h1 className="hero-title">Book your assessment.</h1>
          <p className="hero-support">
            Every engagement begins with a database assessment. The assessment produces the numbers. The numbers drive
            the decision.
          </p>
        </div>
        <BookingForm />
      </section>

      <section className="page-shell movement">
        <div className="serve-grid two" data-reveal>
          <article className="serve-card">
            <h3>Email</h3>
            <div className="small-rule" />
            <p>hello@socialfollowingstudios.com</p>
          </article>
          <article className="serve-card">
            <h3>Note</h3>
            <div className="small-rule" />
            <p>We do not accept unsolicited vendor or platform pitches through this form.</p>
          </article>
        </div>
      </section>

      <Proof withHeader />
    </>
  );
}

function PolicyPage({ title }) {
  return (
    <section className="page-shell policy-page">
      <p className="eyebrow">Social Following Studios</p>
      <h1 className="hero-title">{title}</h1>
      <p className="hero-support">
        This page is being updated. Contact hello@socialfollowingstudios.com for the current policy details.
      </p>
      <Button href="#/contact">Contact Us</Button>
    </section>
  );
}

function ThankYou() {
  return (
    <section className="page-shell policy-page">
      <p className="eyebrow">Request received</p>
      <h1 className="hero-title">Thanks. We have your request.</h1>
      <p className="hero-support">Our team will review and follow up shortly.</p>
      <a className="btn btn-primary" href="#/">
        <span>Back home</span>
        <Arrow />
      </a>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * APP
 * ------------------------------------------------------------------ */
function App() {
  const route = useHashRoute();
  useReveal(route);

  useEffect(() => {
    const target = route.replace(/^\//, "");
    if (!SECTION_IDS.includes(target)) {
      if (route === "/") window.scrollTo({ top: 0 });
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  const page = useMemo(() => {
    if (isLive("audienceBuilder") && route === PRODUCTS.audienceBuilder.route) return <AudienceBuilder />;
    if (isLive("avatarStudio") && route === PRODUCTS.avatarStudio.route) return <AvatarStudio />;
    if (isLive("yochat") && route === PRODUCTS.yochat.route) return <YoChat />;

    switch (route) {
      case "/contact":
        return <Contact />;
      case "/terms":
        return <PolicyPage title="Terms" />;
      case "/privacy":
        return <PolicyPage title="Privacy" />;
      case "/thank-you":
        return <ThankYou />;
      default:
        return <Home />;
    }
  }, [route]);

  return (
    <>
      <Header route={route} />
      <main>{page}</main>
      <Footer />
    </>
  );
}

export default App;
