import React, { useEffect, useMemo, useState } from "react";

const BRAND_LOGO = "/brand/sfs-logo.webp";
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
    status: "HIDDEN",
    nav: false,
    label: "Avatar Studio",
    route: "/avatar-studio",
    blurb: "A digital twin of your likeness and voice, turned into finished video.",
  },
  yochat: {
    status: "HIDDEN",
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

const BASE_NAV = [{ label: "What We Do", href: "#/what-we-do" }];

function buildNav() {
  const products = Object.entries(PRODUCTS)
    .filter(([key]) => showInNav(key))
    .map(([, product]) => ({ label: product.label, href: `#${product.route}` }));
  return [
    ...BASE_NAV,
    ...products,
    { label: "Proof", href: "#/case-studies" },
    { label: "Assessment", href: "#/assessment" },
    { label: "Contact", href: "#/contact" },
  ];
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
  "/what-we-do": {
    title: "What We Do | Social Following Studios",
    description:
      "Database Reactivation, Lifecycle Activation, Conversational Response, and Video Presence: the four capabilities that run under one operator.",
  },
  "/case-studies": {
    title: "Proof | Social Following Studios",
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
    const canonicalPath = key === "/" ? "/" : `/${key.replace(/^\//, "")}/`;

    document.title = meta.title;

    setHeadTag('meta[name="description"]', () => {
      const el = document.createElement("meta");
      el.setAttribute("name", "description");
      return el;
    }).setAttribute("content", meta.description);

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
const CAMPAIGN_CONTENT = {};

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
function Hero() {
  return (
    <section className="hero">
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
            We connect the relationship from first interaction through conversion, retention, and reactivation.
          </p>
          <p className="hero-category">Audience Infrastructure · Since 2017</p>
          <Button>Book Your Assessment</Button>
        </div>
      </div>
    </section>
  );
}

function ProofBar() {
  return (
    <section className="proof-bar" data-reveal>
      <p>20M+ daily communications supported</p>
      <p>400+ engagements</p>
      <p>Systems built since 2017</p>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * SECTIONS
 * ------------------------------------------------------------------ */
const RELATION_DOTS = [
  [30, 30, -60, -40], [80, 30, 40, -70], [130, 30, -30, 60], [180, 30, 70, 20],
  [30, 80, 50, 50], [80, 80, -70, 10], [130, 80, 20, -50], [180, 80, -40, -20],
  [30, 130, -20, -60], [80, 130, 60, 30], [130, 130, -50, -30], [180, 130, 30, 60],
];

function RelationVisual() {
  return (
    <div className="relation-visual" data-reveal aria-hidden="true">
      <svg viewBox="0 0 210 160">
        {RELATION_DOTS.map(([x, y, dx, dy], i) => (
          <circle key={i} cx={x} cy={y} r="5" style={{ "--dx": `${dx}px`, "--dy": `${dy}px`, "--i": i }} />
        ))}
      </svg>
    </div>
  );
}

function Problem() {
  return (
    <section className="section">
      <SectionHead label="Problem" title="Your audience should be an asset, not a list." />
      <div className="owned-relationship-grid">
        <div className="owned-relationship" data-reveal>
          <p>
            Interest enters a database your business controls. Signals become useful audience segments. Every response
            sharpens the next move.
          </p>
          <p>
            The system turns audience movement into direct relationships that support conversion, retention, and
            reactivation.
          </p>
        </div>
        <RelationVisual />
      </div>
    </section>
  );
}

const MECHANISM_STEPS = [
  ["Capture", "Comments, messages, and keyword responses become direct conversations, routed into the same system."],
  ["Identify", "Audience Builder organizes intent, behavior, and location signals into usable segments."],
  ["Activate", "Full-service lifecycle email moves each segment through timely follow-up and reactivation."],
  ["Stay Present", "The brand keeps a consistent face and voice on camera, on a sustainable filming rhythm."],
];

const AUDIENCE_BUILDER_STEPS = [
  ["Ingest", "We pull the data your program already owns."],
  ["Resolve", "Records are deduplicated, corrected, and unified into one clean contact layer."],
  ["Segment", "Contacts are grouped by buying signal, channel behavior, and compliance state."],
  ["Activate", "Each segment gets a sequence."],
];

function FlowDiagram({ steps }) {
  return (
    <div className="mechanism-flow" data-reveal>
      {steps.map(([name, line], i) => (
        <React.Fragment key={name}>
          <div className="mechanism-step">
            <span className="mechanism-num">{String(i + 1).padStart(2, "0")}</span>
            <h3>{name}</h3>
            <p>{line}</p>
          </div>
          {i < steps.length - 1 && (
            <span className="mechanism-arrow" aria-hidden="true">
              →
            </span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function OperatingSystem() {
  return (
    <section className="section">
      <SectionHead label="The operating system" title="Capture. Identify. Activate. Stay present." />
      <FlowDiagram steps={MECHANISM_STEPS} />
      <a className="text-link" href="#/what-we-do">
        What we do in full <Arrow />
      </a>
    </section>
  );
}

function AudienceBuilderFeature() {
  return (
    <section className="section">
      <SectionHead
        label="Audience Builder"
        title="The reachable audience under every send."
        lede="Audience Builder turns a raw contact list into a segmented, deliverable audience."
      />
      <FlowDiagram steps={AUDIENCE_BUILDER_STEPS} />
      <a className="text-link" href="#/audience-builder">
        Audience Builder in full <Arrow />
      </a>
    </section>
  );
}

const BUYING_SITUATIONS = [
  [
    "Founders",
    "The database has outgrown what one person can run by hand, and dormant contacts sit unworked.",
  ],
  [
    "Hospitality",
    "Past guests and clients have gone quiet while acquisition spend keeps paying for people already reached once.",
  ],
  [
    "Compliance-heavy organizations",
    "Outreach has to be documented and authenticated, not improvised channel by channel.",
  ],
];

function BuyingSituations() {
  return (
    <section className="section">
      <SectionHead label="When we're needed" title="Buying situations." />
      <IndexList items={BUYING_SITUATIONS} />
    </section>
  );
}

function AssessmentDeliverables() {
  return (
    <section className="section">
      <SectionHead label="The assessment" title="What the assessment produces." />
      <IndexList items={ASSESSMENT_OUTPUTS} />
      <a className="text-link" href="#/assessment">
        Book your assessment <Arrow />
      </a>
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
    stat: ["11", "Signed listings in 45 days"],
    quote: "The buyers and sellers we thought were gone came back through the same list we had ignored for years.",
  },
];

function StatRow({ stats }) {
  return (
    <div className="stat-row" data-reveal>
      {stats.map(([value, label]) => (
        <div className="stat-tile" key={label}>
          <p className="stat-value">{value}</p>
          <p className="stat-label">{label}</p>
        </div>
      ))}
    </div>
  );
}

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
      <StatRow
        stats={[
          ["95%", "Inbox placement held"],
          ["Multi-Million $", "Case resolution"],
        ]}
      />
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
          {c.stat && <StatRow stats={[c.stat]} />}
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

function CaseTeaser() {
  return (
    <article className="case-teaser" data-reveal>
      <p className="card-label">Legal / Mass tort</p>
      <h3>A dormant plaintiff database reached a multi-million dollar resolution.</h3>
      <StatRow
        stats={[
          ["95%", "Inbox placement held"],
          ["Multi-Million $", "Case resolution"],
        ]}
      />
      <a className="text-link" href="#/case-studies">
        Read the case study <Arrow />
      </a>
    </article>
  );
}

function CaseStudiesSummary() {
  return (
    <section className="section">
      <SectionHead label="Proof" title="Verified case studies from the actual work." />
      <CaseTeaser />
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
      <p className="footer-proof">20M+ daily communications supported · 400+ engagements · Building systems since 2017.</p>
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
      <ProofBar />
      <div className="page-shell">
        <Problem />
        <OperatingSystem />
        <AudienceBuilderFeature />
        <CaseStudiesSummary />
        <BuyingSituations />
        <AssessmentDeliverables />
        <CtaBand title="Book your assessment." />
      </div>
    </>
  );
}

const WHAT_WE_DO = [
  [
    "Database Reactivation",
    "We identify and reactivate the contacts already inside your database: dormant clients, past guests, and cold leads who already know you.",
    null,
  ],
  [
    "Lifecycle Activation",
    "Full-service lifecycle email moves each segment through timely follow-up and reactivation.",
    null,
  ],
  [
    "Conversational Response",
    "Comments, messages, and keyword responses across Messenger and Instagram become direct conversations, with a protected control room, CRM, transcripts, and human handoff.",
    null,
  ],
  [
    "Video Presence",
    "A high-fidelity digital twin of your likeness and voice turns your knowledge into finished video content built for continuous distribution.",
    null,
  ],
];

function WhatWeDoPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="What we do"
        title="Four capabilities. One operator."
        lede="Capture, identify, activate, and stay present, run as a single accountable program."
      />
      <section className="section">
        <FlowDiagram steps={MECHANISM_STEPS} />
      </section>
      <section className="section">
        <SectionHead
          label="The capabilities"
          title="Database Reactivation, Lifecycle Activation, Conversational Response, Video Presence."
        />
        <div className="capability-list" data-reveal>
          {WHAT_WE_DO.map(([name, line, href]) => (
            <article className="capability" key={name}>
              <h3>{name}</h3>
              <p>{line}</p>
              {href && (
                <a className="text-link" href={href}>
                  Learn more <Arrow />
                </a>
              )}
            </article>
          ))}
        </div>
      </section>
      <CtaBand title="Your program, under management." />
    </div>
  );
}

function CaseStudiesPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Proof"
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
        <FlowDiagram steps={AUDIENCE_BUILDER_STEPS} />
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
    case "/what-we-do":
    case "/system":
      return { node: <WhatWeDoPage />, layout: "full" };
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
