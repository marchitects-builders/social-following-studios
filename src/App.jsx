import React, { useEffect, useMemo, useRef, useState } from "react";

const BRAND_LOGO = "/brand/sfs-logo.png";
const LOGOS_APPROVED = "/logos-approved.png";
const PUBLIC_ORIGIN = "https://www.socialfollowing.shop";

/* ------------------------------------------------------------------ *
 * VISIBILITY CONTROL
 *   status "LIVE"     public, full chrome, name renders, menu when nav
 *   status "UNLISTED" indexable, off the menu, runs as an isolated ad
 *                     funnel (no nav header, one action)
 *   status "HIDDEN"   route dead, name never renders
 *   nav true          menu item, only when LIVE
 * ------------------------------------------------------------------ */
const PRODUCTS = {
  audienceBuilder: {
    status: "LIVE",
    nav: true,
    label: "Audience Builder",
    route: "/audience-builder",
    blurb: "Turns a raw contact list into a segmented, deliverable audience.",
  },
  avatarStudio: {
    status: "UNLISTED",
    nav: false,
    label: "Avatar Studio",
    route: "/avatar-studio",
    blurb: "A digital twin of your likeness and voice, turned into finished video.",
  },
  yochat: {
    status: "UNLISTED",
    nav: false,
    label: "YoChat",
    route: "/yochat",
    blurb: "An always-on conversational layer across Messenger and Instagram.",
  },
};

const statusOf = (key) => PRODUCTS[key]?.status;
const isLive = (key) => statusOf(key) === "LIVE";
const isUnlisted = (key) => statusOf(key) === "UNLISTED";
const isReachable = (key) => isLive(key) || isUnlisted(key);
const showInNav = (key) => Boolean(PRODUCTS[key]?.nav) && isLive(key);

const productByRoute = (route) => Object.entries(PRODUCTS).find(([, product]) => product.route === route);
const reachableProducts = () => Object.keys(PRODUCTS).filter(isReachable).map((key) => PRODUCTS[key]);
const crossLinkProducts = () =>
  Object.keys(PRODUCTS)
    .filter((key) => isReachable(key) && !showInNav(key))
    .map((key) => PRODUCTS[key]);

const BASE_NAV = [
  { label: "The System", href: "#/system" },
  { label: "Case Studies", href: "#/case-studies" },
  { label: "Assessment", href: "#/assessment" },
];

function buildNav() {
  const products = Object.entries(PRODUCTS)
    .filter(([key]) => showInNav(key))
    .map(([, product]) => ({ label: product.label, href: `#${product.route}` }));
  return [...BASE_NAV.slice(0, 2), ...products, ...BASE_NAV.slice(2), { label: "Contact", href: "#/contact" }];
}

/* ------------------------------------------------------------------ *
 * PER-ROUTE HEAD META
 * ------------------------------------------------------------------ */
const PAGE_META = {
  "/": {
    title: "Social Following Studios | Own Your Audience",
    description:
      "Social Following Studios is a full-service ESP and a strategic growth and communications agency. We build and run the audience infrastructure that turns existing customer data and new interest into direct relationships and measurable growth.",
  },
  "/system": {
    title: "The System | Social Following Studios",
    description:
      "Audience Capture, Audience Builder, Full-Service ESP, and 24/7 Communications. One operator runs all four.",
  },
  "/case-studies": {
    title: "Case Studies | Social Following Studios",
    description: "Verified case studies from the actual work.",
  },
  "/audience-builder": {
    title: "Audience Builder | Social Following Studios",
    description: "Audience Builder turns a raw contact list into a segmented, deliverable audience.",
  },
  "/assessment": {
    title: "Book Your Assessment | Social Following Studios",
    description:
      "Database health, reachable audience, deliverability, dormant revenue estimate, and deployment path.",
  },
  "/avatar-studio": {
    title: "Avatar Studio | Social Following Studios",
    description:
      "Avatar Studio builds a high-fidelity digital twin of your likeness and voice, then turns your knowledge into finished video content for continuous distribution.",
  },
  "/yochat": {
    title: "YoChat | Social Following Studios",
    description:
      "YoChat runs the conversational layer of your program across Messenger and Instagram, with a protected control room, CRM, transcripts, and human handoff.",
  },
  "/contact": {
    title: "Contact | Social Following Studios",
    description: "Every engagement begins with a database assessment.",
  },
  "/thank-you": {
    title: "Request received | Social Following Studios",
    description: "Thanks. We have your request.",
  },
};

