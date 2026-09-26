"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "../admin-fetch";
import type {
  BrandKey,
  FlowDefinition,
  FlowNode,
  FlowNodeType,
  FlowRunRecord,
  FlowValidationResult,
  TriggerType,
} from "@/lib/types";

/**
 * Wave 8 — Flow Studio: form-based (Stage 1) operator UI for flows.
 *
 * UX contract (Gemini R2, advisor round 2):
 * - Published flows open READ-ONLY with a green LIVE indicator. Edits are
 *   impossible; the only way forward is "Create Draft".
 * - The draft editor carries a persistent "EDITING A DRAFT — NOT LIVE" banner.
 * - Publishing requires the operator to type PUBLISH in a confirmation modal
 *   (enforced server-side via the `confirm` token on the publish action).
 * - Form builder stays FLAT: nested conditions surface the Wave 2
 *   "keep flows flat — use one condition as a router" warning prominently.
 * - Replay/debugger renders Wave 2 execution records: pinned version,
 *   step-by-step trace, and which node produced each outbound message.
 */

const TRIGGER_TYPES: TriggerType[] = ["message", "comment", "story_reply", "mention", "postback", "referral", "follow", "test"];

const NODE_META: Array<{ type: FlowNodeType; label: string; hint: string }> = [
  { type: "trigger", label: "Trigger", hint: "Entry point — which events start this flow." },
  { type: "send_text", label: "Send text", hint: "Send a static message to the contact." },
  { type: "condition", label: "Condition", hint: "Router: keep flows flat — one condition, no nesting." },
  { type: "ai_response", label: "AI response", hint: "Grounded AI reply from the brand's knowledge." },
  { type: "update_contact", label: "Update contact", hint: "Set tags and custom fields on the contact." },
  { type: "collect", label: "Collect", hint: "Capture email / phone / name from the reply." },
  { type: "delay", label: "Delay", hint: "Schedule a follow-up after N minutes." },
  { type: "wait", label: "Wait for reply", hint: "Pause until the contact replies or the timeout fires." },
  { type: "handoff", label: "Handoff", hint: "Hand the conversation to a human." },
  { type: "http_request", label: "HTTP request", hint: "Bounded outbound HTTP — allowlisted hosts only." },
  { type: "end", label: "End", hint: "Explicit end of the flow." },
];

const FLAT_WARNING_SNIPPET = "keep flows flat";

type FlowSummary = {
  id: string;
  brand: BrandKey;
  name: string;
  status: "draft" | "published" | "archived";
  version: number;
  nodeCount: number;
  updatedAt: string;
  publishedAt?: string;
};

type StudioTab = "flows" | "runs" | "debugger";

type TimelineMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  text: string;
  status: string;
  createdAt: string;
  metadata?: { flowId?: string; flowVersion?: number; nodeId?: string };
};

type TimelineData = {
  contact: { id: string; name?: string; username?: string; brand: BrandKey; tags: string[] };
  messages: TimelineMessage[];
  flowRuns: FlowRunRecord[];
};

function emptyNode(type: FlowNodeType, index: number): FlowNode {
  return { id: `n_${type}_${index}`, type, name: "", config: {} };
}

function predicateLabel(node: FlowNode): string {
  const predicate = node.config.predicate;
  if (!predicate) return "no predicate";
  return `${predicate.kind}${predicate.value ? ` = "${predicate.value}"` : ""}`;
}

function nodeSummary(node: FlowNode): string {
  switch (node.type) {
    case "trigger": {
      const trigger = node.config.trigger;
      if (!trigger) return "no trigger config";
      return `${trigger.triggerTypes.join(", ")}${trigger.keywords?.length ? ` · keywords: ${trigger.keywords.join(", ")}` : ""}`;
    }
    case "send_text":
      return node.config.text ? `"${node.config.text.slice(0, 80)}"` : "no text";
    case "condition":
      return predicateLabel(node);
    case "ai_response":
      return "grounded AI reply";
    case "update_contact": {
      const parts: string[] = [];
      if (node.config.tags?.length) parts.push(`tags: ${node.config.tags.join(", ")}`);
      const fieldCount = Object.keys(node.config.fields ?? {}).length;
      if (fieldCount) parts.push(`fields: ${fieldCount}`);
      return parts.join(" · ") || "no tags or fields";
    }
    case "collect":
      return `collect: ${(node.config.kinds ?? []).join(", ") || "none"}`;
    case "delay":
      return `+${node.config.minutes ?? "?"} min: "${(node.config.text ?? "").slice(0, 60)}"`;
    case "wait":
      return `wait up to ${node.config.timeoutMinutes ?? 1440} min${node.config.waitLabel ? ` (${node.config.waitLabel})` : ""}`;
    case "handoff":
      return node.config.reason ? `reason: ${node.config.reason.slice(0, 60)}` : "no reason";
    case "http_request":
      return `${(node.config.httpMethod ?? "GET").toUpperCase()} ${(node.config.httpUrl ?? "").slice(0, 60)}`;
    case "end":
      return "flow ends";
  }
}

function csvToList(value: string): string[] {
  return value.split(/[,\n]/).map((part) => part.trim()).filter(Boolean);
}

