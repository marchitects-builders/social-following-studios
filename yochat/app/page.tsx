const checks = [
  ["NVIDIA inference", Boolean(process.env.NVIDIA_API_KEY)],
  ["Meta verification", Boolean(process.env.META_VERIFY_TOKEN)],
  ["Messenger signature validation", Boolean(process.env.META_APP_SECRET)],
  [
    "Facebook Page tokens",
    Boolean(process.env.META_PAGE_ACCESS_TOKENS_JSON || process.env.META_PAGE_ACCESS_TOKEN),
  ],
  ["Instagram signature validation", Boolean(process.env.META_INSTAGRAM_APP_SECRET)],
  [
    "Instagram account tokens",
    Boolean(process.env.META_INSTAGRAM_ACCESS_TOKENS_JSON || process.env.META_INSTAGRAM_ACCESS_TOKEN),
  ],
] as const;

export const dynamic = "force-dynamic";

export default function Home() {
  const ready = checks.every(([, configured]) => configured);

  return (
    <main>
      <section className="card">
        <p className="eyebrow">YOCHAT · MESSAGING ENGINE</p>
        <h1>{ready ? "Yochat is operational" : "Configuration required"}</h1>
        <p className="lede">
          One control room for Marketing Automation Architects, Social Following, and Artists And
          Athletes For Change—covering conversations, contacts, automations, knowledge, analytics,
          human handoffs, and safe testing.
        </p>
        <div className="status-list">
          {checks.map(([label, configured]) => (
            <div className="status" key={label}>
              <span aria-hidden="true" className={configured ? "dot ok" : "dot"} />
              <span>{label}</span>
              <strong>{configured ? "Configured" : "Missing"}</strong>
            </div>
          ))}
        </div>
        <div className="endpoint">
          <span>Meta callback</span>
          <code>/api/webhook</code>
        </div>
        <p><a className="primary-button" href="/dashboard">Open Yochat Control Room</a></p>
        <nav className="legal-links" aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/data-deletion">Data deletion</a>
          <a href="/terms">Terms</a>
        </nav>
      </section>
    </main>
  );
}