function setHeadTag(selector, create) {
  let node = document.head.querySelector(selector);
  if (!node) {
    node = create();
    document.head.appendChild(node);
  }
  return node;
}

function usePageMeta(route) {
  useEffect(() => {
    const productRoute = productByRoute(route);
    const key = productRoute && !isReachable(productRoute[0]) ? "/" : route;
    const meta = PAGE_META[key] || PAGE_META["/"];
    const description = key === "/system" ? systemMetaDescription() : meta.description;
    const canonicalPath = key === "/" ? "/" : `/${key.replace(/^\//, "")}/`;

    document.title = meta.title;

    setHeadTag('meta[name="description"]', () => {
      const el = document.createElement("meta");
      el.setAttribute("name", "description");
      return el;
    }).setAttribute("content", description);

    setHeadTag('link[rel="canonical"]', () => {
      const el = document.createElement("link");
      el.setAttribute("rel", "canonical");
      return el;
    }).setAttribute("href", `${PUBLIC_ORIGIN}${canonicalPath}`);
  }, [route]);
}

/* ------------------------------------------------------------------ *
 * AD FUNNEL CONTENT (unlisted campaign landing pages)
 * ------------------------------------------------------------------ */
const CAMPAIGN_CONTENT = {
  "/avatar-studio": {
    eyebrow: "Avatar Studio",
    title: "Your twin, everywhere.",
    support:
      "We build a high-fidelity digital twin of your likeness and voice, then turn your knowledge into finished video content built for continuous distribution.",
    cta: "Build My Digital Twin",
    points: [
      "One session records your likeness, voice, and delivery.",
      "Your knowledge becomes finished video for every channel.",
      "Every asset reads as you, at scale.",
    ],
    formLabel: "Start the build",
    formTitle: "Build my digital twin.",
  },
  "/yochat": {
    eyebrow: "YoChat",
    title: "Always-on conversation.",
    support:
      "YoChat runs the conversational layer of your program across Messenger and Instagram, with a protected control room, CRM, transcripts, and human handoff.",
    cta: "Book Your Assessment",
    points: [
      "Every message answered, across Messenger and Instagram.",
      "CRM, transcripts, and human handoff in one protected view.",
      "Connected to the same audience the rest of the system runs on.",
    ],
    formLabel: "Start the conversation",
    formTitle: "Put a staffed conversation on every channel.",
  },
};

/* ------------------------------------------------------------------ *
 * HOOKS
 * ------------------------------------------------------------------ */
