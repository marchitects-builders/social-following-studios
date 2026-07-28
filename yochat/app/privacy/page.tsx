export const metadata = { title: "Privacy Policy | Yochat" };

export default function PrivacyPolicy() {
  return (
    <main className="policy-main">
      <article className="policy">
        <p className="eyebrow">MARKETING AUTOMATION ARCHITECT · YOCHAT</p>
        <h1>Privacy Policy</h1>
        <p className="updated">Effective July 22, 2026</p>
        <p>
          Marketing Automation Architect, operating as Marchitects ("Marchitects," "we," "us," or
          "our"), provides Yochat, an automated messaging service for Facebook Messenger and
          Instagram. This policy explains how Yochat handles information when people message a
          business account connected to the service.
        </p>

        <h2>Information we process</h2>
        <ul>
          <li>Message text and related conversation events sent through Facebook or Instagram.</li>
          <li>Platform-scoped account identifiers needed to receive and reply to a message.</li>
          <li>Contact details a person voluntarily provides, such as a name, email address, or phone number.</li>
          <li>Conversation status, interests, tags, consent choices, handoffs, and delivery history used to operate the service.</li>
          <li>Technical and security information used to authenticate requests, prevent abuse, and troubleshoot the service.</li>
        </ul>

        <h2>How we use information</h2>
        <p>
          We process this information to understand an incoming request, generate an automated reply,
          route the reply through the correct business account, maintain security, troubleshoot errors,
          and provide a human handoff when appropriate. Automated replies may be generated using an
          artificial-intelligence model.
        </p>

        <h2>Service providers and disclosures</h2>
        <p>
          Yochat uses Meta Platforms to receive and send messages, NVIDIA hosted NIM to generate
          responses, Vercel to host the application, and a serverless data provider such as Upstash to
          store operational records. These providers may process information on our
          behalf under their applicable terms and privacy practices. We do not sell personal information.
          We may disclose information when required by law or when reasonably necessary to protect
          people, our service, or our legal rights.
        </p>

        <h2>Retention</h2>
        <p>
          Yochat maintains a limited contact and conversation database so the connected business can
          continue conversations, honor consent choices, manage human handoffs, and measure service
          performance. The default automated retention period is 90 days and may be adjusted by the
          operator. Open handoffs and information required for security, legal obligations, or dispute
          resolution may be retained longer. Authorized operators can delete a contact and associated
          conversation history from the control room.
        </p>

        <h2>Your choices and deletion requests</h2>
        <p>
          You may request access to or deletion of information controlled by Marchitects by emailing
          <a href="mailto:webmaster@marchitects.builders"> webmaster@marchitects.builders</a>. Include
          the Facebook or Instagram account used for the conversation and enough detail for us to locate
          the request. We may ask for verification before acting on a request.
        </p>

        <h2>Security and international processing</h2>
        <p>
          We use reasonable administrative and technical safeguards, including authenticated webhook
          requests and encrypted network connections. No system can guarantee absolute security.
          Information may be processed in countries other than the one where you live, subject to the
          safeguards used by us and our providers.
        </p>

        <h2>Children</h2>
        <p>Yochat is not directed to children under 13, and we do not knowingly collect their personal information.</p>

        <h2>Changes and contact</h2>
        <p>
          We may update this policy to reflect changes to the service or applicable requirements. The
          effective date above identifies the current version. Questions may be sent to
          <a href="mailto:webmaster@marchitects.builders"> webmaster@marchitects.builders</a>.
        </p>

        <nav className="policy-nav" aria-label="Legal pages">
          <a href="/">Yochat status</a>
          <a href="/data-deletion">Data deletion</a>
          <a href="/terms">Terms</a>
        </nav>
      </article>
    </main>
  );
}
