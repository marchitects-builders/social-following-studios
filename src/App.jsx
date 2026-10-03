"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useTransform } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const subscribeReducedMotion = (notify) => {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

function useReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const BRAND_LOGO = "/brand/sfs-logo.webp";
const PUBLIC_ORIGIN = "https://www.socialfollowing.shop";

const TRUSTED_LOGOS = [
  ["kaiser-permanente", "Kaiser Permanente"],
  ["stanford-university", "Stanford University"],
  ["nvidia", "NVIDIA"],
  ["pge", "PG&E"],
  ["commonspirit-health", "CommonSpirit Health"],
  ["drew-medical", "Drew Medical"],
  ["the-anthemist", "The Anthemist"],
  ["city-of-concord", "City of Concord"],
  ["dgrp-baysound", "DGRP Baysound"],
  ["rhythm-and-roux", "Rhythm & Roux"],
  ["parade-of-youth", "Parade of Youth"],
  ["chevron", "Chevron"],
];

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
    status: "LIVE",
    nav: false,
    // "Avatar Studio" is named only on its own page (per the naming rule in
    // DIRECTIVE.md). Every off-page mention — cross-links, thank-you addons —
    // reads from this label, so it stays "Video Presence" everywhere else.
    label: "Video Presence",
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

const BASE_NAV = [
  { label: "What We Do", href: "/what-we-do" },
  { label: "Full-Service ESP", href: "/full-service-esp" },
  { label: "Audience Builder", href: "/audience-builder" },
  { label: "Results", href: "/results" },
  { label: "Insights", href: "/insights" },
];

function buildNav() {
  return BASE_NAV;
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
  "/avatar-studio": {
    title: "Avatar Studio | Social Following Studios",
    description: "Turn one recording into an always-on presence that looks, sounds, and speaks like you.",
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
function useHashRoute(initialRoute = "/") {
  const getRoute = () => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash) return hash.startsWith("/") ? hash : `/${hash}`;
    const path = window.location.pathname.replace(/\/+$/, "");
    return path || "/";
  };
  const [route, setRoute] = useState(initialRoute);
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

function Button({ children = "Book Your Assessment", className = "", href = "/assessment" }) {
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
function AssessmentChart() {
  return (
    <svg viewBox="0 0 420 210" role="img" aria-label="Audience reactivation potential increasing from January to June">
      <defs>
        <linearGradient id="assessment-chart-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#008b61" stopOpacity=".2" />
          <stop offset="1" stopColor="#008b61" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g stroke="#e4ded6" strokeWidth="1">
        <path d="M0 38h420" />
        <path d="M0 78h420" />
        <path d="M0 118h420" />
        <path d="M0 158h420" />
      </g>
      <path d="M0 170 22 140 42 125 63 137 86 112 108 92 130 88 152 105 174 110 196 103 218 112 240 104 262 74 284 70 306 58 328 55 350 36 372 14 420 14 420 190 0 190Z" fill="url(#assessment-chart-fill)" />
      <motion.path
        d="M0 170c18-26 25-38 42-45s23 13 44-13 32-28 54-16 28 16 50 10 22 6 44-14 18-20 40-21 23-13 44-17 20-14 36-27 11-13 30-13h36"
        fill="none"
        stroke="#008b61"
        strokeWidth="3"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 1.5, ease: GRAPH_EASE }}
      />
      <circle cx="420" cy="14" r="6" fill="#008b61" stroke="#dfece5" strokeWidth="5" />
      <g fill="#6a706b" fontFamily="DM Sans, Arial, sans-serif" fontSize="11">
        <text x="0" y="207">JAN</text>
        <text x="78" y="207">FEB</text>
        <text x="155" y="207">MAR</text>
        <text x="235" y="207">APR</text>
        <text x="312" y="207">MAY</text>
        <text x="392" y="207">JUN</text>
      </g>
    </svg>
  );
}

function AssessmentMetric({ label, value, caption }) {
  return (
    <div className="hero-stat">
      <p className="metric-label">{label}</p>
      <p className="hero-stat-value">{value}</p>
      <p className="stat-caption">{caption}</p>
    </div>
  );
}