function useHashRoute() {
  const getRoute = () => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) return hash.startsWith("/") ? hash : `/${hash}`;
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  };
  const [route, setRoute] = useState("/");
  useEffect(() => {
    const sync = () => setRoute(getRoute());
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return route;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function useReveal(route) {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!("IntersectionObserver" in window) || reducedMotion()) {
      nodes.forEach((n) => n.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.1 }
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [route]);
}

function useHeroMotion(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        el.style.setProperty("--sy", String(Math.min(window.scrollY, 600)))
      );
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
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

function Button({ children = "Book Your Assessment", className = "", href = "#/assessment" }) {
  return (
    <a className={`btn ${className}`} href={href}>
      <span>{children}</span>
      <Arrow />
    </a>
  );
}

function Logo({ className = "" }) {
  return <img className={`logo ${className}`} src={BRAND_LOGO} alt="Social Following Studios" />;
}

function PageHead({ eyebrow, title, lede }) {
  return (
    <header className="page-head" data-reveal>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

function SectionHead({ label, title, lede }) {
  return (
    <header className="section-head" data-reveal>
      <p className="section-label">{label}</p>
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </header>
  );
}

/* A name, a hairline, one line. Replaces the card grids. */
function IndexList({ items }) {
  return (
    <ol className="index-list" data-reveal>
      {items.map((item, i) => {
        const [name, line] = Array.isArray(item) ? item : [item, null];
        return (
          <li key={name}>
            <span className="index-num">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <h3>{name}</h3>
              {line && <p>{line}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------ *
 * HERO
 * ------------------------------------------------------------------ */
function Chart() {
  return (
    <svg viewBox="0 0 420 190" role="img" aria-label="Reachable audience recovering month over month">
      <defs>
        <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0a7d59" stopOpacity=".18" />
          <stop offset="1" stopColor="#0a7d59" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#e6e0d3" strokeWidth="1">
        <path d="M0 45h420" />
        <path d="M0 95h420" />
        <path d="M0 145h420" />
      </g>
      <path d="M0 160 52 148 104 152 156 124 208 128 260 98 312 78 364 44 420 30 420 185 0 185Z" fill="url(#chartFill)" />
      <path d="M0 160 52 148 104 152 156 124 208 128 260 98 312 78 364 44 420 30" fill="none" stroke="#0a7d59" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="420" cy="30" r="5" fill="#0a7d59" stroke="#eef4f0" strokeWidth="4" />
    </svg>
  );
}

function AssessmentPanel() {
  return (
    <aside className="panel" data-reveal aria-label="Assessment snapshot">
      <div className="panel-head">
        <p className="card-label">Assessment snapshot</p>
        <span className="pill">
          <span className="dot" />
          Ready to deploy
        </span>
      </div>
      <div className="panel-figure">
        <div>
          <p className="panel-figure-label">Dormant revenue estimate</p>
          <p className="panel-figure-value">$3.8M</p>
        </div>
        <Chart />
      </div>
      <dl className="panel-metrics">
        <div>
          <dt>Reachable audience</dt>
          <dd>246K</dd>
        </div>
        <div>
          <dt>Database health</dt>
          <dd>78%</dd>
        </div>
        <div>
          <dt>Inbox placement</dt>
          <dd>95%</dd>
        </div>
      </dl>
    </aside>
  );
}

function Hero() {
  const ref = useRef(null);
  useHeroMotion(ref);
  return (
    <section className="hero" ref={ref}>
      <div className="hero-grid" aria-hidden="true">
        <div className="hero-grid-plane" />
      </div>
      <div className="hero-inner">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Social Following Studios</p>
          <h1 className="hero-title" aria-label="Own your audience.">
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
          <Button>Book Your Assessment</Button>
        </div>
        <AssessmentPanel />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * SECTIONS
 * ------------------------------------------------------------------ */
function OperationalProblem() {
  const machine = ["Program ownership", "Deployment", "Deliverability", "Reputation", "Targeting", "Execution"];
  return (
    <section className="section">
      <SectionHead label="The operational problem" title="Your database is real, somebody has to run the machine." />
      <ul className="tag-row" data-reveal>
        {machine.map((part) => (
          <li key={part}>{part}</li>
        ))}
      </ul>
    </section>
  );
}

const systemFunctions = () => [
  "Audience Capture",
  isReachable("audienceBuilder") ? PRODUCTS.audienceBuilder.label : "Audience Development",
  "Full-Service ESP",
  "24/7 Communications",
];

const systemMetaDescription = () =>
  `Audience Capture, ${isReachable("audienceBuilder") ? PRODUCTS.audienceBuilder.label : "Audience Development"}, Full-Service ESP, and 24/7 Communications. One operator runs all four.`;

function SystemSummary() {
  return (
    <section className="section">
      <SectionHead label="The system" title="Four functions. One operator." />
      <IndexList items={systemFunctions()} />
      <a className="text-link" href="#/system">
        The system in full <Arrow />
      </a>
    </section>
  );
}

const AUDIENCES = ["Founders", "Hospitality", "Compliance-Heavy Organizations"];

function WhoWeServe() {
  return (
    <section className="section">
      <SectionHead label="Who we serve" title="Who we serve." />
      <IndexList items={AUDIENCES} />
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * CASE STUDIES
 * ------------------------------------------------------------------ */
const CASE_STUDIES = [
  {
    type: "Government",
    title: "Federal housing agency",
    narrative:
      "A federal housing agency managing constituent communication across active waitlist programs engaged Social Following Studios to run the full outreach program. Coordinated communication reached applicants across every live channel inside the existing infrastructure. Constituent engagement returned to active status at program scale.",
  },
  {
    type: "Manufacturing",
    title: "Manufacturing organization",
    narrative:
      "A manufacturing organization had a vendor and procurement database that went quiet after a program transition. Relationships representing active buying history had stopped responding entirely. A reactivation sequence ran across the existing database. Procurement contacts returned to active engagement within the first program cycle, on the existing budget.",
    quote: "We recovered relationships we assumed were gone permanently.",
  },
  {
    type: "Real Estate",
    title: "Regional broker",
    narrative:
      "A regional broker had a past-client database of buyers and sellers who had gone quiet while the business kept paying to acquire new leads. A unified reactivation sequence ran across email, conversational, and voice channels at once. The existing database and existing budget produced 11 signed listing agreements within 45 days.",
    quote: "The buyers and sellers we thought were gone came back through the same list we had ignored for years.",
  },
];

function FeaturedCase() {
  return (
    <article className="featured-case" data-reveal>
      <p className="card-label">Legal / Mass tort</p>
      <h3>A dormant plaintiff database reached a multi-million dollar resolution.</h3>
      <p>
        The plaintiff database had gone dormant while competing firms reached the same claimant pool. Inbox placement
        decides whether a claimant sees the message. We held 95% inbox placement, sequenced the outreach, and built the
        program around claimant trust. The matter resolved for millions.
      </p>
      <blockquote>
        Our messaging reached our claimants. That was the difference.
        <cite>Michael T., Esquire. Managing Attorney, mass tort firm.</cite>
      </blockquote>
    </article>
  );
}

function CaseStudyList() {
  return (
    <div className="case-list" data-reveal>
      {CASE_STUDIES.map((c) => (
        <article className="case" key={c.title}>
          <p className="card-label">{c.type}</p>
          <h3>{c.title}</h3>
          <p>{c.narrative}</p>
          {c.quote && <p className="case-quote">{c.quote}</p>}
        </article>
      ))}
    </div>
  );
}

function LogoBar() {
  return (
    <div className="logo-bar" data-reveal>
      <p className="section-label">Trusted by organizations that lead</p>
      <img src={LOGOS_APPROVED} alt="Client organizations" />
    </div>
  );
}

function CaseStudiesSummary() {
  return (
    <section className="section">
      <SectionHead label="Case studies" title="Verified case studies from the actual work." />
      <FeaturedCase />
      <a className="text-link" href="#/case-studies">
        All case studies <Arrow />
      </a>
    </section>
  );
}

function Newsletter() {
  return (
    <section className="section">
      <SectionHead label="Newsletter" title="Audience strategy and distribution." />
      <form className="newsletter" data-reveal onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="nl-email">Email address</label>
        <div className="newsletter-row">
          <input id="nl-email" type="email" placeholder="you@company.com" aria-label="Email address" />
          <button type="submit">
            <span>Subscribe</span>
            <Arrow />
          </button>
        </div>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * FORM
 * ------------------------------------------------------------------ */
function BookingForm({ source = "Website Assessment" }) {
  return (
    <form className="form" action="https://crm.zoho.com/crm/WebToLeadForm" method="POST" data-reveal>
      <input type="hidden" name="xnQsjsdp" value="b45ce04ddd76914bbfeade30ab0a6e86446ed07ddcd64b5425a1a4d9d5a467b8" readOnly />
      <input type="hidden" name="xmIwtLD" value="97ca543a3d1ea88492628d126d9ab329b04cea167679b0225170279c6fc6e4f3684dbc3fb82c598c93398f0f68dcd29b" readOnly />
      <input type="hidden" name="actionType" value="TGVhZHM=" readOnly />
      <input type="hidden" name="Lead Source" value={source} readOnly />
      <input type="hidden" name="Last Name" value="Assessment Request" readOnly />
      <input type="hidden" name="returnURL" value="https://www.socialfollowing.shop/#/thank-you" readOnly />
      <Field label="Organization name" name="Company" required />
      <Field label="Corporate email" name="Email" type="email" required />
      <Field label="Brief description of your program" name="Description" textarea required />
      <button className="btn" type="submit">
        <span>Request Your Assessment</span>
        <Arrow />
      </button>
    </form>
  );
}

function Field({ label, name, type = "text", textarea = false, required = false }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      {textarea ? (
        <textarea id={name} name={name} required={required} rows={3} />
      ) : (
        <input id={name} name={name} type={type} required={required} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * HEADER + FOOTER
 * ------------------------------------------------------------------ */
function BareHeader() {
  return (
    <header className="header bare">
      <a className="brand" href="/" aria-label="Social Following Studios home">
        <Logo />
      </a>
    </header>
  );
}

function Header({ route }) {
  const [open, setOpen] = useState(false);
  const nav = useMemo(() => buildNav(), []);
  useEffect(() => setOpen(false), [route]);

  return (
    <header className="header">
      <a className="brand" href="#/" aria-label="Social Following Studios home">
        <Logo />
      </a>
      <nav className="nav" aria-label="Primary">
        {nav.map((item) => (
          <a key={item.href} href={item.href} className={route === item.href.replace(/^#/, "") ? "current" : ""}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="btn nav-cta" href="#/assessment">
        <span>Book Your Assessment</span>
      </a>
      <button
        className="menu-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label="Toggle navigation"
        onClick={() => setOpen((v) => !v)}
      >
        <span />
        <span />
      </button>
      {open && (
        <nav id="mobile-nav" className="mobile-nav" aria-label="Mobile">
          {nav.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a href="#/assessment">Book Your Assessment</a>
        </nav>
      )}
    </header>
  );
}

function Footer({ variant = "full" }) {
  return (
    <footer className={`footer ${variant === "minimal" ? "minimal" : ""}`}>
      <p className="footer-headline">Own your audience.</p>
      <p className="footer-name">Social Following Studios</p>
      <p className="footer-imprint">An imprint of Marchitects.</p>
      <div className="footer-bottom">
        <span>© 2026 Social Following Studios</span>
        <span className="footer-legal">
          <a href="/#/terms">Terms</a>
          <a href="/#/privacy">Privacy</a>
          <a href="/#/contact">Contact</a>
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
      <div className="page-shell">
        <OperationalProblem />
        <SystemSummary />
        <WhoWeServe />
        <CaseStudiesSummary />
        <Newsletter />
      </div>
    </>
  );
}

const SYSTEM_STEPS = [
  ["Ingest", "We pull the data your program already owns. List age, engagement history, delivery performance."],
  ["Process", "We build sequences for each segment. Reactivation for dormant contacts, retention for engaged ones, compliance for the rest."],
  ["Evaluate", "We audit deliverability, authentication, and sending history. Every gap between current inbox placement and 95% is closed before deployment."],
  ["Engage", "We execute delivery with full authentication, reputation management, and real-time monitoring. Built for inbox placement, not volume."],
];

function SystemPage() {
  return (
    <div className="page-shell">
      <PageHead eyebrow="The system" title="Four functions. One operator." />
      <section className="section">
        <IndexList items={systemFunctions()} />
      </section>
      <section className="section">
        <SectionHead label="How it works" title="Ingest, process, evaluate, engage." />
        <IndexList items={SYSTEM_STEPS} />
      </section>
      <CtaBand title="Your program, under management." />
    </div>
  );
}

function CaseStudiesPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Case studies"
        title="Verified case studies from the actual work."
        lede="Documented customer acquisition, database reactivation, deliverability, hospitality, communications, and growth."
      />
      <section className="section">
        <FeaturedCase />
      </section>
      <section className="section">
        <CaseStudyList />
      </section>
      <LogoBar />
      <ProofCrossLinks />
      <CtaBand title="Your database has a case study in it." />
    </div>
  );
}

function ProofCrossLinks() {
  const links = crossLinkProducts();
  if (links.length === 0) return null;
  return (
    <p className="cross-links" data-reveal>
      Related capability:{" "}
      {links.map((product, i) => (
        <React.Fragment key={product.route}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a href={`#${product.route}`}>{product.label}</a>
        </React.Fragment>
      ))}
    </p>
  );
}

const ASSESSMENT_OUTPUTS = [
  "Database health",
  "Reachable audience",
  "Deliverability",
  "Dormant revenue estimate",
  "Deployment path",
];

function AssessmentPage() {
  return (
    <div className="page-shell">
      <PageHead eyebrow="The assessment" title="Book your assessment." />
      <section className="section assessment-grid">
        <IndexList items={ASSESSMENT_OUTPUTS} />
        <BookingForm source="Website Assessment" />
      </section>
    </div>
  );
}

function AudienceBuilder() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Audience Builder"
        title="The reachable audience under every send."
        lede="Audience Builder turns a raw contact list into a segmented, deliverable audience."
      />
      <section className="section">
        <IndexList
          items={[
            ["Ingest", "We pull the data your program already owns."],
            ["Resolve", "Records are deduplicated, corrected, and unified into one clean contact layer."],
            ["Segment", "Contacts are grouped by buying signal, channel behavior, and compliance state."],
            ["Activate", "Each segment gets a sequence."],
          ]}
        />
      </section>
      <CtaBand title="Your audience, built and maintained." />
    </div>
  );
}

/* Unlisted ad-funnel page: no nav header, one action. */
function ProductPage({ route }) {
  const content = CAMPAIGN_CONTENT[route];
  const product = productByRoute(route)?.[1];
  if (!content) return <Home />;
  const toLead = (e) => {
    e.preventDefault();
    document.getElementById("lead")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="page-shell">
      <PageHead eyebrow={content.eyebrow} title={content.title} lede={content.support} />
      <div data-reveal>
        <a className="btn" href="#lead" onClick={toLead}>
          <span>{content.cta}</span>
          <Arrow />
        </a>
      </div>
      <section className="section">
        <IndexList items={content.points} />
      </section>
      <section className="section" id="lead">
        <SectionHead label={content.formLabel} title={content.formTitle} />
        <BookingForm source={`Website Funnel - ${product?.label || route}`} />
      </section>
    </div>
  );
}

function CtaBand({ title, href = "#/assessment", cta = "Book Your Assessment" }) {
  return (
    <section className="cta-band" data-reveal>
      <h2>{title}</h2>
      <Button href={href}>{cta}</Button>
    </section>
  );
}

function Contact() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Contact"
        title="Book your assessment."
        lede="Every engagement begins with a database assessment."
      />
      <section className="section assessment-grid">
        <div data-reveal>
          <p className="contact-line">hello@socialfollowingstudios.com</p>
          <p className="contact-note">We do not accept unsolicited vendor or platform pitches through this form.</p>
        </div>
        <BookingForm source="Website Contact" />
      </section>
    </div>
  );
}

function PolicyPage({ title }) {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Social Following Studios"
        title={title}
        lede="This page is being updated. Contact hello@socialfollowingstudios.com for the current policy details."
      />
      <Button href="#/contact">Contact</Button>
    </div>
  );
}

function ThankYou() {
  const addons = crossLinkProducts();
  return (
    <div className="page-shell">
      <PageHead eyebrow="Request received" title="Thanks. We have your request." lede="Our team will follow up shortly." />
      <Button href="#/">Back home</Button>
      {addons.length > 0 && (
        <section className="section">
          <SectionHead label="Add-on activations" title="Once your program is running, these activate inside it." />
          <IndexList items={addons.map((p) => [p.label, p.blurb])} />
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * APP
 * ------------------------------------------------------------------ */
function resolvePage(route) {
  const productRoute = productByRoute(route);
  if (productRoute) {
    const [key] = productRoute;
    if (isUnlisted(key)) return { node: <ProductPage route={route} />, layout: "bare" };
    if (isLive(key)) {
      if (key === "audienceBuilder") return { node: <AudienceBuilder />, layout: "full" };
      return { node: <ProductPage route={route} />, layout: "full" };
    }
    return { node: <Home />, layout: "full" };
  }
  switch (route) {
    case "/system":
      return { node: <SystemPage />, layout: "full" };
    case "/case-studies":
      return { node: <CaseStudiesPage />, layout: "full" };
    case "/assessment":
      return { node: <AssessmentPage />, layout: "full" };
    case "/contact":
      return { node: <Contact />, layout: "full" };
    case "/terms":
      return { node: <PolicyPage title="Terms" />, layout: "full" };
    case "/privacy":
      return { node: <PolicyPage title="Privacy" />, layout: "full" };
    case "/thank-you":
      return { node: <ThankYou />, layout: "full" };
    default:
      return { node: <Home />, layout: "full" };
  }
}

function App() {
  const route = useHashRoute();
  useReveal(route);
  usePageMeta(route);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const { node, layout } = useMemo(() => resolvePage(route), [route]);

  return (
    <>
      {layout === "bare" ? <BareHeader /> : <Header route={route} />}
      <main>{node}</main>
      <Footer variant={layout === "bare" ? "minimal" : "full"} />
    </>
  );
}

export default App;
