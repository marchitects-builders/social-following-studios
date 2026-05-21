import React, { useEffect, useMemo, useState } from "react";

const BRAND_LOGO = "/brand/sfs-logo.png";
const LOGOS_APPROVED = "/logos-approved.png";

const NAV = [
  { label: "Infrastructure", href: "#/infrastructure", route: "/infrastructure" },
  { label: "Case Studies", href: "#/case-studies", route: "/case-studies" },
  { label: "About", href: "#/", route: "/about" },
  { label: "Contact", href: "#/contact", route: "/contact" },
];

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

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Button({ children = "Book Your Assessment", className = "" }) {
  return (
    <a className={`btn btn-primary ${className}`} href="#/contact">
      {children}
      <Arrow />
    </a>
  );
}

function Logo({ className = "" }) {
  return <img className={`logo ${className}`} src={BRAND_LOGO} alt="Social Following Studios" />;
}

function Plane({ className = "" }) {
  return (
    <svg className={`paper-plane ${className}`} viewBox="0 0 300 180" aria-hidden="true">
      <defs>
        <linearGradient id="planeWing" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e7e2d9" />
        </linearGradient>
        <linearGradient id="planeFold" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f9f8f4" />
          <stop offset="1" stopColor="#d8d2c9" />
        </linearGradient>
        <filter id="planeShadow" x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#131313" floodOpacity=".12" />
        </filter>
      </defs>
      <g filter="url(#planeShadow)">
        <path d="M19 111 272 20 211 150z" fill="url(#planeWing)" />
        <path d="M19 111l143-15 49 54z" fill="#ded9d0" />
        <path d="M162 96 272 20 201 112z" fill="#f7f5ef" />
        <path d="m162 96 10 42 29-26z" fill="url(#planeFold)" />
        <path d="m19 111 143-15L272 20" fill="none" stroke="#d8d2c9" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function Header({ route }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [route]);

  return (
    <header className="site-header">
      <a className="brand" href="#/" aria-label="Social Following Studios home">
        <Logo />
      </a>
      <nav className="nav-links" aria-label="Primary navigation">
        {NAV.map((item) => (
          <a key={item.href} className={route === item.route ? "active" : ""} href={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="btn btn-primary nav-cta" href="#/contact">Book Your Assessment</a>
      <button className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-menu" onClick={() => setOpen((value) => !value)}>
        <span />
        <span />
        <span />
      </button>
      {open && (
        <nav id="mobile-menu" className="mobile-menu" aria-label="Mobile navigation">
          {NAV.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
          <a href="#/contact">Book Your Assessment</a>
        </nav>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Logo />
          <p>We build and manage mission-critical communication infrastructure that drives real-world results.</p>
        </div>
        <form className="footer-signup" onSubmit={(event) => event.preventDefault()}>
          <p>Join our mailing list for the latest insights.</p>
          <div className="signup-row">
            <input type="email" placeholder="Email address" aria-label="Email address" />
            <button type="submit">Join</button>
          </div>
        </form>
        <div className="footer-legal">
          <a href="#/terms">Terms</a>
          <a href="#/privacy">Privacy</a>
        </div>
      </div>
      <div className="footer-bottom">© 2024 Social Following Studios. An imprint of M Architects.</div>
    </footer>
  );
}

function Chart() {
  return (
    <svg viewBox="0 0 420 210" role="img" aria-label="Audience reactivation potential increasing from January to June">
      <defs>
        <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
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
      <path d="M0 170 22 140 42 125 63 137 86 112 108 92 130 88 152 105 174 110 196 103 218 112 240 104 262 74 284 70 306 58 328 55 350 36 372 14 420 14 420 190 0 190Z" fill="url(#chartFill)" />
      <path d="M0 170c18-26 25-38 42-45s23 13 44-13 32-28 54-16 28 16 50 10 22 6 44-14 18-20 40-21 23-13 44-17 20-14 36-27 11-13 30-13h36" fill="none" stroke="#008b61" strokeWidth="3" strokeLinecap="round" />
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

function AssessmentSummary() {
  return (
    <article className="visual-panel assessment-card" aria-label="Assessment summary">
      <div className="panel-head">
        <p className="card-label">Assessment Summary</p>
        <span className="status-pill">
          <span className="dot" />
          Ready to Reactivate
        </span>
      </div>
      <div className="summary-main">
        <div className="summary-score">
          <p className="serif small-serif">Audience Reactivation Potential</p>
          <p className="big-percent">83%</p>
          <p className="summary-copy">High potential to reach dormant connections across your channels.</p>
        </div>
        <div className="chart">
          <Chart />
        </div>
      </div>
      <div className="stats-row">
        <Metric label="Reachable Contacts" value="246K" caption="+18% vs last 6 months" />
        <Metric label="Dormant Revenue" value="$3.8M" caption="Estimated opportunity" />
        <Metric label="Data Health" value="78%" caption="Above industry average" />
      </div>
      <div className="panel-foot">
        <span className="check-icon">✓</span>
        Infrastructure in place. Channels connected. Ready to deploy.
      </div>
    </article>
  );
}

function Metric({ label, value, caption }) {
  return (
    <div className="stat">
      <p className="metric-label">{label}</p>
      <div className="stat-value">{value}</div>
      <div className="stat-caption">{caption}</div>
    </div>
  );
}

function HeroCopy({ eyebrow, title, body, showButton = true }) {
  return (
    <div className="hero-copy">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <div className="green-rule" />
      <p className="lead">{body}</p>
      {showButton && <Button />}
    </div>
  );
}

function BriefCard({ children, next = false }) {
  return (
    <div className={`brief-card ${next ? "next-steps" : ""}`}>
      <div className="brief-icon" aria-hidden="true">
        {next ? (
          <span className="check-icon">✓</span>
        ) : (
          <svg width="58" height="58" viewBox="0 0 64 64" fill="none">
            <path d="m32 6 14 8v16l-14 8-14-8V14zM18 30l14-8 14 8M32 22v16" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="m16 42 10-6 10 6v12l-10 6-10-6zM38 42l10-6 10 6v12l-10 6-10-6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      {!next && <div className="brief-divider" />}
      {children}
    </div>
  );
}

function CtaBand({ title, copy, cta = "Book Your Assessment" }) {
  return (
    <section className="page-shell">
      <div className={`cta-band ${copy ? "with-copy" : ""}`}>
        <h2>{title}</h2>
        {copy && <p>{copy}</p>}
        <Plane className="cta-plane" />
        <Button>{cta}</Button>
      </div>
    </section>
  );
}

function Home() {
  return (
    <>
      <section className="page-shell hero">
        <HeroCopy
          eyebrow="Data. Infrastructure. Results."
          title={<>Your database,<br />reactivated.</>}
          body="You have the database. You may have the platform. You are not getting the result. Social Following Studios is a full-service email program management firm that takes over the program entirely. Assessment, build, deployment, and deliverability. And produces the outcome."
        />
        <Plane className="home-plane" />
        <svg className="flight-path home-flight" viewBox="0 0 360 260" aria-hidden="true">
          <path d="M30 210c95-14 11-112 96-154 60-30 129 5 200-42" />
        </svg>
        <AssessmentSummary />
      </section>

      <section id="about" className="page-shell section">
        <article className="copy-card">
          <p className="section-label">Why It Stops Working</p>
          <h2>Most email programs fail for the same reason.</h2>
          <p>The database is real. The platform is paid for. The team is busy with everything else. Nobody is running the program. Klaviyo doesn't run it. HubSpot doesn't run it. Salesforce Marketing Cloud doesn't run it. You do. Or nobody does. Social Following Studios runs it. We take over the full program from assessment to deployment and manage it as the program owner.</p>
        </article>
      </section>

      <section className="page-shell section">
        <article className="copy-card wide-copy">
          <p className="section-label">Who We Serve</p>
          <h2>Organizations with dormant databases and active compliance obligations.</h2>
          <p>We work with organizations that have built real contact databases from years of earned permission. Legal firms managing plaintiff communication across active case lifecycles. Government agencies with constituent outreach obligations tied to regulatory deadlines. Healthcare organizations governed by HIPAA-compliant communication requirements. Real estate operations with dormant investor and buyer databases. Manufacturing organizations with vendor and procurement networks that have stopped responding. Organizations whose program is paid for and not producing. Organizations whose outreach has gone quiet and whose team lacks the capacity or the expertise to fix it permanently.</p>
        </article>
      </section>

      <CtaBand title="Let’s put your database to work." />
    </>
  );
}

function SystemDiagram() {
  const inputs = [
    ["CRM", "user"],
    ["Historical Engagement", "chart"],
    ["Compliance Data", "shield"],
    ["Audience Records", "users"],
  ];
  const outputs = [
    ["Email", "mail"],
    ["SMS", "chat"],
    ["Voice", "phone"],
    ["Direct Mail", "mail"],
  ];

  return (
    <article className="visual-panel system-card" aria-label="Unified data system diagram">
      <div className="system-diagram">
        <DiagramSide label="Inputs" items={inputs} />
        <div className="diagram-center">
          <div className="diagram-core">
            <Logo />
            <span>Unified Data System</span>
          </div>
        </div>
        <DiagramSide label="Outputs" items={outputs} />
      </div>
    </article>
  );
}

function DiagramSide({ label, items }) {
  return (
    <div className="diagram-side">
      <p className="diagram-label">{label}</p>
      {items.map(([title, icon]) => (
        <div className="diagram-tile" key={title}>
          <Icon name={icon} />
          <span>{title}</span>
        </div>
      ))}
    </div>
  );
}

function Icon({ name, className = "" }) {
  const props = { className: `line-icon ${className}`, viewBox: "0 0 72 72", fill: "none", "aria-hidden": true };
  const paths = {
    database: (
      <>
        <ellipse cx="36" cy="15" rx="22" ry="9" />
        <path d="M14 15v37c0 5 10 9 22 9s22-4 22-9V15M14 34c0 5 10 9 22 9s22-4 22-9M14 49c0 5 10 9 22 9s22-4 22-9" />
      </>
    ),
    gear: (
      <>
        <path d="M36 8v10M36 54v10M8 36h10M54 36h10M16 16l7 7M49 49l7 7M56 16l-7 7M23 49l-7 7" />
        <circle cx="36" cy="36" r="18" />
        <circle cx="36" cy="36" r="7" />
      </>
    ),
    network: (
      <>
        <circle cx="36" cy="12" r="5" />
        <circle cx="16" cy="48" r="5" />
        <circle cx="56" cy="48" r="5" />
        <circle cx="36" cy="58" r="5" />
        <path d="M36 17v17M36 34 16 43M36 34l20 9M36 34v19" />
      </>
    ),
    trend: (
      <>
        <path d="M14 58h44M14 58V10" />
        <path d="m21 47 10-13 10 5 15-23" />
        <circle cx="21" cy="47" r="3" fill="currentColor" />
        <circle cx="31" cy="34" r="3" fill="currentColor" />
        <circle cx="41" cy="39" r="3" fill="currentColor" />
        <circle cx="56" cy="16" r="3" fill="currentColor" />
      </>
    ),
    mail: (
      <>
        <path d="M12 20h48v34H12z" />
        <path d="m14 22 22 19 22-19" />
      </>
    ),
    phone: <path d="M24 12h10l4 15-7 5c5 9 10 14 19 19l5-7 15 4v10c0 3-2 5-5 5C35 63 9 37 9 17c0-3 2-5 5-5z" />,
    calendar: (
      <>
        <rect x="14" y="18" width="44" height="40" rx="2" />
        <path d="M24 10v14M48 10v14M14 30h44M24 39h6M34 39h6M44 39h6M24 49h6M34 49h6M44 49h6" />
      </>
    ),
    user: (
      <>
        <circle cx="36" cy="21" r="9" />
        <path d="M19 58c3-12 8.7-18 17-18s14 6 17 18" />
      </>
    ),
    users: (
      <>
        <circle cx="26" cy="25" r="7" />
        <circle cx="47" cy="27" r="6" />
        <path d="M12 58c2.5-10 7-15 14-15s11.5 5 14 15M37 58c2-8 5.5-12 11-12s9 4 11 12" />
      </>
    ),
    chart: (
      <>
        <path d="M14 58h44M20 52V34M34 52V20M48 52V12" />
        <path d="m15 42 13-13 9 9 18-24" />
      </>
    ),
    shield: (
      <>
        <path d="M36 8 56 16v17c0 15-8 24-20 31-12-7-20-16-20-31V16z" />
        <path d="m26 35 7 7 14-17" />
      </>
    ),
    chat: <path d="M14 32c0-12 9.6-20 22-20s22 8 22 20-9.6 20-22 20c-3 0-5.7-.4-8.2-1.3L16 56l4.4-9.3C16.4 43 14 37.8 14 32z" />,
    search: (
      <>
        <circle cx="30" cy="30" r="17" />
        <path d="m43 43 15 15" />
      </>
    ),
    pen: (
      <>
        <path d="M20 58 30 28l23-18 9 9-18 23z" />
        <path d="m30 28 14 14M48 14l10-10" />
      </>
    ),
  };

  return <svg {...props}>{paths[name]}</svg>;
}

function Infrastructure() {
  const features = [
    ["database", "1. Unified Database", "We consolidate your contact records, suppress duplicates, and establish the clean list architecture the program runs on."],
    ["gear", "2. Rules Engine", "Segmentation logic, compliance suppression rules, and behavioral triggers are built before deployment. The right message reaches the right contact under the right conditions."],
    ["network", "3. Channel Orchestration", "Deployment runs across email, conversational, and voice channels simultaneously from one team. One program. Every live channel your contacts use."],
    ["trend", "4. Real-time Monitoring", "Deliverability is actively governed every send cycle. That rate holds because it is managed, not configured once and left. 95% inbox placement is an output of ongoing governance, not a platform feature. The industry average sits at 83.1% across major ESPs (EmailTooltester, 2026). Nearly one in six messages never reaches the inbox before a single person decides whether to respond."],
  ];

  const steps = [
    ["01", "Ingest", "We pull the data your program already owns. List age, engagement history, delivery performance. And map the distance between current output and recoverable value."],
    ["02", "Process", "We build sequences for each segment: reactivation flows for dormant contacts, compliance communications for active records, and retention programs for engaged audiences."],
    ["03", "Evaluate", "We audit deliverability infrastructure, authentication records, and sending history. Every gap between your current inbox placement rate and 95% is identified and addressed before deployment."],
    ["04", "Engage", "We execute delivery with full authentication, reputation management, and real-time monitoring. Every message routes through infrastructure built for inbox placement, not volume."],
  ];

  return (
    <>
      <section className="page-shell hero narrow">
        <HeroCopy eyebrow="Data. Infrastructure. Results." title={<>One system.<br />Every channel.</>} body="Social Following Studios manages the full program infrastructure. Database, sequences, deployment, and deliverability. From one team with one accountable outcome." />
        <SystemDiagram />
      </section>

      <section className="page-shell section">
        <BriefCard>
          <div className="brief-content">
            <h2>What we build for your program.</h2>
            <p>Every program we manage runs on a unified database layer. We ingest your existing contacts, segment by engagement history and channel behavior, and map the reactivation path before the first send goes out. You do not manage the infrastructure. We do.</p>
          </div>
        </BriefCard>
      </section>

      <section className="page-shell section">
        <div className="cards-grid four">
          {features.map(([icon, title, copy]) => (
            <article className="card" key={title}>
              <Icon name={icon} className="icon-large" />
              <h3>{title}</h3>
              <div className="small-rule" />
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <Process steps={steps} />
      <CtaBand title="Your program, under management." />
    </>
  );
}

function Process({ steps, three = false }) {
  return (
    <section className="page-shell process">
      <p className="section-label">How It Works</p>
      <div className={`process-grid ${three ? "three" : ""}`}>
        {steps.map(([number, title, copy]) => (
          <article className="process-step" key={title}>
            <div className="process-heading">
              <span className="process-number">{number}</span>
              <span className="process-title">{title}</span>
            </div>
            <div className="small-rule" />
            <p>{copy}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CaseStudies() {
  const cases = [
    {
      type: "Government",
      title: "Federal housing agency",
      outcome: "A federal housing agency recovered constituent engagement at program scale without new budget or new infrastructure.",
      narrative: "A federal housing agency managing constituent communication across active waitlist programs engaged Social Following Studios to run the full outreach program. Coordinated communication reached applicants across every live channel within the existing program infrastructure. Constituent engagement returned to active status at program scale.",
    },
    {
      type: "Manufacturing",
      title: "Manufacturing organization",
      outcome: "A manufacturing organization recovered procurement relationships that had stopped responding after a program transition.",
      narrative: "A manufacturing organization had a vendor and procurement contact database that had gone quiet after a program transition while relationships representing active buying history stopped responding entirely. A reactivation sequence ran across the existing database. Procurement contacts returned to active engagement within the first program cycle. Existing database. Existing budget.",
      quote: "We recovered relationships we assumed were gone permanently.",
    },
    {
      type: "Real Estate",
      title: "Regional broker",
      outcome: "A regional broker produced 11 signed listing agreements in 45 days from a database the business had stopped using.",
      narrative: "A regional broker had a past-client database of buyers and sellers who had gone quiet while the business spent money acquiring new leads. A unified reactivation sequence ran across email, conversational, and voice channels simultaneously. The existing database and existing budget produced 11 signed listing agreements within 45 days.",
      quote: "The buyers and sellers we thought were gone came back through the same list we had ignored for years.",
    },
  ];

  return (
    <>
      <section className="page-shell hero case-hero">
        <HeroCopy eyebrow="Case Studies" title={<>Results from<br />real engagements.</>} body="Every case below began with a database the organization already owned and a program that had stopped producing. Existing infrastructure. Existing budget." showButton={false} />
        <article className="visual-panel featured-card" aria-label="Featured case study">
          <div className="panel-head">
            <p className="card-label">Featured Case Study</p>
            <span className="status-pill"><span className="dot" />Legal / Mass Tort</span>
          </div>
          <div className="featured-proof">
            <p className="card-label">Legal / Mass Tort</p>
            <h2>A plaintiff database reached multi-million dollar resolution after competing firms reached the same claimant pool.</h2>
            <p>A plaintiff database had gone dormant while competing firms reached the same claimant pool. Inbox placement determines whether the claimant sees the message. We ran the deliverability program at 95% inbox placement, sequenced the outreach, and built the communication program around claimant trust. The matter reached multi-million dollar resolution.</p>
            <div className="quote-block compact">
              <blockquote>“Our messaging reached our claimants. That was the difference.”</blockquote>
              <cite>— Managing Attorney, mass tort firm. Quoted anonymously at client's request</cite>
            </div>
          </div>
        </article>
      </section>

      <section className="page-shell">
        <div className="logo-bar">
          <p className="section-label">Trusted By Organizations That Lead</p>
          <img src={LOGOS_APPROVED} alt="Trusted organizations" />
        </div>
      </section>

      <section className="page-shell section">
        <div className="case-section-title">
          <h2>Case Study Grid</h2>
          <div className="small-rule" />
        </div>
        <div className="case-grid proof-grid">
          {cases.map(({ type, title, outcome, narrative, quote }) => (
            <article className="card case-card" key={title}>
              <p className="card-label">{type}</p>
              <h3>{title}</h3>
              <p className="case-outcome">{outcome}</p>
              <p>{narrative}</p>
              {quote && <p className="case-author">“{quote}”</p>}
            </article>
          ))}
        </div>
      </section>

      <CtaBand title="Your database has a case study in it." copy="Start with the Assessment and find out what it can produce." />
    </>
  );
}

function Contact() {
  return (
    <>
      <section className="page-shell hero contact-layout">
        <HeroCopy eyebrow="Start the conversation." title={<>Book your<br />assessment.</>} body="Every engagement begins with a Database Assessment. The assessment produces the numbers. The numbers drive the decision." showButton={false} />
        <Plane className="contact-plane" />
        <svg className="flight-path contact-flight" viewBox="0 0 360 260" aria-hidden="true">
          <path d="M15 212c92-20 20-96 92-120 50-17 84 8 73-45-10-48 71-58 151-28" />
        </svg>
        <BookingForm />
        <ExpectCard />
      </section>

      <section className="page-shell section">
        <p className="section-label connect-title">Other Ways To Connect</p>
        <div className="cards-grid contact-two">
          <ContactCard icon="mail" title="Email" body="hello@socialfollowingstudios.com" />
          <ContactCard icon="shield" title="Note" body="We do not accept unsolicited vendor or platform pitches through this form." />
        </div>
      </section>

      <section className="page-shell section">
        <BriefCard next>
          <div className="next-copy">
            <p className="section-label">Next Steps</p>
            <p>We accept assessment calls for organizations ready to understand what their existing database can produce. There is no sales call before the assessment. The assessment is the first step.</p>
          </div>
        </BriefCard>
      </section>

      <CtaBand title="Your database, reactivated." copy="The assessment produces the numbers. The numbers drive the decision." />
    </>
  );
}

function BookingForm() {
  return (
    <form className="form-card" action="https://crm.zoho.com/crm/WebToLeadForm" method="POST">
      <input type="hidden" name="xnQsjsdp" value="b45ce04ddd76914bbfeade30ab0a6e86446ed07ddcd64b5425a1a4d9d5a467b8" readOnly />
      <input type="hidden" name="xmIwtLD" value="97ca543a3d1ea88492628d126d9ab329b04cea167679b0225170279c6fc6e4f3684dbc3fb82c598c93398f0f68dcd29b" readOnly />
      <input type="hidden" name="actionType" value="TGVhZHM=" readOnly />
      <input type="hidden" name="returnURL" value="https://socialfollowingstudios.com/#/thank-you" readOnly />
      <p className="card-label">Schedule your assessment call.</p>
      <div className="form-grid">
        <Field label="Name" name="Last Name" required full />
        <Field label="Organization" name="Company" required full />
        <Field label="Email" name="Email" type="email" required full />
        <Field label="Brief description of your program situation" name="Description" textarea required full />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" type="submit">
          Request Assessment
          <Arrow />
        </button>
        <div className="privacy-note">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <span>Your information is secure and will never be shared.</span>
        </div>
      </div>
    </form>
  );
}

function Field({ label, name, type = "text", full = false, textarea = false, required = false, placeholder = "" }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {textarea ? <textarea id={name} name={name} placeholder={placeholder} required={required} /> : <input id={name} name={name} type={type} required={required} />}
    </div>
  );
}

function SelectField({ label, name, options, full = false }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label htmlFor={name}>{label}</label>
      <select id={name} name={name}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

function ExpectCard() {
  return (
    <aside className="expect-card">
      <p className="card-label">What happens after you submit.</p>
      <div className="expect-list">
        <Expect number="01" body="You will receive a confirmation within one business day." />
        <Expect number="02" body="A brief intake call is scheduled. 20 minutes. To confirm program context." />
        <Expect number="03" body="The assessment is conducted against your database and deliverability infrastructure." />
        <Expect number="04" body="You receive a written report identifying database health, channel gaps, and your reactivation path." />
        <Expect number="05" body="The program architecture follows from the assessment. The first send follows from the architecture." />
      </div>
    </aside>
  );
}

function Expect({ number, title, body }) {
  return (
    <div className="expect-item">
      <strong>{number}</strong>
      <div className="small-rule" />
      {title && <h3>{title}</h3>}
      <p>{body}</p>
    </div>
  );
}

function ContactCard({ icon, title, body, link, href = "#/contact" }) {
  return (
    <article className="card contact-card">
      <Icon name={icon} className="icon-large" />
      <h3>{title}</h3>
      <div className="small-rule" />
      <p>{body}</p>
      {link && <a className="text-link" href={href}>{link}</a>}
    </article>
  );
}

function PolicyPage({ title }) {
  return (
    <section className="page-shell policy-page">
      <p className="eyebrow">Social Following Studios</p>
      <h1>{title}</h1>
      <div className="green-rule" />
      <p className="lead">This page is being updated. Contact hello@socialfollowingstudios.com for the current policy details.</p>
      <Button>Contact Us</Button>
    </section>
  );
}

function ThankYou() {
  return (
    <section className="page-shell policy-page">
      <p className="eyebrow">Request Received</p>
      <h1>Thanks. We got your request.</h1>
      <div className="green-rule" />
      <p className="lead">Our team will review and follow up shortly.</p>
      <a className="btn btn-primary" href="#/">Back Home</a>
    </section>
  );
}

function App() {
  const route = useHashRoute();
  const page = useMemo(() => {
    switch (route) {
      case "/infrastructure":
        return <Infrastructure />;
      case "/case-studies":
        return <CaseStudies />;
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