function keyValueToRecord(value: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    record[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return record;
}

function recordToKeyValue(record: Record<string, string>): string {
  return Object.entries(record).map(([key, value]) => `${key}=${value}`).join("\n");
}

export default function FlowsClient() {
  const [tab, setTab] = useState<StudioTab>("flows");
  const [flows, setFlows] = useState<FlowSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [selected, setSelected] = useState<FlowDefinition | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  // Draft editor state.
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftNodes, setDraftNodes] = useState<Record<string, FlowNode>>({});
  const [draftEntryId, setDraftEntryId] = useState("");
  const [validation, setValidation] = useState<FlowValidationResult | null>(null);
  const [newNodeType, setNewNodeType] = useState<FlowNodeType>("send_text");

  // Publish modal.
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishText, setPublishText] = useState("");

  // Dry-run.
  const [dryPersona, setDryPersona] = useState("Dry-run Deb");
  const [dryTrigger, setDryTrigger] = useState<TriggerType>("message");
  const [dryText, setDryText] = useState("Hi, I'm interested. What do you offer?");
  const [dryResult, setDryResult] = useState<Record<string, unknown> | null>(null);

  // Runs replay.
  const [runQueryId, setRunQueryId] = useState("");
  const [runQueryContact, setRunQueryContact] = useState("");
  const [runQueryFlow, setRunQueryFlow] = useState("");
  const [runs, setRuns] = useState<FlowRunRecord[]>([]);
  const [runDetail, setRunDetail] = useState<FlowRunRecord | null>(null);
  const [runFlowSnapshot, setRunFlowSnapshot] = useState<FlowDefinition | null>(null);

  // Debugger.
  const [debugContactId, setDebugContactId] = useState("");
  const [debugTimeline, setDebugTimeline] = useState<TimelineData | null>(null);

  const flowNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const flow of flows) map.set(flow.id, flow.name);
    return map;
  }, [flows]);

  const refreshFlows = useCallback(async () => {
    const response = await fetch("/api/admin/flows", { cache: "no-store" });
    if (response.status === 401) {
      location.href = "/login";
      return;
    }
    const payload = (await response.json()) as { flows?: FlowSummary[] };
    setFlows(payload.flows ?? []);
  }, []);

  useEffect(() => {
    refreshFlows().catch(() => setError("Flow list could not be loaded."));
  }, [refreshFlows]);

  async function postFlowAction(body: Record<string, unknown>): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
    const response = await adminFetch("/api/admin/flows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: response.ok, payload };
  }

  async function openFlow(flowId: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/admin/flows?flowId=${encodeURIComponent(flowId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { flow?: FlowDefinition };
      if (!response.ok || !payload.flow) throw new Error("Flow not found.");
      setSelectedId(flowId);
      setSelected(payload.flow);
      // Published flows always open read-only; drafts open the editor.
      setEditing(payload.flow.status !== "published");
      if (payload.flow.status !== "published") startDraftEditor(payload.flow);
      else {
        setValidation(null);
        setDryResult(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open the flow.");
    } finally {
      setBusy(false);
    }
  }

  function startDraftEditor(flow: FlowDefinition) {
    setDraftName(flow.name);
    setDraftDescription(flow.description ?? "");
    setDraftNodes(structuredClone(flow.nodes));
    setDraftEntryId(flow.entryNodeId);
    setValidation(null);
    setDryResult(null);
    setPublishText("");
    setPublishOpen(false);
  }

  function patchNode(id: string, patch: Partial<FlowNode>) {
    setDraftNodes((current) => ({ ...current, [id]: { ...current[id], ...patch } }));
  }

  function patchConfig(id: string, patch: Record<string, unknown>) {
    setDraftNodes((current) => {
      const node = current[id];
      if (!node) return current;
      return { ...current, [id]: { ...node, config: { ...node.config, ...patch } } };
    });
  }

  function addNode() {
    const index = Object.keys(draftNodes).length + 1;
    const node = emptyNode(newNodeType, index);
    // Ensure a unique id.
    let id = node.id;
    let suffix = index;
    while (draftNodes[id]) {
      suffix += 1;
      id = `n_${newNodeType}_${suffix}`;
    }
    node.id = id;
    setDraftNodes((current) => ({ ...current, [id]: node }));
    setNotice(`Added ${newNodeType} node "${id}". Wire its next-step routing below.`);
  }

  function removeNode(id: string) {
    setDraftNodes((current) => {
      const next = { ...current };
      delete next[id];
      // Detach any routing pointing at the removed node.
      for (const node of Object.values(next)) {
        for (const key of ["next", "nextTrue", "nextFalse", "nextSuccess", "nextFailure", "nextTimeout"] as const) {
          if (node[key] === id) node[key] = undefined;
        }
      }
      return next;
    });
    if (draftEntryId === id) setDraftEntryId("");
  }

  async function saveDraft(): Promise<boolean> {
    if (!selected) return false;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await postFlowAction({
        action: "update",
        flowId: selected.id,
        name: draftName,
        description: draftDescription,
        nodes: draftNodes,
        entryNodeId: draftEntryId,
      });
      if (!ok) throw new Error((payload.error as string) ?? "Save failed.");
      setSelected(payload.flow as FlowDefinition);
      setNotice("Draft saved. It is NOT live until you publish.");
      await refreshFlows();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function validateDraft() {
    const saved = await saveDraft();
    if (!saved || !selected) return;
    setBusy(true);
    try {
      const { ok, payload } = await postFlowAction({ action: "validate", flowId: selected.id });
      if (!ok) throw new Error((payload.error as string) ?? "Validation failed.");
      setValidation({ valid: payload.valid as boolean, errors: (payload.errors as string[]) ?? [], warnings: (payload.warnings as string[]) ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Validation failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await postFlowAction({ action: "create_draft", flowId: selected.id });
      if (!ok) throw new Error((payload.error as string) ?? "Create draft failed.");
      const draft = payload.flow as FlowDefinition;
      setSelectedId(draft.id);
      setSelected(draft);
      setEditing(true);
      startDraftEditor(draft);
      setNotice(`Draft created from v${selected.version}. The live version is untouched.`);
      await refreshFlows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Create draft failed.");
    } finally {
      setBusy(false);
    }
  }

  async function publishDraft() {
    if (!selected || publishText !== "PUBLISH") return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await postFlowAction({ action: "publish", flowId: selected.id, confirm: "PUBLISH" });
      if (!ok) throw new Error((payload.error as string) ?? "Publish failed.");
      const flow = payload.flow as FlowDefinition;
      setPublishOpen(false);
      setPublishText("");
      setEditing(false);
      setSelected(flow);
      setNotice(`Published as v${flow.version}. The draft editor is closed; the flow is now live and read-only.`);
      await refreshFlows();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publish failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unpublish() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await postFlowAction({ action: "unpublish", flowId: selected.id });
      if (!ok) throw new Error((payload.error as string) ?? "Unpublish failed.");
      setSelected(payload.flow as FlowDefinition);
      await refreshFlows();
      setNotice("Flow unpublished. It no longer triggers; the last published version is preserved in history.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unpublish failed.");
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const { ok, payload } = await postFlowAction({ action: "archive", flowId: selected.id });
      if (!ok) throw new Error((payload.error as string) ?? "Archive failed.");
      setSelected(payload.flow as FlowDefinition);
      await refreshFlows();
      setNotice("Flow archived.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Archive failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runDryRun() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveDraft();
      if (!saved) return;
      const { ok, payload } = await postFlowAction({
        action: "dry_run",
        flowId: selected.id,
        text: dryText,
        trigger: dryTrigger,
        contactName: dryPersona,
      });
      if (!ok) throw new Error((payload.error as string) ?? "Dry run failed.");
      setDryResult(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Dry run failed.");
    } finally {
      setBusy(false);
    }
  }

  async function searchRuns(mode: "list" | "by-id" | "by-contact" | "by-flow") {
    setBusy(true);
    setError("");
    try {
      let url = "/api/admin/flow-runs?limit=50";
      if (mode === "by-id" && runQueryId.trim()) url = `/api/admin/flow-runs?runId=${encodeURIComponent(runQueryId.trim())}`;
      else if (mode === "by-contact" && runQueryContact.trim()) url = `/api/admin/flow-runs?contactId=${encodeURIComponent(runQueryContact.trim())}`;
      else if (mode === "by-flow" && runQueryFlow.trim()) url = `/api/admin/flow-runs?flowId=${encodeURIComponent(runQueryFlow.trim())}&limit=50`;
      const response = await fetch(url, { cache: "no-store" });
      const payload = (await response.json()) as { run?: FlowRunRecord; runs?: FlowRunRecord[] };
      if (!response.ok) throw new Error("Run search failed.");
      if (payload.run) {
        setRuns([payload.run]);
        await openRunDetail(payload.run);
      } else {
        setRuns(payload.runs ?? []);
        setRunDetail(null);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Run search failed.");
    } finally {
      setBusy(false);
    }
  }

  async function openRunDetail(run: FlowRunRecord) {
    setRunDetail(run);
    setRunFlowSnapshot(null);
    // Load the flow so we can show the PINNED version snapshot this run
    // executed against (never the current live version).
    try {
      const response = await fetch(`/api/admin/flows?flowId=${encodeURIComponent(run.flowId)}`, { cache: "no-store" });
      const payload = (await response.json()) as { flow?: FlowDefinition };
      if (response.ok && payload.flow) setRunFlowSnapshot(payload.flow);
    } catch {
      // Snapshot lookup is best-effort; the run record itself is the source of truth.
    }
  }

  async function loadDebugTimeline() {
    if (!debugContactId.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/timeline?contactId=${encodeURIComponent(debugContactId.trim())}`, { cache: "no-store" });
      const payload = (await response.json()) as TimelineData & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Timeline lookup failed.");
      setDebugTimeline(payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Timeline lookup failed.");
      setDebugTimeline(null);
    } finally {
      setBusy(false);
    }
  }

  const orderedNodes = useMemo(() => Object.values(draftNodes), [draftNodes]);
  const flatWarnings = useMemo(
    () => (validation?.warnings ?? []).filter((warning) => warning.includes(FLAT_WARNING_SNIPPET)),
    [validation],
  );

  return (
    <div style={{ padding: "24px 32px 64px", maxWidth: 1100 }}>
      <div className="button-row" style={{ marginBottom: 20 }}>
        {(["flows", "runs", "debugger"] as StudioTab[]).map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={tab === candidate ? "primary-button small" : "secondary-button small"}
            onClick={() => setTab(candidate)}
          >
            {candidate === "flows" ? "Flows" : candidate === "runs" ? "Runs (replay)" : "Debugger"}
          </button>
        ))}
      </div>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {tab === "flows" && (
        <>
          {!selected && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="panel-kicker">FLOW LIBRARY</p>
                  <h3>All flows</h3>
                </div>
              </div>
              <div className="table-panel">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>Nodes</th>
                      <th>Updated</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {flows.map((flow) => (
                      <tr key={flow.id}>
                        <td>
                          <strong>{flow.name}</strong>
                          <br />
                          <span className="row-meta">
                            {flow.brand} · {flow.id}
                          </span>
                        </td>
                        <td>{statusBadge(flow.status)}</td>
                        <td>v{flow.version}</td>
                        <td>{flow.nodeCount}</td>
                        <td className="row-meta">{new Date(flow.updatedAt).toLocaleString()}</td>
                        <td>
                          <button type="button" className="text-button" onClick={() => openFlow(flow.id)} disabled={busy}>
                            {flow.status === "published" ? "View live" : "Open"}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {flows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="empty-state">
                          No flows yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {selected && (
            <>
              <div className="button-row" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className="secondary-button small"
                  onClick={() => {
                    setSelected(null);
                    setSelectedId("");
                    setEditing(false);
                    setValidation(null);
                    setDryResult(null);
                    setError("");
                    setNotice("");
                    refreshFlows();
                  }}
                >
                  ← All flows
                </button>
              </div>

              {selected.status === "published" ? (
                <PublishedReadOnlyView
                  flow={selected}
                  busy={busy}
                  onCreateDraft={createDraft}
                  onUnpublish={unpublish}
                  onArchive={archive}
                />
              ) : (
                <>
                  <div className="warning-card" role="alert">
                    <strong>EDITING A DRAFT — NOT LIVE.</strong> Nothing you change here reaches
                    contacts until you publish. The live version (if any) keeps running untouched.
                  </div>
                  <DraftEditor
                    flow={selected}
                    draftName={draftName}
                    setDraftName={setDraftName}
                    draftDescription={draftDescription}
                    setDraftDescription={setDraftDescription}
                    nodes={orderedNodes}
                    draftNodes={draftNodes}
                    draftEntryId={draftEntryId}
                    setDraftEntryId={setDraftEntryId}
                    newNodeType={newNodeType}
                    setNewNodeType={setNewNodeType}
                    onPatchNode={patchNode}
                    onPatchConfig={patchConfig}
                    onAddNode={addNode}
                    onRemoveNode={removeNode}
                    onSave={saveDraft}
                    onValidate={validateDraft}
                    validation={validation}
                    flatWarnings={flatWarnings}
                    busy={busy}
                    onOpenPublish={() => {
                      setPublishText("");
                      setPublishOpen(true);
                    }}
                    onArchive={archive}
                    // Dry-run surface.
                    dryPersona={dryPersona}
                    setDryPersona={setDryPersona}
                    dryTrigger={dryTrigger}
                    setDryTrigger={setDryTrigger}
                    dryText={dryText}
                    setDryText={setDryText}
                    dryResult={dryResult}
                    onRunDryRun={runDryRun}
                  />
                </>
              )}

              {publishOpen && (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-label="Confirm publish"
                  style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.6)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 50,
                    padding: 24,
                  }}
                  onClick={() => setPublishOpen(false)}
                >
                  <div className="panel" style={{ maxWidth: 520, width: "100%" }} onClick={(event) => event.stopPropagation()}>
                    <div className="panel-heading">
                      <div>
                        <p className="panel-kicker">IRREVERSIBLE · LIVE ROUTING</p>
                        <h3>Publish this draft?</h3>
                      </div>
                    </div>
                    <p>
                      Publishing makes version <strong>v{selected.version + 1}</strong> of{" "}
                      <strong>{draftName || selected.name}</strong> live immediately. Any existing
                      live version is replaced in the routing table. Contacts currently mid-flow stay
                      pinned to their version; new matches use this one.
                    </p>
                    <p className="warning-card">
                      Type <strong>PUBLISH</strong> below to confirm you are deliberately replacing the
                      live version.
                    </p>
                    <label className="field-label">
                      Confirmation
                      <input
                        value={publishText}
                        onChange={(event) => setPublishText(event.target.value)}
                        placeholder="type PUBLISH"
                        autoComplete="off"
                      />
                    </label>
                    <div className="button-row" style={{ marginTop: 16 }}>
                      <button type="button" className="secondary-button" onClick={() => setPublishOpen(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={busy || publishText !== "PUBLISH"}
                        onClick={publishDraft}
                      >
                        Publish live
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "runs" && (
        <RunsPanel
          busy={busy}
          runs={runs}
          runDetail={runDetail}
          runFlowSnapshot={runFlowSnapshot}
          runQueryId={runQueryId}
          setRunQueryId={setRunQueryId}
          runQueryContact={runQueryContact}
          setRunQueryContact={setRunQueryContact}
          runQueryFlow={runQueryFlow}
          setRunQueryFlow={setRunQueryFlow}
          onSearch={searchRuns}
          onOpenRun={openRunDetail}
          flowNames={flowNames}
        />
      )}

      {tab === "debugger" && (
        <DebuggerPanel
          busy={busy}
          debugContactId={debugContactId}
          setDebugContactId={setDebugContactId}
          timeline={debugTimeline}
          onLoad={loadDebugTimeline}
          flowNames={flowNames}
          onOpenRun={(run) => {
            setTab("runs");
            openRunDetail(run);
            setRuns((current) => (current.some((entry) => entry.id === run.id) ? current : [run, ...current]));
          }}
        />
      )}
    </div>
  );
}

function statusBadge(status: FlowSummary["status"]) {
  if (status === "published") {
    return (
      <span className="live-pill">
        <span />
        LIVE
      </span>
    );
  }
  if (status === "draft") {
    return <span className="status-badge resolved">DRAFT</span>;
  }
  return <span className="status-badge">ARCHIVED</span>;
}

function PublishedReadOnlyView({
  flow,
  busy,
  onCreateDraft,
  onUnpublish,
  onArchive,
}: {
  flow: FlowDefinition;
  busy: boolean;
  onCreateDraft: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
}) {
  const nodes = Object.values(flow.nodes);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">READ-ONLY · LIVE VERSION</p>
          <h3>
            {flow.name} {statusBadge("published")}
          </h3>
          <p className="row-meta">
            v{flow.version} · {flow.brand} · {nodes.length} nodes · published{" "}
            {flow.publishedAt ? new Date(flow.publishedAt).toLocaleString() : "—"}
            {flow.publishedBy ? ` by ${flow.publishedBy}` : ""}
          </p>
        </div>
        <div className="button-row">
          <button type="button" className="primary-button small" onClick={onCreateDraft} disabled={busy}>
            Create Draft
          </button>
          <button type="button" className="secondary-button small" onClick={onUnpublish} disabled={busy}>
            Unpublish
          </button>
          <button type="button" className="danger-button small" onClick={onArchive} disabled={busy}>
            Archive
          </button>
        </div>
      </div>
      <p className="notice">
        This flow is LIVE and immutable. You cannot edit it here — click <strong>Create Draft</strong>{" "}
        to start a new editable draft derived from this exact version.
      </p>
      {flow.description && <p>{flow.description}</p>}
      <ReadOnlyNodeList nodes={nodes} entryNodeId={flow.entryNodeId} />
    </section>
  );
}

function ReadOnlyNodeList({ nodes, entryNodeId }: { nodes: FlowNode[]; entryNodeId: string }) {
  return (
    <ol className="stack">
      {nodes.map((node, index) => (
        <li key={node.id} className="card" style={{ listStyle: "none", opacity: node.id === entryNodeId ? 1 : 0.95 }}>
          <div className="row-meta">
            STEP {index + 1} · {node.id}
            {node.id === entryNodeId ? " · ENTRY" : ""}
          </div>
          <h4>
            {node.name || "(unnamed)"} — <span className="status-badge">{node.type}</span>
          </h4>
          <p>{nodeSummary(node)}</p>
          <p className="row-meta">routes: {routeSummary(node) || "end of path"}</p>
        </li>
      ))}
    </ol>
  );
}

function routeSummary(node: FlowNode): string {
  const parts: string[] = [];
  if (node.next) parts.push(`next → ${node.next}`);
  if (node.nextTrue) parts.push(`true → ${node.nextTrue}`);
  if (node.nextFalse) parts.push(`false → ${node.nextFalse}`);
  if (node.nextSuccess) parts.push(`success → ${node.nextSuccess}`);
  if (node.nextFailure) parts.push(`failure → ${node.nextFailure}`);
  if (node.nextTimeout) parts.push(`timeout → ${node.nextTimeout}`);
  return parts.join(" · ");
}

function DraftEditor(props: {
  flow: FlowDefinition;
  draftName: string;
  setDraftName: (value: string) => void;
  draftDescription: string;
  setDraftDescription: (value: string) => void;
  nodes: FlowNode[];
  draftNodes: Record<string, FlowNode>;
  draftEntryId: string;
  setDraftEntryId: (value: string) => void;
  newNodeType: FlowNodeType;
  setNewNodeType: (value: FlowNodeType) => void;
  onPatchNode: (id: string, patch: Partial<FlowNode>) => void;
  onPatchConfig: (id: string, patch: Record<string, unknown>) => void;
  onAddNode: () => void;
  onRemoveNode: (id: string) => void;
  onSave: () => void;
  onValidate: () => void;
  validation: FlowValidationResult | null;
  flatWarnings: string[];
  busy: boolean;
  onOpenPublish: () => void;
  onArchive: () => void;
  dryPersona: string;
  setDryPersona: (value: string) => void;
  dryTrigger: TriggerType;
  setDryTrigger: (value: TriggerType) => void;
  dryText: string;
  setDryText: (value: string) => void;
  dryResult: Record<string, unknown> | null;
  onRunDryRun: () => void;
}) {
  const {
    flow,
    draftName,
    setDraftName,
    draftDescription,
    setDraftDescription,
    nodes,
    draftNodes,
    draftEntryId,
    setDraftEntryId,
    newNodeType,
    setNewNodeType,
    onPatchNode,
    onPatchConfig,
    onAddNode,
    onRemoveNode,
    onSave,
    onValidate,
    validation,
    flatWarnings,
    busy,
    onOpenPublish,
    onArchive,
    dryPersona,
    setDryPersona,
    dryTrigger,
    setDryTrigger,
    dryText,
    setDryText,
    dryResult,
    onRunDryRun,
  } = props;

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">DRAFT EDITOR · v{flow.version} base</p>
            <h3>{draftName || flow.name}</h3>
          </div>
          <div className="button-row">
            <button type="button" className="secondary-button small" onClick={onSave} disabled={busy}>
              Save draft
            </button>
            <button type="button" className="secondary-button small" onClick={onValidate} disabled={busy}>
              Validate
            </button>
            <button
              type="button"
              className="primary-button small"
              onClick={onOpenPublish}
              disabled={busy || !(validation?.valid)}
              title={validation?.valid ? "Publish this draft live" : "Validate the draft first"}
            >
              Publish…
            </button>
            <button type="button" className="danger-button small" onClick={onArchive} disabled={busy}>
              Archive
            </button>
          </div>
        </div>

        <div className="two-fields">
          <label className="field-label">
            Flow name
            <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
          </label>
          <label className="field-label">
            Entry node
            <select value={draftEntryId} onChange={(event) => setDraftEntryId(event.target.value)}>
              <option value="">— select —</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.id} ({node.type})
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          Description
          <textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} rows={2} />
        </label>

        {flatWarnings.length > 0 && (
          <div className="warning-card" role="alert">
            <strong>Branching-blindness guard:</strong> this draft nests conditions. Keep flows flat —
            use one condition as a router.
            <ul>
              {flatWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {validation && (
          <div className={validation.valid ? "notice" : "form-error"} style={validation.valid ? undefined : { whiteSpace: "pre-wrap" }}>
            <strong>{validation.valid ? "Validation passed." : "Validation failed."}</strong>
            {validation.errors.map((entry) => (
              <div key={entry}>• {entry}</div>
            ))}
            {validation.warnings
              .filter((warning) => !warning.includes(FLAT_WARNING_SNIPPET))
              .map((entry) => (
                <div key={entry}>• warning: {entry}</div>
              ))}
          </div>
        )}

        <p className="panel-kicker" style={{ marginTop: 8 }}>
          NODE STEPS — VERTICAL LIST, NO CANVAS
        </p>
        <ol className="stack">
          {nodes.map((node, index) => (
            <NodeCard
              key={node.id}
              step={index + 1}
              node={node}
              nodeIds={Object.keys(draftNodes)}
              onPatchNode={onPatchNode}
              onPatchConfig={onPatchConfig}
              onRemove={onRemoveNode}
            />
          ))}
          {nodes.length === 0 && <li className="empty-state">No nodes yet — add the first one below.</li>}
        </ol>

        <div className="button-row" style={{ marginTop: 16 }}>
          <select
            value={newNodeType}
            onChange={(event) => setNewNodeType(event.target.value as FlowNodeType)}
            aria-label="Node type"
          >
            {NODE_META.map((meta) => (
              <option key={meta.type} value={meta.type}>
                {meta.label}
              </option>
            ))}
          </select>
          <button type="button" className="secondary-button small" onClick={onAddNode} disabled={busy}>
            Add node
          </button>
        </div>
        <p className="row-meta">
          {NODE_META.find((meta) => meta.type === newNodeType)?.hint} Branching rule: a condition routes to
          single paths — never put a condition inside another condition's branch.
        </p>
      </section>

      <section className="panel" style={{ marginTop: 20 }}>
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">DRY-RUN SIMULATOR</p>
            <h3>Try it before anyone real does</h3>
          </div>
        </div>
        <p className="notice">
          <strong>Simulation guarantee:</strong> a dry run executes against a synthetic contact only.{" "}
          <strong>No state was mutated, nothing was sent.</strong>
        </p>
        <div className="two-fields">
          <label className="field-label">
            Synthetic persona
            <input value={dryPersona} onChange={(event) => setDryPersona(event.target.value)} />
          </label>
          <label className="field-label">
            Trigger
            <select value={dryTrigger} onChange={(event) => setDryTrigger(event.target.value as TriggerType)}>
              {TRIGGER_TYPES.map((trigger) => (
                <option key={trigger} value={trigger}>
                  {trigger}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          Inbound message
          <textarea value={dryText} onChange={(event) => setDryText(event.target.value)} rows={2} />
        </label>
        <div className="button-row" style={{ marginTop: 12 }}>
          <button type="button" className="primary-button small" onClick={onRunDryRun} disabled={busy}>
            Run dry-run
          </button>
        </div>
        {dryResult && <DryRunResultView result={dryResult} />}
      </section>
    </>
  );
}


function NodeCard({
  step,
  node,
  nodeIds,
  onPatchNode,
  onPatchConfig,
  onRemove,
}: {
  step: number;
  node: FlowNode;
  nodeIds: string[];
  onPatchNode: (id: string, patch: Partial<FlowNode>) => void;
  onPatchConfig: (id: string, patch: Record<string, unknown>) => void;
  onRemove: (id: string) => void;
}) {
  const meta = NODE_META.find((entry) => entry.type === node.type);
  const routeOptions = nodeIds.filter((id) => id !== node.id);
  return (
    <li className="card" style={{ listStyle: "none" }}>
      <div className="row-meta">
        STEP {step} · {node.id}
      </div>
      <div className="two-fields">
        <label className="field-label">
          Label
          <input value={node.name ?? ""} onChange={(event) => onPatchNode(node.id, { name: event.target.value })} placeholder="(unnamed)" />
        </label>
        <label className="field-label">
          Type
          <select value={node.type} onChange={(event) => onPatchNode(node.id, { type: event.target.value as FlowNodeType })}>
            {NODE_META.map((entry) => (
              <option key={entry.type} value={entry.type}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="row-meta">{meta?.hint}</p>
      <NodeFields node={node} onPatchConfig={onPatchConfig} />
      {node.type === "condition" && (
        <p className="warning-card" style={{ marginTop: 8 }}>
          Condition = router. Keep flows flat — route each branch to a single path, never nest another
          condition inside. Need two decisions? Split into separate flows and jump between them.
        </p>
      )}
      <p className="panel-kicker" style={{ marginTop: 8 }}>
        ROUTING
      </p>
      <div className="two-fields">
        <RouteSelect label="Next" value={node.next} options={routeOptions} onChange={(value) => onPatchNode(node.id, { next: value })} />
        {node.type === "condition" && (
          <>
            <RouteSelect label="If true" value={node.nextTrue} options={routeOptions} onChange={(value) => onPatchNode(node.id, { nextTrue: value })} />
            <RouteSelect label="If false" value={node.nextFalse} options={routeOptions} onChange={(value) => onPatchNode(node.id, { nextFalse: value })} />
          </>
        )}
        {node.type === "collect" && (
          <>
            <RouteSelect label="On success" value={node.nextSuccess} options={routeOptions} onChange={(value) => onPatchNode(node.id, { nextSuccess: value })} />
            <RouteSelect label="On failure" value={node.nextFailure} options={routeOptions} onChange={(value) => onPatchNode(node.id, { nextFailure: value })} />
          </>
        )}
        {node.type === "wait" && (
          <RouteSelect label="On timeout" value={node.nextTimeout} options={routeOptions} onChange={(value) => onPatchNode(node.id, { nextTimeout: value })} />
        )}
      </div>
      <div className="button-row" style={{ marginTop: 8 }}>
        <button type="button" className="text-button" onClick={() => onRemove(node.id)}>
          Remove node
        </button>
      </div>
    </li>
  );
}

function RouteSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <label className="field-label">
      {label}
      <select value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
        <option value="">— none —</option>
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
    </label>
  );
}

function NodeFields({
  node,
  onPatchConfig,
}: {
  node: FlowNode;
  onPatchConfig: (id: string, patch: Record<string, unknown>) => void;
}) {
  const config = node.config;
  const set = (patch: Record<string, unknown>) => onPatchConfig(node.id, patch);
  switch (node.type) {
    case "trigger": {
      const trigger = config.trigger ?? { triggerTypes: [] as TriggerType[] };
      const toggleType = (type: TriggerType, checked: boolean) => {
        const current = trigger.triggerTypes ?? [];
        set({ trigger: { ...trigger, triggerTypes: checked ? [...current, type] : current.filter((entry) => entry !== type) } });
      };
      return (
        <>
          <div className="button-row" style={{ marginBottom: 8 }}>
            {TRIGGER_TYPES.map((type) => (
              <label key={type} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
                <input
                  type="checkbox"
                  checked={(trigger.triggerTypes ?? []).includes(type)}
                  onChange={(event) => toggleType(type, event.target.checked)}
                />
                {type}
              </label>
            ))}
          </div>
          <div className="two-fields">
            <label className="field-label">
              Keywords (comma-separated)
              <input
                value={(trigger.keywords ?? []).join(", ")}
                onChange={(event) => set({ trigger: { ...trigger, keywords: csvToList(event.target.value) } })}
              />
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
              <input
                type="checkbox"
                checked={trigger.firstMessageOnly ?? false}
                onChange={(event) => set({ trigger: { ...trigger, firstMessageOnly: event.target.checked } })}
              />
              First message only
            </label>
          </div>
        </>
      );
    }
    case "send_text":
      return (
        <>
          <label className="field-label">
            Text (supports {"{{contact.first_name}}"}, {"{{message}}"})
            <textarea value={config.text ?? ""} onChange={(event) => set({ text: event.target.value })} rows={3} />
          </label>
          <label className="field-label">
            Quick replies (comma-separated)
            <input
              value={(config.quickReplies ?? []).join(", ")}
              onChange={(event) => set({ quickReplies: csvToList(event.target.value) })}
            />
          </label>
        </>
      );
    case "condition": {
      const predicate = config.predicate ?? { kind: "contains" as const };
      return (
        <div className="two-fields">
          <label className="field-label">
            Predicate
            <select
              value={predicate.kind}
              onChange={(event) => set({ predicate: { ...predicate, kind: event.target.value as typeof predicate.kind } })}
            >
              <option value="contains">message contains</option>
              <option value="intent">intent is</option>
              <option value="has_tag">contact has tag</option>
              <option value="is_first_message">is first message</option>
              <option value="opted_out">contact opted out</option>
            </select>
          </label>
          <label className="field-label">
            Value
            <input
              value={predicate.value ?? ""}
              onChange={(event) => set({ predicate: { ...predicate, value: event.target.value } })}
              placeholder="e.g. price, pricing"
            />
          </label>
        </div>
      );
    }
    case "ai_response":
      return <p className="row-meta">Uses the brand's grounded AI path with the verified-knowledge constraint contract. No extra config.</p>;
    case "update_contact":
      return (
        <>
          <label className="field-label">
            Tags (comma-separated)
            <input
              value={(config.tags ?? []).join(", ")}
              onChange={(event) => set({ tags: csvToList(event.target.value) })}
            />
          </label>
          <label className="field-label">
            Fields (one per line: key=value)
            <textarea
              value={recordToKeyValue(config.fields ?? {})}
              onChange={(event) => set({ fields: keyValueToRecord(event.target.value) })}
              rows={3}
            />
          </label>
        </>
      );
    case "collect": {
      const kinds = config.kinds ?? [];
      const toggleKind = (kind: "email" | "phone" | "name", checked: boolean) => {
        set({ kinds: checked ? [...kinds, kind] : kinds.filter((entry) => entry !== kind) });
      };
      return (
        <div className="button-row">
          {(["email", "phone", "name"] as const).map((kind) => (
            <label key={kind} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: "0.85rem" }}>
              <input type="checkbox" checked={kinds.includes(kind)} onChange={(event) => toggleKind(kind, event.target.checked)} />
              {kind}
            </label>
          ))}
        </div>
      );
    }
    case "delay":
      return (
        <>
          <label className="field-label">
            Minutes
            <input
              type="number"
              min={1}
              value={config.minutes ?? ""}
              onChange={(event) => set({ minutes: Number(event.target.value) || undefined })}
            />
          </label>
          <label className="field-label">
            Follow-up text
            <textarea value={config.text ?? ""} onChange={(event) => set({ text: event.target.value })} rows={2} />
          </label>
        </>
      );
    case "wait":
      return (
        <div className="two-fields">
          <label className="field-label">
            Timeout (minutes)
            <input
              type="number"
              min={1}
              max={10080}
              value={config.timeoutMinutes ?? 1440}
              onChange={(event) => set({ timeoutMinutes: Number(event.target.value) || 1440 })}
            />
          </label>
          <label className="field-label">
            Label
            <input
              value={config.waitLabel ?? ""}
              onChange={(event) => set({ waitLabel: event.target.value })}
              placeholder="e.g. awaiting email reply"
            />
          </label>
        </div>
      );
    case "handoff":
      return (
        <label className="field-label">
          Handoff reason
          <input value={config.reason ?? ""} onChange={(event) => set({ reason: event.target.value })} />
        </label>
      );
    case "http_request":
      return (
        <>
          <div className="two-fields">
            <label className="field-label">
              Method
              <select value={config.httpMethod ?? "GET"} onChange={(event) => set({ httpMethod: event.target.value })}>
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              URL (literal host — must be allowlisted)
              <input value={config.httpUrl ?? ""} onChange={(event) => set({ httpUrl: event.target.value })} placeholder="https://…" />
            </label>
          </div>
          <label className="field-label">
            Headers (one per line: Name: value)
            <textarea
              value={recordToKeyValue(config.httpHeaders ?? {})}
              onChange={(event) => {
                const record: Record<string, string> = {};
                for (const line of event.target.value.split("\n")) {
                  const separator = line.indexOf(":");
                  if (separator > 0) record[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
                }
                set({ httpHeaders: record });
              }}
              rows={2}
            />
          </label>
          <label className="field-label">
            Body (supports {"{{secret:NAME}}"} placeholders)
            <textarea value={config.httpBody ?? ""} onChange={(event) => set({ httpBody: event.target.value })} rows={3} />
          </label>
        </>
      );
    case "end":
      return <p className="row-meta">The flow ends here — no further routing.</p>;
  }
}

function DryRunResultView({ result }: { result: Record<string, unknown> }) {
  const trace = (result.trace as Array<{ nodeId: string; nodeType: string; nodeName?: string; detail?: string; branch?: string }>) ?? [];
  const actions = (result.actions as Array<{ kind: string; nodeId: string; text?: string; detail?: string }>) ?? [];
  return (
    <div className="test-console" style={{ marginTop: 16 }}>
      <p className="panel-kicker">DRY-RUN RESULT · {String(result.version ?? "?")} · {String(result.status ?? "")}</p>
      <div className="test-result">
        <strong>Trace ({trace.length} steps)</strong>
        <ol>
          {trace.map((step, index) => (
            <li key={`${step.nodeId}-${index}`}>
              <strong>{step.nodeId}</strong> <span className="status-badge">{step.nodeType}</span>
              {step.nodeName ? ` ${step.nodeName}` : ""}
              {step.branch ? ` · branch: ${step.branch}` : ""}
              {step.detail ? ` — ${step.detail}` : ""}
            </li>
          ))}
        </ol>
        <strong>Actions that WOULD happen</strong>
        <ul>
          {actions.map((action, index) => (
            <li key={index}>
              <strong>{action.kind}</strong> (from node <strong>{action.nodeId}</strong>)
              {action.text ? ` — "${String(action.text).slice(0, 120)}"` : ""}
            </li>
          ))}
          {actions.length === 0 && <li>None.</li>}
        </ul>
        {typeof result.reply === "string" && result.reply && (
          <p>
            <strong>Reply preview:</strong> {result.reply.slice(0, 240)}
          </p>
        )}
        <p className="row-meta">
          stop reason: {String(result.stopReason ?? "—")} · completed: {String(result.completed ?? false)}
        </p>
      </div>
      <p className="notice" style={{ marginTop: 12 }}>
        <strong>No state was mutated, nothing was sent.</strong> This trace ran against a synthetic
        contact and was discarded.
      </p>
    </div>
  );
}

function RunsPanel(props: {
  busy: boolean;
  runs: FlowRunRecord[];
  runDetail: FlowRunRecord | null;
  runFlowSnapshot: FlowDefinition | null;
  runQueryId: string;
  setRunQueryId: (value: string) => void;
  runQueryContact: string;
  setRunQueryContact: (value: string) => void;
  runQueryFlow: string;
  setRunQueryFlow: (value: string) => void;
  onSearch: (mode: "list" | "by-id" | "by-contact" | "by-flow") => void;
  onOpenRun: (run: FlowRunRecord) => void;
  flowNames: Map<string, string>;
}) {
  const {
    busy,
    runs,
    runDetail,
    runFlowSnapshot,
    runQueryId,
    setRunQueryId,
    runQueryContact,
    setRunQueryContact,
    runQueryFlow,
    setRunQueryFlow,
    onSearch,
    onOpenRun,
    flowNames,
  } = props;
  const pinnedSnapshot = runDetail && runFlowSnapshot
    ? runFlowSnapshot.versions.find((snapshot) => snapshot.version === runDetail.flowVersion)
    : undefined;

  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="panel-kicker">EXECUTION RECORDS</p>
            <h3>Replay a flow run</h3>
          </div>
        </div>
        <p>
          Every live flow run is recorded with the <strong>pinned flow version</strong> it ran against,
          the node trace, and the actions it produced — answers "why did this contact receive this
          message?" Read-only.
        </p>
        <div className="two-fields">
          <label className="field-label">
            Run id
            <input value={runQueryId} onChange={(event) => setRunQueryId(event.target.value)} placeholder="run_…" />
          </label>
          <label className="field-label">
            Contact id
            <input value={runQueryContact} onChange={(event) => setRunQueryContact(event.target.value)} placeholder="contact_…" />
          </label>
        </div>
        <label className="field-label">
          Flow id
          <input value={runQueryFlow} onChange={(event) => setRunQueryFlow(event.target.value)} placeholder="flow_…" />
        </label>
        <div className="button-row" style={{ marginTop: 12 }}>
          <button type="button" className="secondary-button small" onClick={() => onSearch("list")} disabled={busy}>
            Latest runs
          </button>
          <button type="button" className="secondary-button small" onClick={() => onSearch("by-id")} disabled={busy || !runQueryId.trim()}>
            Find run
          </button>
          <button type="button" className="secondary-button small" onClick={() => onSearch("by-contact")} disabled={busy || !runQueryContact.trim()}>
            Runs for contact
          </button>
          <button type="button" className="secondary-button small" onClick={() => onSearch("by-flow")} disabled={busy || !runQueryFlow.trim()}>
            Runs for flow
          </button>
        </div>
      </section>

      {runs.length > 0 && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">RUNS</p>
              <h3>{runs.length} record{runs.length === 1 ? "" : "s"}</h3>
            </div>
          </div>
          <div className="table-panel">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Flow</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Started</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="row-meta">{run.id}</td>
                    <td>{flowNames.get(run.flowId) ?? run.flowId}</td>
                    <td>v{run.flowVersion}</td>
                    <td>
                      <span className="status-badge">{run.status}</span>
                    </td>
                    <td>{run.steps.length}</td>
                    <td className="row-meta">{new Date(run.startedAt).toLocaleString()}</td>
                    <td>
                      <button type="button" className="text-button" onClick={() => onOpenRun(run)}>
                        Replay
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {runDetail && (
        <section className="panel" style={{ marginTop: 20 }}>
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">RUN REPLAY · READ-ONLY</p>
              <h3>{runDetail.id}</h3>
              <p className="row-meta">
                flow {flowNames.get(runDetail.flowId) ?? runDetail.flowId} ·{" "}
                <strong>pinned v{runDetail.flowVersion}</strong> · {runDetail.brand} · contact{" "}
                {runDetail.contactId} · {runDetail.status} · started{" "}
                {new Date(runDetail.startedAt).toLocaleString()}
                {runDetail.completedAt ? ` · completed ${new Date(runDetail.completedAt).toLocaleString()}` : ""}
                {runDetail.stopReason ? ` · stop: ${runDetail.stopReason}` : ""}
              </p>
            </div>
          </div>
          {runDetail.replyPreview && (
            <p>
              <strong>Reply produced:</strong> {runDetail.replyPreview}
            </p>
          )}
          <p className="panel-kicker">NODE TRACE — STEP BY STEP</p>
          <ol className="stack">
            {runDetail.steps.map((step, index) => (
              <li key={index} className="card" style={{ listStyle: "none" }}>
                <div className="row-meta">
                  STEP {index + 1} · {step.at ? new Date(step.at).toLocaleTimeString() : ""}
                </div>
                <h4>
                  {step.nodeId} <span className="status-badge">{step.nodeType}</span>
                  {step.nodeName ? ` — ${step.nodeName}` : ""}
                </h4>
                <p>
                  {step.branch ? <strong>branch: {step.branch}. </strong> : ""}
                  {step.detail ?? "—"}
                </p>
              </li>
            ))}
            {runDetail.steps.length === 0 && <li className="empty-state">No trace steps recorded.</li>}
          </ol>
          <p className="panel-kicker">ACTIONS — WHICH NODE PRODUCED WHICH OUTBOUND EFFECT</p>
          <ul>
            {runDetail.actions.map((action, index) => (
              <li key={index}>
                <strong>{action.kind}</strong> — produced by node <strong>{action.nodeId}</strong>
                {action.detail ? ` · ${action.detail}` : ""}
              </li>
            ))}
            {runDetail.actions.length === 0 && <li className="row-meta">No actions recorded.</li>}
          </ul>
          <p className="panel-kicker">PINNED VERSION SNAPSHOT</p>
          {pinnedSnapshot ? (
            <>
              <p className="notice">
                This run executed against <strong>v{pinnedSnapshot.version}</strong> (published{" "}
                {new Date(pinnedSnapshot.publishedAt).toLocaleString()} by {pinnedSnapshot.publishedBy}).
                The current live version may differ — the snapshot below is what actually ran.
              </p>
              <ReadOnlyNodeList nodes={Object.values(pinnedSnapshot.nodes)} entryNodeId={pinnedSnapshot.entryNodeId} />
            </>
          ) : (
            <p className="row-meta">
              Pinned snapshot v{runDetail.flowVersion} is not in the flow's version history (history is
              capped at 20). The trace above is still complete.
            </p>
          )}
        </section>
      )}
    </>
  );
}

function DebuggerPanel(props: {
  busy: boolean;
  debugContactId: string;
  setDebugContactId: (value: string) => void;
  timeline: TimelineData | null;
  onLoad: () => void;
  flowNames: Map<string, string>;
  onOpenRun: (run: FlowRunRecord) => void;
}) {
  const { busy, debugContactId, setDebugContactId, timeline, onLoad, flowNames, onOpenRun } = props;
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">WHY DID THEY GET THIS MESSAGE?</p>
          <h3>Contact debugger</h3>
        </div>
      </div>
      <p>
        Enter a contact id: see their message timeline, and for every outbound message the exact flow
        run and node that produced it. Read-only.
      </p>
      <div className="button-row">
        <label className="field-label" style={{ flex: 1, minWidth: 260 }}>
          Contact id
          <input
            value={debugContactId}
            onChange={(event) => setDebugContactId(event.target.value)}
            placeholder="contact_…"
            onKeyDown={(event) => {
              if (event.key === "Enter") onLoad();
            }}
          />
        </label>
        <button type="button" className="primary-button small" onClick={onLoad} disabled={busy || !debugContactId.trim()}>
          Load timeline
        </button>
      </div>

      {timeline && (
        <>
          <p className="panel-kicker" style={{ marginTop: 16 }}>
            CONTACT
          </p>
          <p>
            <strong>{timeline.contact.name ?? timeline.contact.username ?? timeline.contact.id}</strong>{" "}
            <span className="row-meta">
              {timeline.contact.id} · {timeline.contact.brand} · tags: {timeline.contact.tags.join(", ") || "none"}
            </span>
          </p>
          <p className="panel-kicker">MESSAGE TIMELINE</p>
          <ol className="stack">
            {timeline.messages.map((message) => (
              <li key={message.id} className="card" style={{ listStyle: "none" }}>
                <div className="row-meta">
                  {new Date(message.createdAt).toLocaleString()} · {message.direction} · {message.status}
                </div>
                <p>{message.text}</p>
                {message.direction === "outbound" && message.metadata?.flowId && (
                  <p className="notice" style={{ marginBottom: 0 }}>
                    <strong>Why this message?</strong> Produced by flow{" "}
                    <strong>{flowNames.get(message.metadata.flowId) ?? message.metadata.flowId}</strong>
                    {message.metadata.flowVersion !== undefined ? ` v${message.metadata.flowVersion}` : ""}
                    {message.metadata.nodeId ? `, node ${message.metadata.nodeId}` : ""}. Find the full
                    trace in the run list below.
                  </p>
                )}
              </li>
            ))}
            {timeline.messages.length === 0 && <li className="empty-state">No messages.</li>}
          </ol>
          <p className="panel-kicker">FLOW RUNS FOR THIS CONTACT</p>
          <ul>
            {timeline.flowRuns.map((run) => (
              <li key={run.id}>
                <button type="button" className="text-button" onClick={() => onOpenRun(run)}>
                  Replay {run.id}
                </button>{" "}
                — {flowNames.get(run.flowId) ?? run.flowId} v{run.flowVersion} · {run.status} ·{" "}
                {run.steps.length} steps · {new Date(run.startedAt).toLocaleString()}
              </li>
            ))}
            {timeline.flowRuns.length === 0 && <li className="row-meta">No flow runs recorded.</li>}
          </ul>
        </>
      )}
    </section>
  );
}
