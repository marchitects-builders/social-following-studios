"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AnalyticsEvent,
  AutomationRule,
  BrandConfig,
  BrandKey,
  CampaignActivity,
  CampaignDefinition,
  CampaignEnrollment,
  Contact,
  Conversation,
  DeliveryJob,
  Handoff,
  MailingListSubscription,
  MessageRecord,
  SequenceDefinition,
  TriggerType,
} from "@/lib/types";

type DashboardData = {
  storageMode: "redis" | "memory";
  settings: { globalAutomationPaused: boolean; retentionDays: number };
  operational: {
    failedJobs: number;
    staleProcessingJobs: number;
    enabledBrands: number;
    configured: { meta: boolean; instagram: boolean; ai: boolean; persistentStorage: boolean; scheduler: boolean };
  };
  brands: BrandConfig[];
  totalsByBrand: Array<{ brand: BrandKey; contacts: number; conversations: number; openHandoffs: number }>;
  contacts: Contact[];
  conversations: Conversation[];
  messages: MessageRecord[];
  handoffs: Handoff[];
  jobs: DeliveryJob[];
  sequences: SequenceDefinition[];
  enrollments: Array<{ id: string; sequenceId: string; contactId: string; status: string; nextRunAt: string }>;
  analytics: AnalyticsEvent[];
  audits: Array<{ id: string; action: string; actor: string; target?: string; createdAt: string }>;
  campaigns: CampaignDefinition[];
  campaignEnrollments: CampaignEnrollment[];
  campaignActivity: CampaignActivity[];
  mailingListSubscriptions: MailingListSubscription[];
};

type CampaignVerification = {
  ok: boolean;
  passed: number;
  total: number;
  checks: Array<{ name: string; passed: boolean; detail: string }>;
  keywordCases: Array<{ text: string; passed: boolean; intent: string; reply?: string }>;
  report: {
    initialMessageStatus: string;
    replyReceived: boolean;
    keywordRecognized: boolean;
    campaignResponseStatus: string;
    mailingListSubscriptionStatus: string;
    mailingListName?: string;
    joinedAt?: string;
    tagStatus: string;
    tag?: string;
    confirmationMessageStatus: string;
    subscriptionCountForIdentity: number;
    duplicatePrevented: boolean;
    errors: string[];
  };
  note: string;
};

type Tab = "overview" | "inbox" | "contacts" | "automations" | "campaigns" | "knowledge" | "analytics" | "test" | "settings";
type NavIcon = "spark" | "inbox" | "people" | "flow" | "send" | "book" | "chart" | "lab" | "settings";

const tabs: Array<{ id: Tab; label: string; icon: NavIcon }> = [
  { id: "overview", label: "Overview", icon: "spark" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "contacts", label: "Contacts", icon: "people" },
  { id: "automations", label: "Automations", icon: "flow" },
  { id: "campaigns", label: "Campaigns", icon: "send" },
  { id: "knowledge", label: "Knowledge", icon: "book" },
  { id: "analytics", label: "Analytics", icon: "chart" },
  { id: "test", label: "Test Lab", icon: "lab" },
  { id: "settings", label: "Settings", icon: "settings" },
];

const brandColor: Record<BrandKey, string> = {
  marchitects: "#00d6c9",
  "social-following": "#8b5cf6",
  aafc: "#ff7a59",
};

const pageCopy: Record<Tab, { kicker: string; title: string; description: string }> = {
  overview: {
    kicker: "Live command center",
    title: "Every conversation, one clear signal.",
    description: "See what needs attention, what is converting, and what YoChat is handling across all three brands.",
  },
  inbox: {
    kicker: "Unified inbox",
    title: "People first. Threads second.",
    description: "Move quickly between active conversations, handoffs, and the context behind every reply.",
  },
  contacts: {
    kicker: "Audience intelligence",
    title: "Know who is leaning in.",
    description: "Review contact details, intent, tags, and relationship history without losing the human story.",
  },
  automations: {
    kicker: "Journey studio",
    title: "Build momentum on purpose.",
    description: "Tune the triggers, rules, and follow-ups that turn attention into meaningful action.",
  },
  campaigns: {
    kicker: "Campaign studio",
    title: "Launch with proof, not hope.",
    description: "Test the complete reply-to-list journey safely before a single real audience member sees it.",
  },
  knowledge: {
    kicker: "Brand intelligence",
    title: "Give every reply a point of view.",
    description: "Keep each brand’s facts, voice, and boundaries current so automation stays accurate and recognizable.",
  },
  analytics: {
    kicker: "Signal report",
    title: "See what people do next.",
    description: "Read the behavioral trail behind conversations, handoffs, opt-ins, and conversion intent.",
  },
  test: {
    kicker: "Safe test lab",
    title: "Break it here. Trust it everywhere.",
    description: "Exercise the full engine with realistic scenarios while every external delivery remains locked.",
  },
  settings: {
    kicker: "System controls",
    title: "Power with a safety switch.",
    description: "Manage brand behavior, data retention, integrations, scheduling, and operational boundaries.",
  },
};