function HeroAssessmentSummary() {
  return (
    <article className="visual-panel hero-assessment-card" aria-label="Assessment summary">
      <div className="panel-head">
        <p className="card-label">Assessment Summary</p>
        <span className="status-pill"><span className="dot" />Ready to Reactivate</span>
      </div>
      <div className="summary-main">
        <div className="summary-score">
          <p className="small-serif">Audience Reactivation Potential</p>
          <p className="big-percent">83%</p>
          <p className="summary-copy">High potential to reach dormant connections across your channels.</p>
        </div>
        <div className="assessment-chart"><AssessmentChart /></div>
      </div>
      <div className="stats-row">
        <AssessmentMetric label="Reachable Contacts" value="246K" caption="+18% vs. previous six months" />
        <AssessmentMetric label="Dormant Revenue" value="$3.8M" caption="Estimated opportunity" />
        <AssessmentMetric label="Data Health" value="78%" caption="Above industry average" />
      </div>
      <div className="panel-foot"><span className="check-icon">✓</span>Infrastructure in place. Channels connected. Ready to deploy.</div>
    </article>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-inner">
        <div className="hero-copy" data-reveal>
          <p className="eyebrow">Full-service ESP</p>
          <h1 className="hero-title" aria-label="Own your audience.">
            Own your audience.
          </h1>
          <p className="hero-descriptor">
            Social Following Studios builds and runs unified conversion systems.
          </p>
          <p className="hero-support">We turn customer activity and existing data into direct relationships your business can keep using.</p>
          <Button>Book Your Assessment</Button>
        </div>
        <HeroAssessmentSummary />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * SECTIONS
 * ------------------------------------------------------------------ */
/* AUDIENCE GRAPH — third framer-motion scoped exception (see the
   Avatar Studio block below for the others). Draws Capture / Identify
   / Activate / Stay Present as a node graph instead of a card row. */
const GRAPH_EASE = [0.22, 1, 0.36, 1];

const GRAPH_NODES = [
  { id: "root", x: 48, y: 110, r: 9, label: "Database", pulse: true, delay: 0 },
  { id: "capture", x: 240, y: 30, r: 6, label: "Capture", delay: 1.2 },
  { id: "identify", x: 240, y: 77, r: 6, label: "Identify", delay: 1.28 },
  { id: "activate", x: 240, y: 143, r: 6, label: "Activate", delay: 1.36 },
  { id: "present", x: 240, y: 190, r: 6, label: "Stay present", delay: 1.44 },
  { id: "output", x: 424, y: 110, r: 9, label: "Owned audience", pulse: true, delay: 1.76 },
];

const graphNode = (id) => GRAPH_NODES.find((n) => n.id === id);

const GRAPH_EDGES = [
  { from: "root", to: "capture", delay: 0 },
  { from: "root", to: "identify", delay: 0.08 },
  { from: "root", to: "activate", delay: 0.16 },
  { from: "root", to: "present", delay: 0.24 },
  { from: "capture", to: "output", delay: 0.32 },
  { from: "identify", to: "output", delay: 0.4 },
  { from: "activate", to: "output", delay: 0.48 },
  { from: "present", to: "output", delay: 0.56 },
];

function GraphEdge({ edge }) {
  const from = graphNode(edge.from);
  const to = graphNode(edge.to);
  return (
    <motion.path
      d={`M ${from.x} ${from.y} L ${to.x} ${to.y}`}
      fill="none"
      stroke="var(--line-strong)"
      strokeWidth="1.5"
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 1.2, ease: GRAPH_EASE, delay: edge.delay }}
    />
  );
}

function GraphNode({ node }) {
  const reduce = useReducedMotion();
  return (
    <g>
      {node.pulse && !reduce && (
        <motion.circle
          cx={node.x}
          cy={node.y}
          fill="none"
          stroke="var(--green)"
          strokeWidth="1.5"
          initial={{ r: node.r, opacity: 0.5 }}
          animate={{ r: node.r * 1.9, opacity: 0 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeOut", delay: node.delay + 0.6 }}
        />
      )}
      <motion.circle
        cx={node.x}
        cy={node.y}
        fill={node.pulse ? "var(--green)" : "var(--paper)"}
        stroke="var(--ink)"
        strokeWidth="1.5"
        initial={reduce ? false : { r: 0, opacity: 0 }}
        whileInView={{ r: node.r, opacity: 1 }}
        whileHover={reduce ? undefined : { r: node.r * 1.15 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: reduce ? 0 : node.delay }}
      >
        <title>{node.label}</title>
      </motion.circle>
      <motion.text
        x={node.x}
        y={node.y + node.r + 16}
        textAnchor="middle"
        className="graph-label"
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.6, delay: reduce ? 0 : node.delay + 0.3 }}
      >
        {node.label}
      </motion.text>
    </g>
  );
}

