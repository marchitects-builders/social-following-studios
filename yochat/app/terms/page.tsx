export const metadata = { title: "Terms of Use | Yochat" };

export default function TermsOfUse() {
  return (
    <main className="policy-main">
      <article className="policy">
        <p className="eyebrow">MARKETING AUTOMATION ARCHITECT · YOCHAT</p>
        <h1>Terms of Use</h1>
        <p className="updated">Effective July 22, 2026</p>
        <p>
          These terms apply when you interact with Yochat through a Facebook or Instagram business
          account operated by or connected to Marketing Automation Architect. By continuing the
          conversation, you agree to these terms and the applicable Meta platform terms.
        </p>

        <h2>Automated responses</h2>
        <p>
          Yochat may use artificial intelligence to draft replies. Responses can be incomplete,
          inaccurate, or inappropriate for your circumstances. Do not rely on Yochat as a substitute
          for professional legal, medical, financial, or other expert advice. Ask for a human when a
          decision requires professional judgment.
        </p>

        <h2>Acceptable use</h2>
        <p>
          You may not use Yochat to violate law, infringe rights, distribute malware, attempt
          unauthorized access, interfere with the service, impersonate others, or send abusive or
          fraudulent content. We may restrict access when reasonably necessary to protect the service or others.
        </p>

        <h2>Availability and third-party services</h2>
        <p>
          The service is provided on an "as available" basis and may change, pause, or stop without
          notice. Yochat depends on third-party services including Meta, NVIDIA, and Vercel, and their
          availability and terms also apply.
        </p>

        <h2>Disclaimer and limitation</h2>
        <p>
          To the extent permitted by law, we disclaim implied warranties and are not liable for indirect,
          incidental, special, consequential, or punitive damages arising from use of Yochat. Nothing in
          these terms excludes rights or liability that cannot lawfully be excluded.
        </p>

        <h2>Privacy, changes, and contact</h2>
        <p>
          Our <a href="/privacy">Privacy Policy</a> explains how information is handled. We may update
          these terms as the service changes. Questions may be sent to
          <a href="mailto:webmaster@marchitects.builders"> webmaster@marchitects.builders</a>.
        </p>

        <nav className="policy-nav" aria-label="Legal pages">
          <a href="/">Yochat status</a>
          <a href="/privacy">Privacy</a>
          <a href="/data-deletion">Data deletion</a>
        </nav>
      </article>
    </main>
  );
}
