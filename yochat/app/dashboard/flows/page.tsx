import FlowsClient from "./FlowsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Flow Studio — YoChat" };

/**
 * Wave 8 — Flow Studio: the form-based (Stage 1) operator UI for flows.
 * Auth is enforced by app/dashboard/layout.tsx (redirects to /login).
 */
export default function FlowsPage() {
  return (
    <main className="dashboard-main">
      <div className="page-intro" style={{ padding: "32px 32px 0" }}>
        <p className="eyebrow">Journey studio</p>
        <h1>Flow Studio</h1>
        <p className="lede">
          Build flat, reviewable automation: draft freely, simulate safely, and publish only when you
          deliberately type the word. Published flows are read-only — every change starts as a draft.
        </p>
      </div>
      <FlowsClient />
    </main>
  );
}