function AudienceGraph() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [-16, 16]);
  return (
    <div className="audience-graph" role="img" aria-label="Audience Graph: a controlled database connects capture, identification, activation, and presence to an owned audience.">
      <motion.div ref={ref} className="audience-graph-canvas" style={reduce ? undefined : { y }}>
        <svg viewBox="0 0 472 220" aria-hidden="true">
          {GRAPH_EDGES.map((edge, i) => (
            <GraphEdge key={i} edge={edge} />
          ))}
          {GRAPH_NODES.map((node) => (
            <GraphNode key={node.id} node={node} />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}

function AudienceAsset() {
  return (
    <section className="section" id="audience-asset">
      <SectionHead label="Audience asset" title="Your audience is your business’s greatest asset." />
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
        <AudienceGraph />
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

const CONVERSION_FLOW = ["Discovery", "Capture", "Identify", "Activate", "Conversation", "Conversion", "Reactivation", "Retention"];
const HOMEPAGE_SYSTEM_FLOW = ["Discover", "Identify", "Build audience", "Reach", "Follow up", "Convert", "Reactivate"];

const OPERATIONS = [
  ["Lifecycle communication", "Ongoing sequences that keep direct relationships active after the first interaction."],
  ["Database reactivation", "Dormant records are organized into reachable segments and returned to useful conversation."],
  ["Deliverability", "Authentication, reputation, sending health, and inbox performance are actively governed."],
  ["Automation", "Behavior and timing move people through relevant next steps without losing operational control."],
  ["Channel orchestration", "Email, SMS and conversation work as one managed operating system."],
  ["Audience Builder", "The reachable audience under every send is cleaned, segmented, and maintained."],
  ["Conversion systems", "Signals, conversations, and follow-up align around the path from interest to retention."],
];

const INDUSTRIES = [
  ["Regulated programs", "Communication has to be documented, authenticated, and governed at every stage of deployment."],
  ["Healthcare and hospitality", "Existing relationships carry history and expectation; lifecycle communication has to preserve both."],
  ["Public sector", "Large constituent audiences need a clear operating model for reachability, relevance, and follow-through."],
];

const IMPLEMENTATION_STEPS = [
  ["Assessment", "Review the database, deliverability posture, reachable audience, and deployment opportunity."],
  ["Architecture", "Define the data layer, segments, channels, and lifecycle logic the program needs."],
  ["Deployment", "Build, authenticate, and launch the system with the correct controls in place."],
  ["Operation", "Run the program continuously: optimize, respond, protect deliverability, and improve conversion."],
];

function CategoryContrast() {
  return (
    <section className="section" id="full-service-esp">
      <SectionHead
        label="Full-service ESP"
        title="Software gives you access. We run the system."
        lede="Social Following Studios is the full-service ESP plus deployment layer. We build and run unified conversion systems."
      />
      <div className="contrast-grid" data-reveal>
        <article><p className="card-label">Software-only ESP</p><p>Access to a platform, with strategy, deployment, deliverability, and lifecycle operation left to the organization.</p></article>
        <article><p className="card-label">Social Following Studios</p><p>One accountable model for strategy, deployment, lifecycle, deliverability, conversion, optimization, and operation.</p></article>
      </div>
    </section>
  );
}

function ThreeLayerModel() {
  return (
    <section className="section">
      <SectionHead label="The model" title="Infrastructure. Deployment. Operation." lede="Three layers, owned and run as one unified conversion system." />
      <ol className="layer-model" data-reveal>
        {[["01", "Infrastructure", "Data, deliverability, automation, audience architecture, and technical controls."], ["02", "Deployment", "The campaigns, lifecycle programs, and channel coordination that put the system to work."], ["03", "Operation", "Continuous management, measurement, optimization, and accountable execution."]].map(([number, title, copy]) => (
          <li key={title}><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></li>
        ))}
      </ol>
    </section>
  );
}

function UnifiedConversionSystem() {
  return (
    <section className="section">
      <SectionHead label="Unified conversion system" title="One operating flow, from discovery to retention." />
      <ol className="conversion-flow" data-reveal>{CONVERSION_FLOW.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
    </section>
  );
}

function WhatWeOperate() {
  return (
    <section className="section" id="what-we-operate">
      <SectionHead label="What we operate" title="The managed work behind the system." lede="The operating model covers the work a platform alone does not do." />
      <IndexList items={OPERATIONS} />
    </section>
  );
}

function OperatingDiscipline() {
  return (
    <>
      <section className="section" id="lifecycle"><SectionHead label="Lifecycle" title="Operation continues after the campaign." lede="We run ongoing lifecycle communication so each audience segment receives relevant next steps, not one-time blasts." /></section>
      <section className="section" id="database-reactivation"><SectionHead label="Database + reactivation" title="Dormant relationships are active revenue channels." lede="Existing databases become useful when records are made reachable, organized by signal, and put into the right sequence." /></section>
      <section className="section" id="deliverability"><SectionHead label="Deliverability" title="Inbox performance is part of the operating system." lede="Infrastructure, reputation, authentication, and deployment are managed together so messages have a credible path to the inbox." /></section>
      <section className="section" id="channel-orchestration"><SectionHead label="Channel orchestration" title="Every channel works from the same system." lede="Email, SMS and conversation, automation, and supporting channels coordinate around the same audience and outcome." /></section>
    </>
  );
}

function Industries() {
  return <section className="section" id="industries"><SectionHead label="Where the model fits" title="For organizations where direct communication carries real responsibility." /><IndexList items={INDUSTRIES} /></section>;
}

function Implementation() {
  return <section className="section" id="implementation"><SectionHead label="Implementation" title="Assessment. Architecture. Deployment. Operation." lede="A working sequence that turns the assessment into a managed operating system." /><FlowDiagram steps={IMPLEMENTATION_STEPS} /></section>;
}

function InsightsAndAbout() {
  return (
    <>
      <section className="section" id="insights"><SectionHead label="Insights" title="Operational knowledge, drawn from the work." lede="The system is built around what it takes to maintain reachability, relevance, and direct relationships over time." /></section>
      <section className="section" id="about"><SectionHead label="About" title="Social Following Studios is the execution layer." lede="We build and run unified conversion systems for organizations that need direct audience relationships to perform." /></section>
    </>
  );
}

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
      <SectionHead
        label="The operating system"
        title="Capture. Identify. Activate. Stay present."
        lede="Four functions, run as one accountable program."
      />
      <a className="text-link" href="/what-we-do">
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
      <a className="text-link" href="/audience-builder">
        Audience Builder in full <Arrow />
      </a>
    </section>
  );
}

const BUYING_SITUATIONS = [
  [
    "The database outgrows the team",
    "Contacts, segments, and follow-up have become too consequential to run by hand.",
  ],
  [
    "Acquisition keeps replacing reactivation",
    "New spend rises while the people who already know the organization are left inactive.",
  ],
  [
    "The program needs an owner",
    "Strategy, deliverability, deployment, and optimization need to operate as one accountable system.",
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
      <SectionHead
        label="The assessment"
        title="What the assessment produces."
        lede="Database health, reachable audience, deliverability, dormant revenue estimate, and deployment path."
      />
      <a className="text-link" href="/assessment">
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
  const reduce = useReducedMotion();
  const track = reduce ? TRUSTED_LOGOS : [...TRUSTED_LOGOS, ...TRUSTED_LOGOS];
  return (
    <div className="logo-marquee" data-reveal>
      <p className="section-label">Trusted by organizations that lead</p>
      <div className={`logo-marquee-viewport${reduce ? " logo-marquee-viewport--static" : ""}`}>
        <div className="logo-marquee-track">
          {track.map(([slug, name], i) => (
            <img
              key={`${slug}-${i}`}
              className="logo-marquee-item"
              src={`/logos/${slug}.webp`}
              alt={name}
              loading="lazy"
              aria-hidden={i >= TRUSTED_LOGOS.length ? "true" : undefined}
            />
          ))}
        </div>
      </div>
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
      <a className="text-link" href="/case-studies">
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
  const reduce = useReducedMotion();
  const nav = useMemo(() => buildNav(), []);
  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="header">
      <a className="brand" href="/" aria-label="Social Following Studios home">
        <Logo />
      </a>
      <nav className="nav" aria-label="Primary">
        {nav.map((item) => (
          <a key={item.href} href={item.href} className={route === item.href ? "current" : ""}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="btn nav-cta" href="/assessment">
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
      <AnimatePresence>
        {open && (
          <motion.nav
            id="mobile-nav"
            className="mobile-nav"
            aria-label="Mobile"
            initial={reduce ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: GRAPH_EASE }}
          >
            {nav.map((item) => (
              <a key={item.href} href={item.href} onClick={() => setOpen(false)}>
                {item.label}
              </a>
            ))}
            <a href="/assessment" onClick={() => setOpen(false)}>Book Your Assessment</a>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

function Footer({ variant = "full", product }) {
  if (variant === "product") {
    return (
      <footer className="footer footer-product">
        <Logo className="footer-product-logo" />
        <p className="footer-product-name">{product} by Social Following Studios</p>
      </footer>
    );
  }
  return (
    <footer className={`footer ${variant === "minimal" ? "minimal" : ""}`}>
      <div className="footer-line">
        <span>Social Following Studios</span>
        <span aria-hidden="true">·</span>
        <span>An imprint of Marchitects.</span>
        <span aria-hidden="true">·</span>
        <span>© 2026 Social Following Studios</span>
        <span aria-hidden="true">·</span>
        <a href="/#/terms">Terms</a>
        <span aria-hidden="true">·</span>
        <a href="/#/privacy">Privacy</a>
        <span aria-hidden="true">·</span>
        <a href="/#/contact">Contact</a>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ *
 * PAGES
 * ------------------------------------------------------------------ */
function HomeProblem() {
  return (
    <section className="home-problem" aria-labelledby="relationship-problem-title">
      <div className="home-beat-inner home-problem-grid">
        <div>
          <h2 id="relationship-problem-title">Most customer attention never becomes a direct relationship.</h2>
          <p className="home-problem-copy">
            Businesses generate attention through search, websites, social platforms, inquiries, reservations, purchases, and existing databases. That activity often stays disconnected.
          </p>
        </div>
        <div className="fragmentation-visual" aria-label="Fragmented customer activity becoming one direct relationship">
          <span className="fragment-source source-search">Search</span>
          <span className="fragment-source source-social">Social</span>
          <span className="fragment-source source-website">Website</span>
          <span className="fragment-source source-reviews">Reviews</span>
          <span className="fragment-source source-reservations">Reservations / purchases</span>
          <span className="fragment-source source-events">Events / inquiries</span>
          <span className="fragment-path path-one" />
          <span className="fragment-path path-two" />
          <span className="fragment-path path-three" />
          <span className="fragment-path path-four" />
          <span className="fragment-path path-five" />
          <span className="fragment-path path-six" />
          <span className="fragment-destination">Reachable<br />customer</span>
        </div>
      </div>
      <p className="home-problem-transition">The business changes when a customer becomes reachable.</p>
    </section>
  );
}

function HomeSystem() {
  return (
    <section className="home-system" id="system" aria-labelledby="system-title">
      <div className="home-beat-inner">
        <h2 id="system-title" className="home-system-title">How the system works</h2>
        <div className="home-system-intro">
          <p>A business gets attention every day. Social Following Studios turns that activity into a communication system the business can keep using.</p>
          <p>We identify the customer, build the audience, connect email and SMS, run the follow-up, and move people toward the next action.</p>
        </div>
        <ol className="home-system-flow" aria-label="Operating sequence">
          {HOMEPAGE_SYSTEM_FLOW.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}
        </ol>
      </div>
      <div className="home-graph-stage">
        <div className="home-beat-inner">
          <p className="home-graph-label">Audience Builder</p>
          <p className="home-graph-intro">Customer and database activity becomes a direct, usable audience.</p>
          <AudienceGraph />
          <p className="home-graph-statement">Every identified customer adds to the audience the business can reach directly.</p>
          <p className="home-graph-conclusion">Your audience is your business’s greatest asset.</p>
        </div>
      </div>
    </section>
  );
}

function HomeProofLogos() {
  const reduce = useReducedMotion();
  const logos = TRUSTED_LOGOS.slice(0, 6);
  const track = reduce ? logos : [...logos, ...logos];
  return (
    <div className={`home-proof-logos${reduce ? " home-proof-logos--static" : ""}`} aria-label="Organizations supported">
      <span>Trusted by organizations that lead</span>
      <div className="home-proof-logos-viewport">
        <div className="home-proof-logos-track">
          {track.map(([slug, name], index) => (
            <img
              key={`${slug}-${index}`}
              src={`/logos/${slug}.webp`}
              alt={name}
              loading="lazy"
              aria-hidden={index >= logos.length ? "true" : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeProof() {
  return (
    <section className="home-proof" id="results" aria-labelledby="proof-title">
      <div className="home-beat-inner">
        <p className="home-kicker">What changes when it is operated</p>
        <article className="home-featured-case" data-reveal>
          <div className="home-case-context"><span>Operating problem</span><p>A dormant plaintiff database had stopped responding while competing firms reached the same claimant pool.</p></div>
          <div className="home-case-result">
            <p className="home-case-label">Legal / Mass tort</p>
            <h2 id="proof-title">A dormant plaintiff database reached a multi-million dollar resolution.</h2>
            <p>We protected inbox placement, sequenced the outreach, and built the program around claimant trust.</p>
            <div className="home-case-metric"><strong>95%</strong><span>fewer placements lost</span></div>
            <blockquote>Our messaging reached our claimants. That was the difference.<cite>Michael T., Esquire · Managing Attorney, mass tort firm</cite></blockquote>
          </div>
        </article>
        <HomeProofLogos />
        <div className="home-proof-close" id="operating-contexts">
          <p className="home-proof-context">Built for regulated programs, healthcare and hospitality, and public-sector audiences where direct communication carries real responsibility.</p>
          <div className="home-assessment-explainer">
            <p className="home-kicker">Start with the assessment</p>
            <p>The assessment identifies where customer information enters, where communication breaks, what usable audience already exists, and what the first deployment should be.</p>
          </div>
          <div className="home-final-cta" aria-label="Book your assessment">
            <h2>Own your audience.</h2>
            <p>Start with an assessment of the audience, customer data, and communication paths you already have.</p>
            <Button>Book Your Assessment</Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Home() {
  return <><Hero /><HomeProblem /><HomeSystem /><HomeProof /></>;
}

function FullServiceESPPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Full-service ESP"
        title="The platform is only one layer of the work."
        lede="Social Following Studios builds and runs unified conversion systems: infrastructure, deployment, and ongoing operation."
      />
      <CategoryContrast />
      <ThreeLayerModel />
      <UnifiedConversionSystem />
      <WhatWeOperate />
      <OperatingDiscipline />
      <Implementation />
      <CtaBand title="Put one operating model behind your audience." />
    </div>
  );
}

function IndustriesPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Industries"
        title="Built for operating environments where the details matter."
        lede="A full-service model for organizations that need their direct audience to be managed with care."
      />
      <Industries />
      <BuyingSituations />
      <CtaBand title="Assess the operating conditions around your audience." />
    </div>
  );
}

function InsightsPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="Insights"
        title="Operational knowledge from the work."
        lede="Reachability, relevance, and direct audience relationships need a system that keeps running."
      />
      <section className="section">
        <SectionHead
          label="The point of view"
          title="Own the relationship, then operate it with care."
          lede="The useful work is rarely one campaign. It is the durable sequence of data stewardship, deliverability, conversation, and timely follow-through."
        />
      </section>
      <CtaBand title="See what your assessment makes visible." />
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page-shell">
      <PageHead
        eyebrow="About"
        title="The execution layer behind unified conversion systems."
        lede="Social Following Studios combines audience infrastructure with the people and operating discipline needed to put it to work."
      />
      <section className="section">
        <SectionHead
          label="How we work"
          title="One accountable model, from assessment through operation."
          lede="We stay close to the database, the channels, and the work that makes a direct relationship useful over time."
        />
      </section>
      <CtaBand title="Work from the audience you already own." />
    </div>
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
    "#/avatar-studio",
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
        <Card className="assessment-summary">
          <CardHeader className="assessment-summary-head">
            <p className="card-label">Assessment summary</p>
            <CardTitle>What the assessment covers</CardTitle>
          </CardHeader>
          <CardContent>
            <IndexList items={ASSESSMENT_OUTPUTS} />
          </CardContent>
        </Card>
        <BookingForm source="Website Assessment" />
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * AVATAR STUDIO — a scoped exception to the site's fade/rise-only
 * motion rule. Everywhere else keeps the [data-reveal] system; this
 * page and the homepage graph run framer-motion per the Sept 2026
 * motion spec.
 * ------------------------------------------------------------------ */
const AVATAR_EASE = [0.22, 1, 0.36, 1];

const avatarStagger = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const avatarRise = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 1, ease: AVATAR_EASE } },
};
const avatarSectionStagger = { hidden: {}, show: { transition: { staggerChildren: 0.1 } } };

const scrollToAvatarLead = (e) => {
  e.preventDefault();
  document.getElementById("lead")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

function MotionCTA({ children, href = "#lead", onClick, className = "" }) {
  const reduce = useReducedMotion();
  return (
    <motion.a
      className={`btn ${className}`}
      href={href}
      onClick={onClick}
      whileHover={reduce ? undefined : { y: -2, boxShadow: "0 10px 24px rgba(10,125,89,0.28)" }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.25, ease: AVATAR_EASE }}
    >
      <span>{children}</span>
      <Arrow />
    </motion.a>
  );
}

function AvatarKickerRule() {
  const reduce = useReducedMotion();
  return (
    <motion.span
      className="avatar-kicker-rule"
      style={{ originX: 0.5 }}
      initial={reduce ? false : { scaleX: 0 }}
      animate={reduce ? undefined : { scaleX: 1 }}
      transition={{ duration: 1.2, delay: 0.5, ease: AVATAR_EASE }}
    />
  );
}

function AvatarHero() {
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 60]);
  return (
    <section className="avatar-hero-full" ref={ref}>
      <motion.img
        className="avatar-hero-image"
        src="/avatar-studio/hero.webp"
        alt="A woman looking at her digital twin through a mirror"
        style={reduce ? undefined : { y }}
        animate={reduce ? undefined : { scale: [1, 1.035] }}
        transition={reduce ? undefined : { duration: 9, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
      />
      <div className="avatar-hero-text">
        <motion.div
          className="avatar-hero-text-inner"
          initial={reduce ? false : "hidden"}
          animate="show"
          variants={avatarStagger}
        >
          <motion.div className="avatar-eyebrow-block" variants={avatarRise}>
            <p className="eyebrow">Avatar Studio</p>
            <AvatarKickerRule />
          </motion.div>
          <motion.h1 variants={avatarRise}>
            Your twin, <em>working 24/7.</em>
          </motion.h1>
          <motion.p className="lede" variants={avatarRise}>
            Turn one recording into an always-on presence that looks, sounds, and speaks like you.
          </motion.p>
          <motion.div variants={avatarRise}>
            <MotionCTA href="#lead" onClick={scrollToAvatarLead}>
              See Your Twin
            </MotionCTA>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function AvatarSection({ eyebrow, title, children }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="section avatar-body-section"
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.25 }}
      variants={avatarSectionStagger}
    >
      <motion.p className="section-label" variants={avatarRise}>
        {eyebrow}
      </motion.p>
      <motion.h2 variants={avatarRise}>{title}</motion.h2>
      {children}
    </motion.section>
  );
}

function AvatarStatCallout({ children }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="avatar-stat-callout"
      initial={reduce ? false : { opacity: 0, x: -24 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ duration: 0.9, ease: AVATAR_EASE }}
    >
      {children}
    </motion.div>
  );
}

function AvatarCloseCta() {
  const reduce = useReducedMotion();
  return (
    <motion.section
      className="section avatar-close-cta"
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.3 }}
      variants={avatarSectionStagger}
    >
      <motion.p className="section-label" variants={avatarRise}>
        See it before you commit
      </motion.p>
      <motion.h2 variants={avatarRise}>Meet your twin.</motion.h2>
      <motion.p className="lede" variants={avatarRise}>
        We will build a 60-second sample around your business so you can see the quality, hear the voice, and
        watch your twin move before you buy.
      </motion.p>
      <motion.div variants={avatarRise}>
        <MotionCTA href="#lead" onClick={scrollToAvatarLead}>
          See Your Twin
        </MotionCTA>
      </motion.div>
    </motion.section>
  );
}

function AvatarStudioPage() {
  return (
    <>
      <AvatarHero />
      <div className="page-shell avatar-studio-page">
        <AvatarSection eyebrow="What it is" title="Show up without showing up every time.">
          <motion.p className="lede" variants={avatarRise}>
            Avatar Studio builds a digital twin from your real face, voice, knowledge, and delivery. You record
            once. We turn that source material into finished video you can use across the channels where your
            audience already spends time.
          </motion.p>
          <motion.p className="lede" variants={avatarRise}>
            Your twin looks like you, sounds like you, and speaks from your point of view. You stay present
            without putting another recording session on your calendar.
          </motion.p>
          <AvatarStatCallout>
            <p>
              Personal profiles earn roughly 5x the engagement of company pages. The feed rewards people, not
              logos. Your twin keeps <em>you</em> in the feed.{" "}
              <a
                href="https://medium.com/@zahrachemrah25/the-2-75x-impressions-and-5x-engagement-differential-between-personal-profiles-and-company-pages-is-86410fca276b"
                target="_blank"
                rel="noopener noreferrer"
              >
                See the data.
              </a>
            </p>
          </AvatarStatCallout>
        </AvatarSection>
        <AvatarSection eyebrow="The quality" title="The double take is the standard.">
          <motion.p className="lede" variants={avatarRise}>
            Your twin should look natural enough that the technology disappears. We match your voice, pacing,
            expressions, and delivery, then finish every clip like a commercial production.
          </motion.p>
          <motion.p className="lede" variants={avatarRise}>
            A real editor reviews every piece before it ships. If the movement, voice, or delivery breaks the
            illusion, we fix it.
          </motion.p>
          <motion.p className="lede" variants={avatarRise}>
            Every finished video includes clear AI disclosure. The goal is not to pretend the technology does
            not exist. The goal is to make the experience feel unmistakably like you.
          </motion.p>
        </AvatarSection>
        <AvatarSection eyebrow="How it works" title="You give us the source. We build the system.">
          <motion.p className="lede" variants={avatarRise}>
            One guided photo and voice session gives us what we need to build your twin. From there, Social
            Following Studios handles the scripting, production, editing, formatting, and finishing.
          </motion.p>
          <motion.p className="lede" variants={avatarRise}>
            You receive finished videos ready to publish. No camera setup. No repeated recording days. No
            production workflow for you to manage.
          </motion.p>
        </AvatarSection>
        <AvatarCloseCta />
        <section className="section" id="lead">
          <SectionHead label="Start the build" title="See your twin." />
          <BookingForm source="Avatar Studio" />
        </section>
      </div>
    </>
  );
}

function AudienceBuilder() {
  return (
    <div className="page-shell audience-builder-page">
      <PageHead
        eyebrow="Audience Builder"
        title="The audience your business can reach directly."
        lede="Audience Builder identifies customer activity and turns it into a direct, usable audience that Social Following Studios operates across email and SMS."
      />
      <section className="audience-builder-visual" aria-labelledby="audience-builder-visual-title">
        <div className="audience-builder-visual-head">
          <p className="section-label">Known audience growth</p>
          <p id="audience-builder-visual-title">Customer activity enters fragmented. Identified relationships accumulate into direct reach.</p>
        </div>
        <AudienceGraph />
        <p className="audience-builder-visual-caption">The graph shows the operating shift: customer activity is identified, added to the audience, and made available for follow-up, conversion, and reactivation.</p>
      </section>
      <section className="section audience-builder-system" aria-labelledby="audience-builder-system-title">
        <SectionHead
          label="The operated system"
          title="The audience is built, then put to work."
          lede="Social Following Studios connects the customer touchpoints, operates email and SMS, and keeps the audience growing through ongoing activity."
        />
        <ol className="home-system-flow audience-builder-flow" aria-label="Audience Builder operating sequence">
          {HOMEPAGE_SYSTEM_FLOW.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}
        </ol>
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

function CtaBand({ title, href = "/assessment", cta = "Book Your Assessment" }) {
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
        title="Get in touch."
        lede="Reach us directly, or start with the assessment below — every engagement begins there."
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
      <Button href="/contact">Contact</Button>
    </div>
  );
}

function ThankYou() {
  const addons = crossLinkProducts();
  return (
    <div className="page-shell">
      <PageHead eyebrow="Request received" title="Thanks. We have your request." lede="Our team will follow up shortly." />
      <Button href="/">Back home</Button>
      {addons.length > 0 && (
        <section className="section">
          <SectionHead label="Add-on activations" title="Once your program is running, these activate inside it." />
          <IndexList items={addons.map((p) => [p.label, p.blurb])} />
        </section>
      )}
    </div>
  );
}

function RetiredRoute({ to }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return null;
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
      if (key === "avatarStudio") return { node: <AvatarStudioPage />, layout: "full", footerProduct: "Avatar Studio" };
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
    case "/full-service-esp":
      return { node: <FullServiceESPPage />, layout: "full" };
    case "/industries":
      return { node: <RetiredRoute to="/#operating-contexts" />, layout: "full" };
    case "/results":
      return { node: <CaseStudiesPage />, layout: "full" };
    case "/insights":
      return { node: <InsightsPage />, layout: "full" };
    case "/about":
      return { node: <RetiredRoute to="/full-service-esp" />, layout: "full" };
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

function App({ initialRoute = "/" }) {
  const route = useHashRoute(initialRoute);
  useReveal(route);
  usePageMeta(route);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [route]);

  const { node, layout, footerProduct } = useMemo(() => resolvePage(route), [route]);

  return (
    <>
      {layout === "bare" ? <BareHeader /> : <Header route={route} />}
      <main>{node}</main>
      <Footer
        variant={footerProduct ? "product" : layout === "bare" ? "minimal" : "full"}
        product={footerProduct}
      />
    </>
  );
}

export default App;