function ago(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [brandFilter, setBrandFilter] = useState<BrandKey | "all">("all");
  const [testBrand, setTestBrand] = useState<BrandKey>("marchitects");
  const [testTrigger, setTestTrigger] = useState<TriggerType>("message");
  const [testText, setTestText] = useState("Hi, I’m interested. What services do you offer?");
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);
  const [evaluation, setEvaluation] = useState<{
    passed: number;
    total: number;
    healthy: boolean;
    evaluations: Array<{ name: string; brand: BrandKey; passed: boolean; detail: string }>;
  } | null>(null);
  const [campaignReply, setCampaignReply] = useState("Mailing List!");
  const [campaignVerification, setCampaignVerification] = useState<CampaignVerification | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [manualReply, setManualReply] = useState("");
  const [retentionDays, setRetentionDays] = useState(90);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/dashboard", { cache: "no-store" });
    if (response.status === 401) {
      location.href = "/login";
      return;
    }
    setData((await response.json()) as DashboardData);
  }, []);

  useEffect(() => {
    refresh().catch(() => setNotice("Dashboard data could not be loaded."));
    const timer = setInterval(() => refresh().catch(() => undefined), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (data) setRetentionDays(data.settings.retentionDays);
  }, [data?.settings.retentionDays]);

  async function action(payload: Record<string, unknown>, success = "Saved") {
    setBusy(true);
    setNotice("");
    const response = await fetch("/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!response.ok) {
      const error = (await response.json().catch(() => ({}))) as { error?: string };
      setNotice(error.error ?? "That action could not be completed.");
      return;
    }
    setNotice(success);
    await refresh();
  }

  const brandByKey = useMemo(
    () => Object.fromEntries((data?.brands ?? []).map((brand) => [brand.key, brand])) as Partial<Record<BrandKey, BrandConfig>>,
    [data],
  );
  const filteredContacts = (data?.contacts ?? []).filter((contact) => brandFilter === "all" || contact.brand === brandFilter);
  const filteredConversations = (data?.conversations ?? []).filter(
    (conversation) => brandFilter === "all" || conversation.brand === brandFilter,
  );
  const selectedConversation = filteredConversations.find((item) => item.id === selectedConversationId) ?? filteredConversations[0];
  const selectedContact = selectedConversation ? data?.contacts.find((item) => item.id === selectedConversation.contactId) : undefined;
  const selectedMessages = selectedConversation
    ? (data?.messages ?? []).filter((message) => message.conversationId === selectedConversation.id).slice().reverse()
    : [];
  const betaCampaign = data?.campaigns.find((campaign) => campaign.id === "aafc-mailing-list-beta");
  const betaEnrollment = data?.campaignEnrollments.find(
    (enrollment) => enrollment.campaignId === "aafc-mailing-list-beta",
  );
  const betaContact = betaEnrollment
    ? data?.contacts.find((contact) => contact.id === betaEnrollment.contactId)
    : undefined;
  const betaSubscription = betaContact
    ? data?.mailingListSubscriptions.find(
        (subscription) =>
          subscription.sourceCampaignId === "aafc-mailing-list-beta" &&
          (subscription.contactId === betaContact.id ||
            (Boolean(betaContact.email) &&
              subscription.email?.toLocaleLowerCase("en-US") === betaContact.email?.toLocaleLowerCase("en-US"))),
      )
    : undefined;
  const betaActivity = (data?.campaignActivity ?? [])
    .filter((activity) => activity.campaignId === "aafc-mailing-list-beta")
    .slice(0, 100);

  async function runTest() {
    setBusy(true);
    setTestResult(null);
    const response = await fetch("/api/admin/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: testBrand, trigger: testTrigger, text: testText, persona: "rashida-test-account" }),
    });
    const result = (await response.json()) as Record<string, unknown>;
    setBusy(false);
    setTestResult(result);
    setNotice(response.ok ? "Simulation completed. Nothing was sent to a real account." : String(result.error ?? "Test failed"));
    await refresh();
  }

  async function runEvaluation() {
    setBusy(true);
    setEvaluation(null);
    const response = await fetch("/api/admin/evaluate", { method: "POST" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setNotice(result.error ?? "The health suite could not run.");
      return;
    }
    setEvaluation(result);
    setNotice(result.healthy ? `All ${result.total} system checks passed.` : `${result.passed} of ${result.total} checks passed.`);
    await refresh();
  }

  async function campaignAction(
    actionName: "start" | "reply" | "run_full" | "reset",
    text?: string,
  ) {
    setBusy(true);
    setNotice("");
    if (actionName === "run_full") setCampaignVerification(null);
    const response = await fetch("/api/admin/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: actionName, text }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setNotice(result.error ?? "The campaign action could not be completed.");
      return;
    }
    if (actionName === "run_full") {
      setCampaignVerification(result as CampaignVerification);
      setNotice(
        result.ok
          ? `AAFC mailing-list beta passed all ${result.total} checks.`
          : `AAFC mailing-list beta passed ${result.passed} of ${result.total} checks.`,
      );
    } else if (actionName === "start") {
      setNotice("Beta invitation delivered to the internal AAFC test contact.");
    } else if (actionName === "reply") {
      setNotice(result.result?.reply ?? "Test reply processed.");
    } else {
      setCampaignVerification(null);
      setNotice("AAFC beta test data reset.");
    }
    await refresh();
  }

  async function sendManualReply(conversationId: string) {
    const text = manualReply.trim();
    if (!text || !confirm("Send this reply to the real Meta contact and pause automation for this conversation?")) return;
    setBusy(true);
    const response = await fetch("/api/admin/reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, text }),
    });
    const result = await response.json();
    setBusy(false);
    setNotice(result.ok ? "Manual reply sent. Automation is paused for this contact." : result.error ?? `Reply status: ${result.status}`);
    if (result.ok) setManualReply("");
    await refresh();
  }

  async function activateScheduler() {
    setBusy(true);
    const response = await fetch("/api/admin/scheduler", { method: "POST" });
    const result = await response.json();
    setBusy(false);
    setNotice(result.ok ? "Five-minute follow-up scheduler activated." : result.error ?? "Scheduler could not be activated.");
    await refresh();
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    location.href = "/login";
  }

  if (!data) return <main className="dashboard-loading">Opening Yochat Control Room…</main>;
  const activePage = pageCopy[tab];

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="brand-lockup">
          <span className="yochat-mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <div>
            <p className="dashboard-logo">YOCHAT</p>
            <p className="sidebar-subtitle">Signal Studio</p>
          </div>
        </div>
        <div className="workspace-card">
          <span className="workspace-avatar">R</span>
          <span><strong>Rashida’s workspace</strong><small>3 brands · live operations</small></span>
          <span className="workspace-chevron" aria-hidden="true">⌄</span>
        </div>
        <nav className="dashboard-nav" aria-label="Dashboard">
          {tabs.map((item) => (
            <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>
              <DashboardIcon name={item.icon} />
              <span>{item.label}</span>
              {item.id === "inbox" && data.handoffs.filter((handoff) => handoff.status !== "resolved").length > 0 ? (
                <span className="nav-count">{data.handoffs.filter((handoff) => handoff.status !== "resolved").length}</span>
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="system-mini-card">
            <span className={`system-live-dot ${data.storageMode}`} />
            <span><strong>{data.storageMode === "redis" ? "System live" : "Preview mode"}</strong><small>{data.storageMode === "redis" ? "Persistent storage connected" : "Connect storage before launch"}</small></span>
          </div>
          <button className="sidebar-signout" onClick={logout}><DashboardIcon name="settings" /><span>Sign out</span></button>
        </div>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-header">
          <div className="page-intro">
            <p className="eyebrow">{activePage.kicker}</p>
            <h2>{activePage.title}</h2>
            <p>{activePage.description}</p>
          </div>
          <div className="header-actions">
            <span className="live-pill"><span /> Live</span>
            <button
              className={data.settings.globalAutomationPaused ? "primary-button small" : "secondary-button"}
              disabled={busy}
              onClick={() => action(
                { action: "set_global_pause", paused: !data.settings.globalAutomationPaused },
                data.settings.globalAutomationPaused ? "All automations resumed" : "All automations paused",
              )}
            >
              {data.settings.globalAutomationPaused ? "Resume all" : "Pause all"}
            </button>
            <select aria-label="Filter by brand" onChange={(event) => setBrandFilter(event.target.value as BrandKey | "all")} value={brandFilter}>
              <option value="all">All brands</option>
              {data.brands.map((brand) => <option key={brand.key} value={brand.key}>{brand.shortName}</option>)}
            </select>
            <button className="secondary-button" disabled={busy} onClick={() => refresh()}>Refresh</button>
          </div>
        </header>

        {notice ? <div className="notice">{notice}</div> : null}
        {data.settings.globalAutomationPaused ? <div className="warning-card"><strong>Emergency pause is active.</strong> Incoming messages are recorded, but automated replies are stopped. STOP and START confirmations still work.</div> : null}

        {tab === "overview" ? (
          <>
            {data.storageMode === "memory" ? (
              <div className="warning-card"><strong>Preview storage is active.</strong> The dashboard works, but production history will persist only after the free Redis store is connected.</div>
            ) : null}
            <section className="signal-stage">
              <div className="signal-stage-copy">
                <p className="stage-label">Today’s signal</p>
                <h3>YoChat is listening across every brand.</h3>
                <p>
                  {data.messages.length} messages are in view, {data.handoffs.filter((item) => item.status !== "resolved").length} need a human,
                  and the delivery engine is {data.operational.failedJobs === 0 ? "running clean." : `tracking ${data.operational.failedJobs} failed jobs.`}
                </p>
                <div className="stage-actions">
                  <button className="ink-button" onClick={() => setTab("inbox")}>Open live inbox <span aria-hidden="true">↗</span></button>
                  <button className="ghost-button" onClick={() => setTab("test")}>Run a safe test</button>
                </div>
              </div>
              <div className="signal-stage-visual">
                <img src="/images/yochat-signal-studio.webp" alt="Creative director confidently managing conversations from her phone" />
                <div className="floating-signal">
                  <span className="signal-orbit" aria-hidden="true" />
                  <span><strong>Reply engine ready</strong><small>Instagram · Messenger · Test channel</small></span>
                </div>
              </div>
            </section>
            <div className="metric-grid">
              <Metric label="Contacts" value={data.contacts.length} />
              <Metric label="Conversations" value={data.conversations.length} />
              <Metric label="Open handoffs" value={data.handoffs.filter((item) => item.status !== "resolved").length} />
              <Metric label="Queued or failed jobs" value={data.jobs.filter((job) => job.status === "pending" || job.status === "failed").length} />
            </div>
            <section className="panel health-strip">
              <div><strong>Meta</strong><span>{data.operational.configured.meta && data.operational.configured.instagram ? "Connected" : "Needs attention"}</span></div>
              <div><strong>AI replies</strong><span>{data.operational.configured.ai ? "Ready" : "Safe fallback only"}</span></div>
              <div><strong>Storage</strong><span>{data.operational.configured.persistentStorage ? "Persistent" : "Awaiting connection"}</span></div>
              <div><strong>Scheduler</strong><span>{data.operational.configured.scheduler ? "Ready to activate" : "Awaiting connection"}</span></div>
              <div><strong>Delivery</strong><span>{data.operational.failedJobs === 0 ? "Healthy" : `${data.operational.failedJobs} failed`}</span></div>
            </section>
            <div className="brand-grid">
              {data.totalsByBrand.map((total) => (
                <article className="panel" key={total.brand} style={{ borderTopColor: brandColor[total.brand] }}>
                  <p className="panel-kicker">{brandByKey[total.brand]?.shortName}</p>
                  <h3>{total.contacts} contacts</h3>
                  <p>{total.conversations} conversations · {total.openHandoffs} handoffs</p>
                </article>
              ))}
            </div>
            <section className="panel table-panel">
              <div className="panel-heading"><h3>Recent activity</h3><button className="text-button" onClick={() => setTab("inbox")}>Open inbox</button></div>
              <MessageList messages={data.messages.slice(0, 12)} conversations={data.conversations} brands={brandByKey} />
            </section>
          </>
        ) : null}

        {tab === "inbox" ? (
          <div className="stack">
            <div className="inbox-layout">
              <section className="panel conversation-list">
                <div className="panel-heading"><h3>Conversations</h3><span>{filteredConversations.length}</span></div>
                {filteredConversations.length === 0 ? <Empty text="No conversations yet." /> : filteredConversations.map((conversation) => {
                  const contact = data.contacts.find((item) => item.id === conversation.contactId);
                  return <button className={selectedConversation?.id === conversation.id ? "conversation-item active" : "conversation-item"} key={conversation.id} onClick={() => setSelectedConversationId(conversation.id)}>
                    <span><strong>{contact?.username ?? contact?.name ?? contact?.externalId ?? "Unknown"}</strong><small>{conversation.summary || "New conversation"}</small></span>
                    <span className="row-meta"><span>{brandByKey[conversation.brand]?.shortName}</span><span>{ago(conversation.updatedAt)}</span></span>
                  </button>;
                })}
              </section>
              <section className="panel transcript-panel">
                {!selectedConversation ? <Empty text="Choose a conversation to view its transcript." /> : <>
                  <div className="panel-heading"><div><h3>{selectedContact?.username ?? selectedContact?.name ?? selectedContact?.externalId}</h3><span>{brandByKey[selectedConversation.brand]?.shortName} · {selectedConversation.channel} · {selectedConversation.status}</span></div>{selectedContact ? <button disabled={busy} onClick={() => action({ action: "toggle_contact", contactId: selectedContact.id }, selectedContact.automationPaused ? "Automation resumed" : "Automation paused")}>{selectedContact.automationPaused ? "Resume bot" : "Pause bot"}</button> : null}</div>
                  <div className="transcript">{selectedMessages.map((message) => <div className={`message-bubble ${message.direction}`} key={message.id}><span>{message.direction === "inbound" ? "Visitor" : message.metadata?.manual ? "Rashida" : "Yochat"}</span><p>{message.text}</p><small>{message.status} · {ago(message.createdAt)}</small></div>)}</div>
                  {selectedConversation.channel === "test" ? <div className="notice">This is a simulation. Test conversations cannot send real messages.</div> : <div className="manual-reply"><textarea placeholder="Write a manual reply…" rows={3} value={manualReply} onChange={(event) => setManualReply(event.target.value)} /><button className="primary-button small" disabled={busy || !manualReply.trim()} onClick={() => sendManualReply(selectedConversation.id)}>Review and send</button></div>}
                </>}
              </section>
            </div>
            <section className="panel table-panel">
              <div className="panel-heading"><h3>Human handoffs</h3><span>{data.handoffs.filter((item) => item.status !== "resolved").length} open</span></div>
              {data.handoffs.length === 0 ? <Empty text="No handoffs yet." /> : data.handoffs.map((handoff) => (
                <div className="list-row" key={handoff.id}>
                  <div><strong>{brandByKey[handoff.brand]?.shortName}</strong><p>{handoff.reason}{handoff.assignedTo ? ` · Assigned to ${handoff.assignedTo}` : ""}</p></div>
                  <div className="row-actions"><span className={`status-badge ${handoff.status}`}>{handoff.status}</span>{handoff.status === "open" ? <button disabled={busy} onClick={() => action({ action: "assign_handoff", handoffId: handoff.id, assignedTo: "Rashida" }, "Handoff assigned to Rashida")}>Assign</button> : null}{handoff.status !== "resolved" ? <button disabled={busy} onClick={() => action({ action: "resolve_handoff", handoffId: handoff.id }, "Handoff resolved")}>Resolve</button> : null}</div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {tab === "contacts" ? (
          <section className="panel table-panel">
            <div className="panel-heading"><div><h3>Contact CRM</h3><span>{filteredContacts.length} contacts</span></div><div className="row-actions"><a className="secondary-button" href={`/api/admin/export?format=csv${brandFilter === "all" ? "" : `&brand=${brandFilter}`}`}>Export contacts</a><a className="secondary-button" href={`/api/admin/export?format=json${brandFilter === "all" ? "" : `&brand=${brandFilter}`}`}>Download backup</a></div></div>
            {filteredContacts.length === 0 ? <Empty text="Contacts appear here after a test or live conversation." /> : filteredContacts.map((contact) => (
              <div className="contact-row" key={contact.id}>
                <div><strong>{contact.username ?? contact.name ?? contact.externalId}</strong><p>{contact.email ?? "No email"} · {contact.phone ?? "No phone"}</p><div className="tag-list">{contact.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div>
                <div className="row-meta"><span>{brandByKey[contact.brand]?.shortName}</span><span>{contact.channel}</span><span>{contact.leadStage}</span><span>{ago(contact.lastSeenAt)}</span></div>
                <div className="row-actions"><button disabled={busy} onClick={() => action({ action: "toggle_contact", contactId: contact.id }, contact.automationPaused ? "Automation resumed" : "Automation paused")}>{contact.automationPaused ? "Resume" : "Pause"}</button><button className="danger-button" disabled={busy} onClick={() => confirm("Delete this contact and their conversation history?") && action({ action: "delete_contact", contactId: contact.id }, "Contact deleted")}>Delete</button></div>
              </div>
            ))}
          </section>
        ) : null}

        {tab === "automations" ? (
          <div className="stack">
            {data.brands.filter((brand) => brandFilter === "all" || brand.key === brandFilter).map((brand) => (
              <section className="panel" key={brand.key}>
                <div className="panel-heading"><div><p className="panel-kicker">{brand.shortName}</p><h3>Triggers and rules</h3></div><span>{brand.rules.filter((rule) => rule.enabled).length} active</span></div>
                <div className="rule-grid">{brand.rules.map((rule) => <RuleCard brand={brand} busy={busy} key={rule.id} onSave={(rules) => action({ action: "update_brand", brand: brand.key, rules }, "Automation updated")} rule={rule} />)}</div>
              </section>
            ))}
            <section className="panel">
              <div className="panel-heading"><h3>Follow-up sequences</h3><span>{data.sequences.filter((sequence) => sequence.enabled).length} active</span></div>
              <div className="rule-grid">{data.sequences.map((sequence) => <article className="rule-card" key={sequence.id}><div><strong>{sequence.name}</strong><p>{brandByKey[sequence.brand]?.shortName} · {sequence.steps.length} steps</p></div><span className={`status-badge ${sequence.enabled ? "open" : "resolved"}`}>{sequence.enabled ? "Active" : "Off"}</span>{sequence.steps.map((step) => <small key={step.id}>{step.delayMinutes} min · {step.text}</small>)}</article>)}</div>
            </section>
          </div>
        ) : null}

        {tab === "campaigns" ? (
          <div className="stack">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">AAFC · TEST AUDIENCE ONLY</p>
                  <h3>{betaCampaign?.name ?? "AAFC — YoChat Mailing List Beta"}</h3>
                </div>
                <span className="status-badge open">{betaCampaign?.status ?? "beta"}</span>
              </div>
              <div className="warning-card">
                This campaign is locked to Yochat’s internal test channel. It cannot send to AAFC’s full contact list while its audience is set to test-only.
              </div>
              <div className="two-fields">
                <div className="reply-preview">
                  <span>Initial campaign message</span>
                  <p>{betaCampaign?.initialMessage ?? "Reply MAILING LIST to join our mailing list."}</p>
                </div>
                <div className="reply-preview">
                  <span>Confirmation message</span>
                  <p>{betaCampaign?.confirmationMessage}</p>
                </div>
              </div>
              <dl>
                <dt>Keyword</dt><dd>{betaCampaign?.keyword ?? "MAILING LIST"}</dd>
                <dt>Match behavior</dt><dd>Case-insensitive · punctuation ignored · extra spaces collapsed · exact phrase required</dd>
                <dt>Mailing list</dt><dd>{betaCampaign?.mailingListName ?? "AAFC Mailing List"}</dd>
                <dt>Tag</dt><dd>{betaCampaign?.tag ?? "YoChat Mailing List Beta"}</dd>
                <dt>Audience</dt><dd>{betaCampaign?.audience ?? "test-only"}</dd>
              </dl>
              <div className="button-row">
                <button className="secondary-button" disabled={busy} onClick={() => campaignAction("start")}>
                  Deliver beta invitation
                </button>
                <button className="primary-button" disabled={busy} onClick={() => campaignAction("run_full")}>
                  {busy ? "Running beta checks…" : "Run complete beta test"}
                </button>
                <button className="danger-button" disabled={busy} onClick={() => campaignAction("reset")}>
                  Reset beta test
                </button>
              </div>
            </section>

            <div className="test-grid">
              <section className="panel test-console">
                <div className="panel-heading"><h3>Manual reply test</h3><span className="status-badge open">Safe</span></div>
                <p>Use the internal AAFC beta contact to try matching and non-matching replies without sending externally.</p>
                <label className="field-label">Recipient reply
                  <textarea rows={4} value={campaignReply} onChange={(event) => setCampaignReply(event.target.value)} />
                </label>
                <div className="button-row">
                  <button className="primary-button" disabled={busy || !campaignReply.trim() || !betaEnrollment} onClick={() => campaignAction("reply", campaignReply.trim())}>
                    Process reply
                  </button>
                  {["Mailing List", "MAILING LIST", "mailing list", "Mailing List!", "Something else"].map((sample) => (
                    <button key={sample} onClick={() => setCampaignReply(sample)}>{sample}</button>
                  ))}
                </div>
              </section>
              <section className="panel test-result">
                <div className="panel-heading"><h3>Current beta status</h3></div>
                <dl>
                  <dt>Test contact</dt><dd>{betaContact?.name ?? "Not started"}</dd>
                  <dt>Initial message</dt><dd>{betaEnrollment ? "Delivered — internal test mode" : "Not delivered"}</dd>
                  <dt>Reply status</dt><dd>{betaEnrollment?.responseStatus ?? "awaiting start"}</dd>
                  <dt>Mailing-list status</dt><dd>{betaSubscription?.status ?? "not subscribed"}</dd>
                  <dt>Tag status</dt><dd>{betaContact?.tags.includes(betaCampaign?.tag ?? "") ? "Applied" : "Not applied"}</dd>
                  <dt>Joined</dt><dd>{betaSubscription?.joinedAt ?? "Not yet"}</dd>
                  <dt>Duplicate entries</dt><dd>{betaSubscription ? "1 — duplicate guard active" : "0"}</dd>
                </dl>
              </section>
            </div>

            {campaignVerification ? (
              <section className="panel">
                <div className="panel-heading">
                  <div><p className="panel-kicker">VERIFICATION REPORT</p><h3>{campaignVerification.passed} of {campaignVerification.total} checks passed</h3></div>
                  <span className={`status-badge ${campaignVerification.ok ? "open" : "failed"}`}>{campaignVerification.ok ? "Verified" : "Needs attention"}</span>
                </div>
                <div className={campaignVerification.ok ? "success-card" : "warning-card"}>
                  <strong>{campaignVerification.note}</strong>
                </div>
                <div className="evaluation-grid">
                  {campaignVerification.checks.map((check) => (
                    <div className="evaluation-row" key={check.name}>
                      <span className={check.passed ? "dot ok" : "dot"} />
                      <div><strong>{check.name}</strong><p>{check.detail}</p></div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="panel table-panel">
              <div className="panel-heading"><h3>Campaign activity log</h3><span>{betaActivity.length}</span></div>
              {betaActivity.length === 0 ? <Empty text="Start or run the beta campaign to create activity." /> : betaActivity.map((activity) => (
                <div className="list-row" key={activity.id}>
                  <div><strong>{activity.type.replaceAll("_", " ")}</strong><p>{activity.detail}</p></div>
                  <div className="row-meta"><span>{activity.status}</span><span>{ago(activity.createdAt)}</span></div>
                </div>
              ))}
            </section>
          </div>
        ) : null}

        {tab === "knowledge" ? (
          <div className="stack">{data.brands.filter((brand) => brandFilter === "all" || brand.key === brandFilter).map((brand) => <KnowledgeEditor brand={brand} busy={busy} key={brand.key} onSave={(knowledge) => action({ action: "update_brand", brand: brand.key, knowledge }, "Knowledge saved")} />)}</div>
        ) : null}

        {tab === "analytics" ? (
          <AnalyticsPanel analytics={data.analytics.filter((event) => brandFilter === "all" || event.brand === brandFilter)} brands={brandByKey} />
        ) : null}

        {tab === "test" ? (
          <div className="stack"><div className="test-grid">
            <section className="panel test-console">
              <div className="panel-heading"><div><p className="panel-kicker">NO REAL MESSAGES</p><h3>Rashida Test Account</h3></div><span className="status-badge open">Safe</span></div>
              <p>Run any message, comment, story, referral, follow, or postback through the complete engine. It creates test CRM records and analytics but never sends externally.</p>
              <label className="field-label">Brand<select value={testBrand} onChange={(event) => setTestBrand(event.target.value as BrandKey)}>{data.brands.map((brand) => <option key={brand.key} value={brand.key}>{brand.name}</option>)}</select></label>
              <label className="field-label">Trigger<select value={testTrigger} onChange={(event) => setTestTrigger(event.target.value as TriggerType)}>{["message", "comment", "story_reply", "mention", "postback", "referral", "follow", "test"].map((trigger) => <option key={trigger} value={trigger}>{trigger.replace("_", " ")}</option>)}</select></label>
              <label className="field-label">Test message<textarea rows={5} value={testText} onChange={(event) => setTestText(event.target.value)} /></label>
              <div className="button-row"><button className="primary-button" disabled={busy || !testText.trim()} onClick={runTest}>{busy ? "Running…" : "Run simulation"}</button><button className="secondary-button" disabled={busy} onClick={() => action({ action: "reset_test" }, "Test history cleared")}>Clear test data</button></div>
              <div className="sample-buttons"><span>Try:</span>{["How much does it cost?", "I want a human", "STOP", "I want to volunteer", "GROW", "My email is test@example.com"].map((sample) => <button key={sample} onClick={() => setTestText(sample)}>{sample}</button>)}</div>
            </section>
            <section className="panel test-result">
              <div className="panel-heading"><h3>Simulation result</h3></div>
              {!testResult ? <Empty text="Run a simulation to see the detected intent, reply, CRM profile, and handoff behavior." /> : <>
                <dl><dt>Brand</dt><dd>{String(testResult.brand)}</dd><dt>Detected intent</dt><dd>{String(testResult.intent)}</dd><dt>Status</dt><dd>{testResult.ignored ? `Ignored: ${String(testResult.ignored)}` : "Processed"}</dd></dl>
                <div className="reply-preview"><span>Automated reply</span><p>{String(testResult.reply ?? "No reply generated")}</p></div>
                {testResult.handoff ? <div className="warning-card">A human handoff was created and automation was paused for this test contact.</div> : null}
              </>}
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading"><div><p className="panel-kicker">ONE-CLICK DIAGNOSTICS</p><h3>Full system health suite</h3></div><button className="primary-button small" disabled={busy} onClick={runEvaluation}>{busy ? "Checking…" : "Run all checks"}</button></div>
            <p>Tests booking, pricing, comment keywords, lead magnets, volunteering, partnerships, lead capture, handoffs, STOP/START, and duplicate protection. No real messages are sent.</p>
            {evaluation ? <><div className={evaluation.healthy ? "success-card" : "warning-card"}><strong>{evaluation.passed} of {evaluation.total} checks passed.</strong></div><div className="evaluation-grid">{evaluation.evaluations.map((item) => <div className="evaluation-row" key={`${item.brand}-${item.name}`}><span className={item.passed ? "dot ok" : "dot"} /><div><strong>{item.name}</strong><p>{brandByKey[item.brand]?.shortName} · {item.detail}</p></div></div>)}</div></> : null}
          </section></div>
        ) : null}

        {tab === "settings" ? (
          <div className="stack">
            <section className="panel settings-form"><div className="panel-heading"><div><p className="panel-kicker">OPERATIONS</p><h3>Safety and retention</h3></div></div><p>The emergency switch stops automated replies across every brand while continuing to record incoming activity. Retention cleanup preserves open handoffs.</p><div className="two-fields"><label className="field-label">Automatic data retention (days)<input max={365} min={7} type="number" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value))} /></label><div className="field-label">Global automation<button className={data.settings.globalAutomationPaused ? "primary-button small" : "secondary-button"} disabled={busy} onClick={() => action({ action: "set_global_pause", paused: !data.settings.globalAutomationPaused }, data.settings.globalAutomationPaused ? "All automations resumed" : "All automations paused")}>{data.settings.globalAutomationPaused ? "Resume all brands" : "Pause all brands"}</button></div></div><button className="secondary-button" disabled={busy} onClick={() => action({ action: "set_retention", days: retentionDays }, "Retention setting saved")}>Save retention</button></section>
            {data.brands.filter((brand) => brandFilter === "all" || brand.key === brandFilter).map((brand) => <BrandEditor brand={brand} busy={busy} key={brand.key} onSave={(update) => action({ action: "update_brand", brand: brand.key, ...update }, "Brand settings saved")} />)}
            <section className="panel"><div className="panel-heading"><div><p className="panel-kicker">INTEGRATIONS</p><h3>Connection points</h3></div><button className="primary-button small" disabled={busy || !data.operational.configured.scheduler} onClick={activateScheduler}>{data.operational.configured.scheduler ? "Activate scheduler" : "Connect scheduler first"}</button></div><p>Qualified leads and human handoffs can be forwarded to a CRM, spreadsheet automation, email workflow, or another webhook endpoint.</p><p>The scheduler checks follow-ups every five minutes and automatically stops them outside Meta’s messaging window.</p></section>
            <section className="panel table-panel"><div className="panel-heading"><h3>Audit history</h3><span>{data.audits.length}</span></div>{data.audits.length === 0 ? <Empty text="Administrative changes will appear here." /> : data.audits.slice(0, 100).map((audit) => <div className="list-row" key={audit.id}><div><strong>{audit.action.replaceAll(".", " ")}</strong><p>{audit.target ?? "System setting"}</p></div><div className="row-meta"><span>{audit.actor}</span><span>{ago(audit.createdAt)}</span></div></div>)}</section>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function DashboardIcon({ name }: { name: NavIcon }) {
  const paths: Record<NavIcon, ReactNode> = {
    spark: <><path d="M12 2.5 14 9l6.5 2-6.5 2-2 6.5-2-6.5-6.5-2L10 9l2-6.5Z" /><path d="m18 3 .7 2.3L21 6l-2.3.7L18 9l-.7-2.3L15 6l2.3-.7L18 3Z" /></>,
    inbox: <><path d="M4 5.5h16v13H4z" /><path d="M4 14h4l1.5 2h5L16 14h4" /></>,
    people: <><path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /><path d="M3.5 19v-2.2c0-2 2.2-3.8 5-3.8s5 1.8 5 3.8V19" /><path d="M16 11a2.5 2.5 0 1 0 0-5" /><path d="M16 13c2.5 0 4.5 1.5 4.5 3.4V19" /></>,
    flow: <><rect x="3" y="4" width="7" height="5" rx="1" /><rect x="14" y="15" width="7" height="5" rx="1" /><path d="M10 6.5h4a3 3 0 0 1 3 3V15" /><path d="m14.5 12.5 2.5 2.5 2.5-2.5" /></>,
    send: <><path d="m3 11 17-7-7 17-2.5-7.5L3 11Z" /><path d="m10.5 13.5 4-4" /></>,
    book: <><path d="M4 4.5h6.5c1.2 0 2 .8 2 2V20c0-1.3-.8-2-2-2H4z" /><path d="M20 4.5h-5.5c-1.2 0-2 .8-2 2V20c0-1.3.8-2 2-2H20z" /></>,
    chart: <><path d="M4 19V9" /><path d="M10 19V4" /><path d="M16 19v-7" /><path d="M22 19H2" /></>,
    lab: <><path d="M9 3h6" /><path d="M10 3v5l-5 9a2.5 2.5 0 0 0 2.2 3.7h9.6A2.5 2.5 0 0 0 19 17l-5-9V3" /><path d="M7.5 15h9" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></>,
  };
  return <svg aria-hidden="true" className="dashboard-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7">{paths[name]}</svg>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small><i /> Live total</small></article>;
}

function Empty({ text }: { text: string }) {
  return <p className="empty-state">{text}</p>;
}

function MessageList({ messages, conversations, brands }: { messages: MessageRecord[]; conversations: Conversation[]; brands: Partial<Record<BrandKey, BrandConfig>> }) {
  return <>{messages.map((message) => { const conversation = conversations.find((item) => item.id === message.conversationId); return <div className="list-row" key={message.id}><div><strong>{message.direction === "inbound" ? "Visitor" : "Yochat"}</strong><p>{message.text}</p></div><div className="row-meta"><span>{conversation ? brands[conversation.brand]?.shortName : ""}</span><span>{message.intent ?? message.trigger}</span><span>{ago(message.createdAt)}</span></div></div>; })}</>;
}

function RuleCard({ brand, rule, busy, onSave }: { brand: BrandConfig; rule: AutomationRule; busy: boolean; onSave: (rules: AutomationRule[]) => void }) {
  function toggle() { onSave(brand.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item)); }
  return <article className="rule-card"><div><strong>{rule.name}</strong><p>{rule.triggers.join(", ")}</p></div><button className={rule.enabled ? "toggle-button on" : "toggle-button"} disabled={busy} onClick={toggle}>{rule.enabled ? "On" : "Off"}</button><small>Keywords: {rule.keywords.join(", ") || "Any"}</small></article>;
}

function KnowledgeEditor({ brand, busy, onSave }: { brand: BrandConfig; busy: boolean; onSave: (knowledge: BrandConfig["knowledge"]) => void }) {
  const [entries, setEntries] = useState(brand.knowledge);
  useEffect(() => setEntries(brand.knowledge), [brand.knowledge]);
  return <section className="panel"><div className="panel-heading"><div><p className="panel-kicker">{brand.shortName}</p><h3>Verified knowledge</h3></div><button className="primary-button small" disabled={busy} onClick={() => onSave(entries)}>Save knowledge</button></div><div className="knowledge-grid">{entries.map((entry, index) => <label className="knowledge-card" key={entry.id}><span>{entry.title}</span><textarea rows={5} value={entry.content} onChange={(event) => setEntries(entries.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} /></label>)}</div></section>;
}

function BrandEditor({ brand, busy, onSave }: { brand: BrandConfig; busy: boolean; onSave: (update: Partial<BrandConfig>) => void }) {
  const [voice, setVoice] = useState(brand.voice);
  const [description, setDescription] = useState(brand.description);
  const [disclosure, setDisclosure] = useState(brand.disclosure);
  const [website, setWebsite] = useState(brand.website ?? "");
  const [bookingUrl, setBookingUrl] = useState(brand.bookingUrl ?? "");
  const [automationEnabled, setAutomationEnabled] = useState(brand.automationEnabled);
  useEffect(() => {
    setVoice(brand.voice);
    setDescription(brand.description);
    setDisclosure(brand.disclosure);
    setWebsite(brand.website ?? "");
    setBookingUrl(brand.bookingUrl ?? "");
    setAutomationEnabled(brand.automationEnabled);
  }, [brand]);
  return <section className="panel settings-form">
    <div className="panel-heading"><div><p className="panel-kicker">{brand.shortName}</p><h3>Brand intelligence</h3></div><div className="row-actions"><button className={automationEnabled ? "toggle-button on" : "toggle-button"} disabled={busy} onClick={() => setAutomationEnabled(!automationEnabled)}>{automationEnabled ? "Automation on" : "Automation off"}</button><button className="primary-button small" disabled={busy} onClick={() => onSave({ voice, description, disclosure, website, bookingUrl, automationEnabled })}>Save settings</button></div></div>
    <label className="field-label">Description<textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
    <label className="field-label">Voice<textarea rows={3} value={voice} onChange={(event) => setVoice(event.target.value)} /></label>
    <label className="field-label">Automation disclosure<textarea rows={2} value={disclosure} onChange={(event) => setDisclosure(event.target.value)} /></label>
    <div className="two-fields"><label className="field-label">Website<input value={website} onChange={(event) => setWebsite(event.target.value)} /></label><label className="field-label">Booking link<input value={bookingUrl} onChange={(event) => setBookingUrl(event.target.value)} /></label></div>
  </section>;
}

function AnalyticsPanel({ analytics, brands }: { analytics: AnalyticsEvent[]; brands: Partial<Record<BrandKey, BrandConfig>> }) {
  const counts = analytics.reduce<Record<string, number>>((result, event) => { result[event.name] = (result[event.name] ?? 0) + 1; return result; }, {});
  return <><div className="metric-grid">{Object.entries(counts).map(([name, count]) => <Metric key={name} label={name.replaceAll("_", " ")} value={count} />)}</div><section className="panel table-panel"><div className="panel-heading"><h3>Event history</h3><span>{analytics.length}</span></div>{analytics.slice(0, 200).map((event) => <div className="list-row" key={event.id}><div><strong>{event.name.replaceAll("_", " ")}</strong><p>{event.metadata ? JSON.stringify(event.metadata) : "Recorded"}</p></div><div className="row-meta"><span>{brands[event.brand]?.shortName}</span><span>{event.channel}</span><span>{ago(event.createdAt)}</span></div></div>)}</section></>;
}
