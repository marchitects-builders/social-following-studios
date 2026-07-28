"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      setError(result.error ?? "That password did not work.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="auth-main">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">YOCHAT CONTROL ROOM</p>
        <h1>Welcome, Rashida.</h1>
        <p className="lede">Manage all three brands, conversations, automations, leads, and tests from one place.</p>
        <label className="field-label">
          Dashboard password
          <input autoComplete="current-password" autoFocus onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={loading || !password} type="submit">
          {loading ? "Opening…" : "Open dashboard"}
        </button>
      </form>
    </main>
  );
}
